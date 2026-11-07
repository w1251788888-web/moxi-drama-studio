#!/usr/bin/env python3
"""S2.3 迁移自测：幂等性 + 确定性 + 负样例（证明 verify.py 真能抓出偏差）。

自测项：
1. 基线：verify.py 对正式迁移输出 → 退出码 0，三项偏差全 0；
2. 幂等：同一命令重复迁移到同一目录，输出目录逐字节不变（tree sha256 相同）；
3. 确定性：迁移到全新输出目录，与正式输出逐字节相同；
4. 负样例（每个都在副本上做，不改正式输出）：
   a. 正文加字 → 字数偏差 ≠ 0 且 checksum 偏差 ≠ 0；
   b. 正文换字（长度不变）→ 字数偏差 = 0 但 checksum 偏差 = 1（证明 checksum 独立生效）；
   c. canvas 删一个 script_scene 节点 → 数量偏差 ≠ 0；
   d. 版本文件换字（长度不变）→ 版本 checksum 偏差 ≠ 0，正文 checksum 仍 = 0。
5. 旧库全程 sha256 不变（只读）。

用法：
    python3 self_test.py --db analysis/migrate/legacy-snapshot/tasks.db \
        --legacy-workspace analysis/migrate/legacy-snapshot/workspace \
        --workspace analysis/migrate/workspace/moxi-projects/雾港旧书店 \
        --scratch analysis/migrate/self-test

退出码 0 = 全部自测项符合预期；1 = 有自测项不符。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TZ = timezone(timedelta(hours=8))
MIGRATE = Path(__file__).with_name("legacy_sqlite_to_workspace.py")
VERIFY = Path(__file__).with_name("verify.py")


def tree_hash(root: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    count = 0
    for path in sorted(root.rglob("*")):
        if path.is_file():
            digest.update(path.relative_to(root).as_posix().encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
            count += 1
    return count, digest.hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def migrate(db: Path, legacy_workspace: Path, out: Path) -> subprocess.CompletedProcess:
    return run([sys.executable, str(MIGRATE), "--db", str(db),
                "--legacy-workspace", str(legacy_workspace), "--out", str(out)])


def verify(db: Path, workspace: Path, json_out: Path) -> tuple[int, dict]:
    proc = run([sys.executable, str(VERIFY), "--db", str(db), "--workspace", str(workspace),
                "--json", str(json_out)])
    data = json.loads(json_out.read_text(encoding="utf-8")) if json_out.is_file() else {}
    return proc.returncode, data


def copy_workspace(src: Path, dst: Path) -> Path:
    if dst.exists():
        raise SystemExit(f"[self-test] 副本目录已存在，换一个 run 目录: {dst}")
    shutil.copytree(src, dst)
    return dst


def pick_content_file(workspace: Path, node_type: str) -> Path:
    canvas = json.loads((workspace / "canvas.json").read_text(encoding="utf-8"))
    for node in canvas["nodes"]:
        if node.get("type") == node_type and node.get("contentFile"):
            return workspace / node["contentFile"]
    raise SystemExit(f"[self-test] 找不到 {node_type} 的 content 文件")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--legacy-workspace", required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--scratch", required=True)
    args = parser.parse_args()

    db = Path(args.db).resolve()
    legacy_workspace = Path(args.legacy_workspace).resolve()
    workspace = Path(args.workspace).resolve()
    stamp = datetime.now(TZ).strftime("%Y%m%dT%H%M%S")
    scratch = Path(args.scratch).resolve() / f"run-{stamp}"
    scratch.mkdir(parents=True, exist_ok=False)
    results: list[dict] = []

    def record(name: str, ok: bool, detail: dict) -> None:
        results.append({"name": name, "ok": ok, "detail": detail})
        print(f"[self-test] {'PASS' if ok else 'FAIL'} {name}: {json.dumps(detail, ensure_ascii=False)}")

    db_sha_before = sha256_file(db)

    # 1) 基线 verify 通过
    base_json = scratch / "baseline-verify.json"
    code, data = verify(db, workspace, base_json)
    triple = data.get("tripleCheck", {})
    record("baseline-verify-pass", code == 0 and data.get("ok") is True, {
        "exit": code,
        "quantityDeviation": triple.get("quantity", {}).get("deviation"),
        "wordDeviation": triple.get("wordCount", {}).get("absDeviation"),
        "checksumDeviation": triple.get("checksum", {}).get("deviation"),
    })

    # 2) 幂等：同目录重跑 → tree hash 不变
    count_before, hash_before = tree_hash(workspace)
    proc = migrate(db, legacy_workspace, workspace)
    count_after, hash_after = tree_hash(workspace)
    record("idempotent-rerun", proc.returncode == 0 and hash_before == hash_after,
           {"exit": proc.returncode, "files": count_after,
            "treeHashBefore": hash_before, "treeHashAfter": hash_after})

    # 3) 确定性：全新目录 → 与正式输出逐字节相同
    fresh = scratch / "fresh"
    proc = migrate(db, legacy_workspace, fresh)
    fresh_count, fresh_hash = tree_hash(fresh)
    record("deterministic-fresh-output", proc.returncode == 0 and fresh_hash == hash_after,
           {"exit": proc.returncode, "files": fresh_count, "freshHash": fresh_hash,
            "workspaceHash": hash_after})

    # 4a) 负样例：正文加字 → 字数偏差 ≠ 0 且 checksum 偏差 ≠ 0
    case_word = copy_workspace(workspace, scratch / "case-word-append")
    target = pick_content_file(case_word, "script_scene")
    target.write_text(target.read_text(encoding="utf-8") + "补测", encoding="utf-8")
    code, data = verify(db, case_word, scratch / "case-word-append.json")
    triple = data.get("tripleCheck", {})
    record("negative-word-append-detected",
           code == 1
           and triple.get("wordCount", {}).get("absDeviation", 0) > 0
           and triple.get("checksum", {}).get("content", {}).get("deviation", 0) > 0,
           {"exit": code,
            "wordDeviation": triple.get("wordCount", {}).get("absDeviation"),
            "checksumDeviation": triple.get("checksum", {}).get("content", {}).get("deviation")})

    # 4b) 负样例：正文换字（长度不变）→ 字数偏差 = 0、checksum 偏差 = 1
    case_swap = copy_workspace(workspace, scratch / "case-content-swap")
    target = pick_content_file(case_swap, "script_scene")
    text = target.read_text(encoding="utf-8")
    if len(text) < 2 or text[0] == text[1]:
        raise SystemExit("[self-test] 正文前两个字相同，无法做换字负样例")
    target.write_text(text[1] + text[0] + text[2:], encoding="utf-8")
    code, data = verify(db, case_swap, scratch / "case-content-swap.json")
    triple = data.get("tripleCheck", {})
    record("negative-content-swap-detected",
           code == 1
           and triple.get("wordCount", {}).get("absDeviation") == 0
           and triple.get("wordCount", {}).get("itemDeviation") == 0
           and triple.get("checksum", {}).get("content", {}).get("deviation") == 2,
           {"exit": code,
            "wordDeviation": triple.get("wordCount", {}).get("absDeviation"),
            "checksumDeviation": triple.get("checksum", {}).get("content", {}).get("deviation")})

    # 4c) 负样例：canvas 删一个 script_scene → 数量偏差 ≠ 0
    case_qty = copy_workspace(workspace, scratch / "case-quantity-drop-node")
    canvas_path = case_qty / "canvas.json"
    canvas = json.loads(canvas_path.read_text(encoding="utf-8"))
    script_nodes = [n for n in canvas["nodes"] if n.get("type") == "script_scene"]
    removed = script_nodes[-1]["id"]
    canvas["nodes"] = [n for n in canvas["nodes"] if n["id"] != removed]
    canvas["edges"] = [e for e in canvas["edges"]
                       if e.get("from") != removed and e.get("to") != removed]
    canvas_path.write_text(json.dumps(canvas, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    code, data = verify(db, case_qty, scratch / "case-quantity-drop-node.json")
    triple = data.get("tripleCheck", {})
    record("negative-quantity-drop-node-detected",
           code == 1 and triple.get("quantity", {}).get("deviation", 0) > 0,
           {"exit": code, "quantityDeviation": triple.get("quantity", {}).get("deviation")})

    # 4d) 负样例：版本文件换字（长度不变）→ 版本 checksum 偏差 ≠ 0，正文 checksum 仍 0
    case_ver = copy_workspace(workspace, scratch / "case-version-swap")
    version_files = sorted((case_ver / "versions").rglob("*.md"))
    if not version_files:
        raise SystemExit("[self-test] 找不到版本文件")
    target = version_files[0]
    text = target.read_text(encoding="utf-8")
    if len(text) < 2 or text[0] == text[1]:
        raise SystemExit("[self-test] 版本文件前两个字相同，无法做换字负样例")
    target.write_text(text[1] + text[0] + text[2:], encoding="utf-8")
    code, data = verify(db, case_ver, scratch / "case-version-swap.json")
    triple = data.get("tripleCheck", {})
    record("negative-version-swap-detected",
           code == 1
           and triple.get("checksum", {}).get("versions", {}).get("deviation") == 1
           and triple.get("checksum", {}).get("content", {}).get("deviation") == 0,
           {"exit": code,
            "versionChecksumDeviation": triple.get("checksum", {}).get("versions", {}).get("deviation"),
            "contentChecksumDeviation": triple.get("checksum", {}).get("content", {}).get("deviation")})

    # 5) 旧库未被写
    db_sha_after = sha256_file(db)
    record("legacy-db-readonly", db_sha_before == db_sha_after,
           {"sha256Before": db_sha_before, "sha256After": db_sha_after})

    ok = all(item["ok"] for item in results)
    summary = {
        "selfTestVersion": 1,
        "runDir": str(scratch),
        "ok": ok,
        "cases": results,
        "testedAt": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    (scratch / "self-test-result.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[self-test] {'ALL PASS' if ok else 'FAILED'} → {scratch / 'self-test-result.json'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
