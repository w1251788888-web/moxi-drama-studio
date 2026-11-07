#!/usr/bin/env python3
"""S2.3 旧库快照：把运行期 SQLite + 旧工作区冻结成只读迁移输入。

做四件事：
1. 用 sqlite3 backup API 从**只读连接**（file:...?mode=ro）复制出快照 DB，保证 WAL 一致；
2. 生成 table-counts.json（全部表行数 + 关键表明细）；
3. 复制旧工作区（content_version.content_path / checkpoint.data_path 所在目录）到快照；
4. 记录只读探针结果、源库 sha256（前后一致）、引用文件的 sha256 校验。

用法：
    python3 snapshot_legacy.py \
        --db <旧库运行期路径> \
        --manifest <fixture-manifest.json> \
        --out analysis/migrate/legacy-snapshot
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

TZ = timezone(timedelta(hours=8))

KEY_TABLES = [
    "project_v2", "episode", "scene", "content_version", "checkpoint",
    "contribution_ledger", "evidence_event", "approval_task",
    "segment_reviews", "episode_segments", "step_gates",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 256), b""):
            h.update(chunk)
    return h.hexdigest()


def open_ro(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.resolve()}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    return con


def read_only_probe(db_path: Path) -> dict:
    """在只读连接上尝试写入，必须被 SQLite 拒绝（作为"旧库只读"的运行时证据）。"""
    con = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
    result = {"attempt": "CREATE TABLE s23_ro_probe(x INTEGER)", "blocked": False, "error": ""}
    try:
        con.execute("CREATE TABLE s23_ro_probe(x INTEGER)")
        result["error"] = "写入竟然成功（异常！）"
    except sqlite3.OperationalError as exc:
        result["blocked"] = True
        result["error"] = str(exc)
    finally:
        con.close()
    return result


def table_counts(con: sqlite3.Connection) -> dict:
    tables = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' order by name")]
    counts = {}
    for table in tables:
        counts[table] = con.execute(f'select count(*) from "{table}"').fetchone()[0]
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--manifest", required=True, help="create_legacy_fixture.py 产出的 fixture manifest")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    src_sha_before = sha256_file(db_path)
    src_mtime_before = db_path.stat().st_mtime_ns

    # 1) 快照 DB（backup API，从只读连接复制）
    con = open_ro(db_path)
    counts = table_counts(con)
    counts["_meta"] = {
        "tableCount": len([k for k in counts if not k.startswith("_")]),
        "capturedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "sourceDb": str(db_path),
        "sourceSha256": src_sha_before,
    }
    snap_db = out / "tasks.db"
    if snap_db.exists():
        snap_db.unlink()  # 快照目录是本脚本自己的输出目录，允许覆盖
    dst = sqlite3.connect(snap_db)
    con.backup(dst)
    dst.close()

    # 2) 验证快照 DB
    snap_counts = table_counts(open_ro(snap_db))
    for table, count in counts.items():
        if table.startswith("_meta"):
            continue
        if count and snap_counts.get(table) != count:
            failures.append(f"快照表计数不一致 {table}: source={count} snapshot={snap_counts.get(table)}")

    # 3) 复制旧工作区（fixture manifest 记录的项目 workspace 根）
    ws_src = Path(manifest["projectWorkspacePath"]).resolve()
    ws_dst = out / "workspace"
    if ws_dst.exists():
        shutil.rmtree(ws_dst)
    shutil.copytree(ws_src, ws_dst)
    ws_files = []
    for path in sorted(ws_dst.rglob("*")):
        if path.is_file():
            ws_files.append({"path": str(path.relative_to(ws_dst)),
                             "bytes": path.stat().st_size,
                             "sha256": sha256_file(path)})

    # 4) 旧库引用的文件必须都进了快照，且 hash 与 DB 记录一致
    refs = []
    con2 = open_ro(snap_db)
    for row in con2.execute(
            "select id, episode_number, scene_number, version_code, content_path, content_hash "
            "from content_version order by episode_number, scene_number, version_code"):
        abs_path = Path(row["content_path"]).resolve()
        try:
            rel = abs_path.relative_to(ws_src).as_posix()
        except ValueError:
            failures.append(f"content_version {row['id']} 路径不在项目工作区内: {abs_path}")
            continue
        snap_path = ws_dst / rel
        exists = snap_path.is_file()
        sha = sha256_file(snap_path) if exists else ""
        ok = exists and sha == row["content_hash"]
        if not ok:
            failures.append(
                f"content_version {row['version_code']} 快照/哈希不一致 rel={rel} exists={exists} "
                f"db={row['content_hash']} file={sha}")
        refs.append({"kind": "content_version", "id": row["id"], "relativePath": rel,
                     "dbHash": row["content_hash"], "fileHash": sha, "ok": ok})
    for row in con2.execute(
            "select id, checkpoint_code, data_path from checkpoint order by checkpoint_code"):
        abs_path = Path(row["data_path"]).resolve()
        try:
            rel = abs_path.relative_to(ws_src).as_posix()
        except ValueError:
            failures.append(f"checkpoint {row['id']} 路径不在项目工作区内: {abs_path}")
            continue
        snap_path = ws_dst / rel
        exists = snap_path.is_file()
        refs.append({"kind": "checkpoint", "id": row["id"],
                     "relativePath": rel,
                     "fileHash": sha256_file(snap_path) if exists else "",
                     "ok": exists})
        if not exists:
            failures.append(f"checkpoint {row['checkpoint_code']} 快照缺文件: {rel}")
    con2.close()

    # 5) 只读探针 + 源库未被本脚本修改
    ro_probe = read_only_probe(db_path)
    if not ro_probe["blocked"]:
        failures.append("只读探针失败：只读连接竟然能写库")
    src_sha_after = sha256_file(db_path)
    src_mtime_after = db_path.stat().st_mtime_ns
    if src_sha_before != src_sha_after:
        failures.append("源库 sha256 在快照前后不一致（被写入了）")
    if src_mtime_before != src_mtime_after:
        failures.append("源库 mtime 在快照前后变化（被写入了）")

    snapshot_manifest = {
        "snapshotVersion": 1,
        "capturedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "sourceDb": str(db_path),
        "sourceDbSha256Before": src_sha_before,
        "sourceDbSha256After": src_sha_after,
        "snapshotDb": str(snap_db),
        "snapshotDbSha256": sha256_file(snap_db),
        "snapshotDbBytes": snap_db.stat().st_size,
        "readOnlyProbe": ro_probe,
        "fixtureManifest": str(Path(args.manifest).resolve()),
        "projectWorkspace": str(ws_src),
        "workspaceSnapshot": str(ws_dst),
        "workspaceFileCount": len(ws_files),
        "workspaceFiles": ws_files,
        "keyTableCounts": {t: counts.get(t, 0) for t in KEY_TABLES},
        "referencedFiles": refs,
        "failures": failures,
    }
    (out / "table-counts.json").write_text(
        json.dumps(counts, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "snapshot-manifest.json").write_text(
        json.dumps(snapshot_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[snapshot] db={snap_db} bytes={snapshot_manifest['snapshotDbBytes']} "
          f"sha256={snapshot_manifest['snapshotDbSha256'][:16]}…")
    print(f"[snapshot] tables={counts['_meta']['tableCount']} "
          f"non-empty={sum(1 for k,v in counts.items() if not k.startswith('_') and v)}")
    print(f"[snapshot] workspaceFiles={len(ws_files)} referenced={len(refs)}")
    print(f"[snapshot] readOnlyProbe.blocked={ro_probe['blocked']} err={ro_probe['error']}")
    if failures:
        print("[snapshot] FAILURES:")
        for f in failures:
            print("  -", f)
        return 1
    print("[snapshot] OK 全部引用文件哈希匹配，源库未被修改")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
