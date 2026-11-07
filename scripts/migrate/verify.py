#!/usr/bin/env python3
"""S2.3 三重校验：数量 / 字数 / checksum，偏差必须为 0。

只读输入：
    --db         旧 SQLite 快照（`file:...?mode=ro` 打开，并做写入探针证明只读）
    --workspace  迁移输出项目根目录（含 project.json / canvas.json / content / versions / history）

校验口径（与数据契约-v1 §7 一致）：
1. 数量：project_v2 / episode / scene 行数 vs 新工作区 project.json / canvas 节点
        （bean_sheet=集、scene_list=集、script_scene=场，另加 project_root）；
2. 字数：旧库正文字段（episode.summary + scene.content）净字数总和 vs
        content/*.md 文件净字数总和；净字数规则 = 去掉全部空白字符后的码点数（与迁移脚本一致）；
3. checksum：旧库每条内容的 sha256 vs 对应 content/*.md 文件 sha256 的**多重集**必须相等；
        另加一档 content_version.content_hash vs versions/<nodeId>/<ver>.md 文件 sha256。

映射关系从**新工作区契约文件**（canvas.json 的 type/ref/meta）反推，不复用迁移脚本内部 id 逻辑。

用法：
    python3 verify.py --db analysis/migrate/legacy-snapshot/tasks.db \
        --workspace analysis/migrate/workspace/moxi-projects/雾港旧书店 [--json out.json]

退出码：0 = 三项偏差全 0 且结构校验通过；1 = 有偏差（逐条列出，绝不静默）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TZ = timezone(timedelta(hours=8))
CONTENT_NODE_TYPES = ("beat_sheet", "script_scene")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def net_word_count(text: str) -> int:
    """净字数规则：去掉全部空白字符后的码点数（与迁移脚本一致，写死避免口径漂移）。"""
    return len(re.sub(r"\s+", "", text or ""))


def open_ro(db_path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class Verify:
    def __init__(self, db_path: Path, workspace: Path):
        self.db_path = db_path
        self.workspace = workspace
        self.failures: list[str] = []
        self.diffs: list[dict[str, Any]] = []
        self.checks: dict[str, Any] = {}
        self.structural: dict[str, Any] = {}

    # -- 基础 -----------------------------------------------------------------
    def fail(self, message: str) -> None:
        self.failures.append(message)

    def diff(self, category: str, item: str, old: Any, new: Any) -> None:
        if old == new:
            return
        self.diffs.append({"category": category, "item": item, "legacy": old, "workspace": new,
                           "delta": (new - old) if isinstance(old, (int, float))
                           and isinstance(new, (int, float)) else None})

    # -- 读输入 ---------------------------------------------------------------
    def load(self) -> None:
        self.con = open_ro(self.db_path)
        probe = {"attempt": "CREATE TABLE s23_verify_probe(x INTEGER)", "blocked": False,
                 "error": ""}
        probe_con = open_ro(self.db_path)
        try:
            probe_con.execute("CREATE TABLE s23_verify_probe(x INTEGER)")
            probe["error"] = "只读连接竟然写成功"
        except sqlite3.OperationalError as exc:
            probe["blocked"] = True
            probe["error"] = str(exc)
        finally:
            probe_con.close()
        self.checks["readOnlyProbe"] = probe
        if not probe["blocked"]:
            self.fail("旧库不是只读：只读连接写入未被拒绝")

        projects = [dict(r) for r in self.con.execute("select * from project_v2 order by id")]
        if len(projects) != 1:
            self.fail(f"旧库 project_v2 行数={len(projects)}，本校验脚本按 fixture/单项目口径要求 1")
        self.legacy_project = projects[0] if projects else {}
        pid = self.legacy_project.get("id")
        self.episodes = [dict(r) for r in self.con.execute(
            "select * from episode where project_id=? order by episode_number", (pid,))]
        self.scenes = [dict(r) for r in self.con.execute(
            "select s.*, e.episode_number from scene s join episode e on e.id=s.episode_id "
            "where e.project_id=? order by e.episode_number, s.scene_number", (pid,))]
        self.content_versions = [dict(r) for r in self.con.execute(
            "select * from content_version where project_id=? "
            "order by episode_number, scene_number, version_code", (pid,))]
        self.checkpoints = [dict(r) for r in self.con.execute(
            "select * from checkpoint where project_id=? order by checkpoint_code", (pid,))]
        self.evidence = [dict(r) for r in self.con.execute(
            "select * from evidence_event where project_id=? order by created_at, id", (pid,))]

        self.project_json = read_json(self.workspace / "project.json")
        self.canvas = read_json(self.workspace / "canvas.json")
        self.nodes = self.canvas.get("nodes") or []
        self.edges = self.canvas.get("edges") or []
        self.node_by_id = {n["id"]: n for n in self.nodes}

    # -- 三重校验 -------------------------------------------------------------
    def check_quantity(self) -> None:
        beat_nodes = [n for n in self.nodes if n.get("type") == "beat_sheet"]
        scene_list_nodes = [n for n in self.nodes if n.get("type") == "scene_list"]
        script_nodes = [n for n in self.nodes if n.get("type") == "script_scene"]
        root_nodes = [n for n in self.nodes if n.get("type") == "project_root"]

        items = [
            {"name": "project", "legacy": len([self.legacy_project]) if self.legacy_project else 0,
             "workspace": 1 if self.project_json else 0},
            {"name": "episode ↔ beat_sheet", "legacy": len(self.episodes),
             "workspace": len(beat_nodes)},
            {"name": "episode ↔ scene_list", "legacy": len(self.episodes),
             "workspace": len(scene_list_nodes)},
            {"name": "scene ↔ script_scene", "legacy": len(self.scenes),
             "workspace": len(script_nodes)},
            {"name": "project_root（契约要求恰 1）", "legacy": 1, "workspace": len(root_nodes)},
        ]
        expected_nodes = 1 + 2 * len(self.episodes) + len(self.scenes)
        items.append({"name": "canvas 节点总数（1 + 2×集 + 场）",
                      "legacy": expected_nodes, "workspace": len(self.nodes)})
        expected_content_files = len(self.episodes) + len(self.scenes)
        actual_content_files = sum(1 for n in self.nodes if n.get("contentFile"))
        items.append({"name": "contentFile 节点数（集摘要 + 场正文）",
                      "legacy": expected_content_files, "workspace": actual_content_files})
        disk_content_files = len(list((self.workspace / "content").glob("*.md"))) \
            if (self.workspace / "content").is_dir() else 0
        items.append({"name": "content/*.md 文件数", "legacy": expected_content_files,
                      "workspace": disk_content_files})

        # meta.episode / meta.sceneNo 集合与旧库对齐（防止数量相等但错位）
        episode_meta = sorted(int(n["meta"].get("episode")) for n in beat_nodes)
        episode_set_ok = episode_meta == sorted(int(e["episode_number"]) for e in self.episodes)
        legacy_scene_codes = sorted(str(s.get("scene_code") or "") for s in self.scenes)
        workspace_scene_codes = sorted(str(n["meta"].get("sceneNo") or "") for n in script_nodes)
        scene_set_ok = legacy_scene_codes == workspace_scene_codes
        if not episode_set_ok:
            self.fail(f"beat_sheet meta.episode 集合与旧库不一致：{episode_meta} vs "
                      f"{sorted(int(e['episode_number']) for e in self.episodes)}")
        if not scene_set_ok:
            self.fail(f"script_scene meta.sceneNo 集合与旧库 scene_code 不一致："
                      f"{workspace_scene_codes} vs {legacy_scene_codes}")

        deviations = 0
        for item in items:
            delta = abs(item["workspace"] - item["legacy"])
            item["delta"] = delta
            deviations += delta
            if delta:
                self.diff("quantity", item["name"], item["legacy"], item["workspace"])
        self.checks["quantity"] = {
            "deviation": deviations,
            "items": items,
            "episodeMetaSetMatch": episode_set_ok,
            "sceneCodeSetMatch": scene_set_ok,
        }

    def _node_content_text(self, node: dict[str, Any]) -> str | None:
        rel = node.get("contentFile")
        if not rel:
            return None
        path = self.workspace / rel
        if not path.is_file():
            self.fail(f"节点 {node['id']} 的 contentFile 不存在: {rel}")
            return None
        return path.read_text(encoding="utf-8")

    def check_word_count(self) -> None:
        legacy_labeled: list[tuple[str, int]] = []
        for episode in self.episodes:
            legacy_labeled.append((f"episode:{episode['episode_number']}:summary",
                                   net_word_count(str(episode.get("summary") or ""))))
        for scene in self.scenes:
            legacy_labeled.append((f"scene:{scene['episode_number']}-{scene['scene_number']}:content",
                                   net_word_count(str(scene.get("content") or ""))))
        workspace_labeled: list[tuple[str, int]] = []
        beats = {int(n["meta"].get("episode")): n for n in self.nodes
                 if n.get("type") == "beat_sheet"}
        scripts = {(int(n["meta"].get("episode")), str(n["meta"].get("sceneNo"))): n
                   for n in self.nodes if n.get("type") == "script_scene"}
        for episode in self.episodes:
            node = beats.get(int(episode["episode_number"]))
            text = self._node_content_text(node) if node else None
            if node is None:
                self.fail(f"缺少第{episode['episode_number']}集的 beat_sheet 节点")
                continue
            workspace_labeled.append((f"episode:{episode['episode_number']}:summary",
                                      net_word_count(text or "")))
        for scene in self.scenes:
            key = (int(scene["episode_number"]), str(scene.get("scene_code") or ""))
            node = scripts.get(key)
            text = self._node_content_text(node) if node else None
            if node is None:
                self.fail(f"缺少场次 {key} 的 script_scene 节点")
                continue
            workspace_labeled.append((f"scene:{key[0]}-{scene['scene_number']}:content",
                                      net_word_count(text or "")))

        legacy_map = dict(legacy_labeled)
        workspace_map = dict(workspace_labeled)
        labels = sorted(set(legacy_map) | set(workspace_map))
        item_diffs = []
        for label in labels:
            old = legacy_map.get(label)
            new = workspace_map.get(label)
            if old != new:
                item_diffs.append({"item": label, "legacy": old, "workspace": new,
                                   "delta": (new - old) if old is not None and new is not None else None})
        legacy_total = sum(legacy_map.values())
        workspace_total = sum(workspace_map.values())
        self.checks["wordCount"] = {
            "netWordRule": "去掉全部空白字符后的码点数 len(re.sub(r'\\s+','',text))",
            "legacyTotal": legacy_total,
            "workspaceTotal": workspace_total,
            "deviation": workspace_total - legacy_total,
            "absDeviation": abs(workspace_total - legacy_total),
            "itemDeviation": len(item_diffs),
            "itemDiffs": item_diffs,
        }
        for item in item_diffs:
            self.diffs.append({"category": "wordCount", **item})
        if item_diffs or legacy_total != workspace_total:
            self.fail(f"字数偏差非 0：sum {legacy_total} → {workspace_total}，"
                      f"{len(item_diffs)} 条逐项不一致")

    def check_checksum(self) -> None:
        # ---- 正文 checksum：旧库内容哈希多重集 vs content/*.md 文件哈希多重集 ----
        legacy_hashes: list[tuple[str, str]] = []
        for episode in self.episodes:
            text = str(episode.get("summary") or "")
            legacy_hashes.append((f"episode:{episode['episode_number']}:summary", sha256_text(text)))
        for scene in self.scenes:
            text = str(scene.get("content") or "")
            legacy_hashes.append((f"scene:{scene['episode_number']}-{scene['scene_number']}:content",
                                  sha256_text(text)))

        workspace_hashes: list[tuple[str, str]] = []
        for node in self.nodes:
            if node.get("type") not in CONTENT_NODE_TYPES:
                continue
            rel = node.get("contentFile")
            if not rel:
                continue
            path = self.workspace / rel
            if not path.is_file():
                self.fail(f"contentFile 缺失: {rel}")
                continue
            workspace_hashes.append((rel, sha256_bytes(path.read_bytes())))

        old_multiset = sorted(h for _, h in legacy_hashes)
        new_multiset = sorted(h for _, h in workspace_hashes)
        missing = list(old_multiset)
        extra = list(new_multiset)
        for item in list(missing):
            if item in extra:
                missing.remove(item)
                extra.remove(item)
        legacy_label_by_hash = {h: label for label, h in legacy_hashes}
        workspace_label_by_hash = {h: label for label, h in workspace_hashes}
        content_dev = len(missing) + len(extra)
        self.checks["checksum"] = {
            "content": {
                "rule": "sha256(utf-8 bytes) 多重集相等（旧库 episode.summary + scene.content vs content/*.md）",
                "legacyCount": len(old_multiset),
                "workspaceCount": len(new_multiset),
                "legacyUniqueHashes": len(set(old_multiset)),
                "workspaceUniqueHashes": len(set(new_multiset)),
                "deviation": content_dev,
                "missing": [{"sha256": h, "label": legacy_label_by_hash.get(h, "?")} for h in missing],
                "extra": [{"sha256": h, "label": workspace_label_by_hash.get(h, "?")} for h in extra],
            },
            "versions": {},
        }
        if content_dev:
            self.fail(f"正文 checksum 多重集偏差 {content_dev}（缺 {len(missing)} / 多 {len(extra)}）")
            for item in missing:
                self.diffs.append({"category": "checksum:content", "item": "missing",
                                   "legacy": legacy_label_by_hash.get(item), "workspace": None})
            for item in extra:
                self.diffs.append({"category": "checksum:content", "item": "extra",
                                   "legacy": None, "workspace": workspace_label_by_hash.get(item)})

        # ---- 版本 checksum：content_version.content_hash vs versions/<nodeId>/<ver>.md ----
        script_nodes = {(int(n["meta"].get("episode")), str(n["meta"].get("sceneNo"))): n
                        for n in self.nodes if n.get("type") == "script_scene"}
        legacy_version_hashes: list[tuple[str, str]] = []
        version_issues: list[dict[str, Any]] = []
        for version in self.content_versions:
            node = script_nodes.get((int(version["episode_number"]),
                                     f"{version['episode_number']}-{version['scene_number']}"))
            if node is None:
                version_issues.append({"versionId": version["id"],
                                       "issue": "找不到对应 script_scene 节点",
                                       "episode": version["episode_number"],
                                       "scene": version["scene_number"]})
                continue
            rel = f"versions/{node['id']}/{version['version_code']}.md"
            path = self.workspace / rel
            if not path.is_file():
                version_issues.append({"versionId": version["id"], "issue": f"版本文件缺失 {rel}"})
                continue
            file_hash = sha256_bytes(path.read_bytes())
            expected = str(version.get("content_hash") or "")
            legacy_version_hashes.append((rel, expected))
            if expected != file_hash:
                version_issues.append({
                    "versionId": version["id"], "versionCode": version["version_code"],
                    "issue": "sha256 不一致", "expected": expected, "actual": file_hash,
                })
        version_dev = len(version_issues)
        self.checks["checksum"]["versions"] = {
            "rule": "content_version.content_hash vs versions/<nodeId>/<ver>.md sha256（逐条）",
            "legacyCount": len(self.content_versions),
            "checkedCount": len(legacy_version_hashes),
            "deviation": version_dev,
            "issues": version_issues,
        }
        if version_dev:
            self.fail(f"版本 checksum 偏差 {version_dev}")
            for issue in version_issues:
                self.diffs.append({"category": "checksum:versions", "item": issue["versionId"],
                                   "legacy": issue.get("expected"), "workspace": issue.get("actual")})

        # ---- checkpoint 归档存在性 ----
        cp_issues = []
        for checkpoint in self.checkpoints:
            node = script_nodes.get((int(checkpoint.get("episode_number") or 0),
                                     f"{checkpoint.get('episode_number')}-{checkpoint.get('scene_number')}"))
            if node is None:
                cp_issues.append({"checkpoint": checkpoint["checkpoint_code"],
                                  "issue": "找不到对应 script_scene 节点"})
                continue
            rel = f"versions/{node['id']}/{checkpoint['checkpoint_code']}.json"
            if not (self.workspace / rel).is_file():
                cp_issues.append({"checkpoint": checkpoint["checkpoint_code"],
                                  "issue": f"检查点快照缺失 {rel}"})
        self.checks["checkpointArchive"] = {
            "legacyCount": len(self.checkpoints), "deviation": len(cp_issues),
            "issues": cp_issues,
        }
        if cp_issues:
            self.fail(f"checkpoint 归档偏差 {len(cp_issues)}")

    # -- 结构校验 -------------------------------------------------------------
    def check_structure(self) -> None:
        failures_before = len(self.failures)
        # canvas 基本结构
        for key in ("schemaVersion", "rev", "viewport", "nodes", "edges"):
            if key not in self.canvas:
                self.fail(f"canvas.json 缺字段 {key}")
        if self.canvas.get("schemaVersion") != 1:
            self.fail(f"canvas.schemaVersion={self.canvas.get('schemaVersion')} 应为 1")
        if self.project_json.get("schemaVersion") != 1:
            self.fail(f"project.json schemaVersion={self.project_json.get('schemaVersion')} 应为 1")
        ids = [n["id"] for n in self.nodes]
        if len(ids) != len(set(ids)):
            self.fail("canvas 存在重复 node id")
        if self.project_json.get("id") and not str(self.project_json["id"]).startswith("proj_"):
            self.fail("project.json id 前缀应为 proj_")
        for node in self.nodes:
            if node.get("type") not in ("project_root", "settings", "asset", "beat_sheet",
                                        "scene_list", "script_scene", "quality", "compliance",
                                        "delivery"):
                self.fail(f"未知节点类型 {node.get('type')} ({node.get('id')})")
            if node.get("contentFile"):
                if not (self.workspace / node["contentFile"]).is_file():
                    self.fail(f"contentFile 不存在 {node['contentFile']}")
        # 边：端点存在、去重、dependency 子图无环
        edge_keys = set()
        adjacency: dict[str, list[str]] = {nid: [] for nid in ids}
        for edge in self.edges:
            key = (edge.get("from"), edge.get("to"), edge.get("kind"))
            if key in edge_keys:
                self.fail(f"重复边 {key}")
            edge_keys.add(key)
            if edge.get("from") not in self.node_by_id or edge.get("to") not in self.node_by_id:
                self.fail(f"边端点不存在 {key}")
                continue
            if edge.get("from") == edge.get("to"):
                self.fail(f"自环边 {key}")
            if edge.get("kind") == "dependency":
                adjacency[edge["from"]].append(edge["to"])
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {nid: WHITE for nid in ids}
        def has_cycle(nid: str) -> bool:
            color[nid] = GRAY
            for nxt in adjacency.get(nid, []):
                if color[nxt] == GRAY:
                    return True
                if color[nxt] == WHITE and has_cycle(nxt):
                    return True
            color[nid] = BLACK
            return False
        if any(color[nid] == WHITE and has_cycle(nid) for nid in ids):
            self.fail("dependency 子图存在环")

        # events.jsonl
        events_path = self.workspace / "history/events.jsonl"
        events = []
        if not events_path.is_file():
            self.fail("history/events.jsonl 不存在")
        else:
            for line_no, line in enumerate(events_path.read_text(encoding="utf-8").splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    self.fail(f"events.jsonl 第 {line_no} 行不是合法 JSON: {exc}")
        seqs = [e.get("seq") for e in events]
        if seqs != list(range(1, len(seqs) + 1)):
            self.fail(f"events.jsonl seq 不连续: {seqs[:10]}…")
        for event in events:
            if event.get("projectId") != self.project_json.get("id"):
                self.fail(f"event seq={event.get('seq')} projectId 不匹配")
                break
        expected_events = (1 + len(self.nodes) + len(self.edges)
                           + len(self.content_versions) + len(self.checkpoints))
        self.structural = {
            "nodes": len(self.nodes),
            "edges": len(self.edges),
            "contentFiles": sum(1 for n in self.nodes if n.get("contentFile")),
            "events": len(events),
            "expectedEvents": expected_events,
            "eventsMatch": len(events) == expected_events,
            "structureFailures": len(self.failures) - failures_before,
        }
        if len(events) != expected_events:
            self.fail(f"events.jsonl 条数 {len(events)} != 期望 {expected_events}")

    # -- 汇总 ----------------------------------------------------------------
    def run(self) -> dict[str, Any]:
        self.load()
        self.check_quantity()
        self.check_word_count()
        self.check_checksum()
        self.check_structure()
        quantity_dev = self.checks["quantity"]["deviation"]
        word_dev = self.checks["wordCount"]["absDeviation"] + \
            self.checks["wordCount"]["itemDeviation"]
        checksum_dev = (self.checks["checksum"]["content"]["deviation"]
                        + self.checks["checksum"]["versions"]["deviation"]
                        + self.checks["checkpointArchive"]["deviation"])
        ok = (quantity_dev == 0 and word_dev == 0 and checksum_dev == 0
              and not self.failures)
        return {
            "ok": ok,
            "verdict": "PASS 三项偏差全 0" if ok else "FAIL 存在偏差/结构问题",
            "source": {
                "db": str(self.db_path.resolve()),
                "dbSha256": sha256_bytes(self.db_path.read_bytes()),
            },
            "workspace": str(self.workspace.resolve()),
            "project": {
                "legacyId": self.legacy_project.get("id"),
                "newId": self.project_json.get("id"),
                "title": self.project_json.get("title"),
            },
            "tripleCheck": {
                "quantity": {"deviation": quantity_dev,
                             "items": self.checks["quantity"]["items"]},
                "wordCount": {k: v for k, v in self.checks["wordCount"].items()},
                "checksum": {
                    "content": self.checks["checksum"]["content"],
                    "versions": self.checks["checksum"]["versions"],
                    "deviation": checksum_dev,
                },
            },
            "readOnlyProbe": self.checks["readOnlyProbe"],
            "structure": self.structural,
            "failures": self.failures,
            "diffs": self.diffs,
            "checkedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        }


def print_report(result: dict[str, Any]) -> None:
    q = result["tripleCheck"]["quantity"]
    w = result["tripleCheck"]["wordCount"]
    c = result["tripleCheck"]["checksum"]
    print("=" * 78)
    print(f"S2.3 三重校验 · {result['verdict']}")
    print("=" * 78)
    print(f"旧库  : {result['source']['db']}")
    print(f"        sha256={result['source']['dbSha256']} 只读探针={result['readOnlyProbe']['blocked']}")
    print(f"新工作区: {result['workspace']}")
    print(f"项目  : {result['project']['legacyId']} → {result['project']['newId']} "
          f"({result['project']['title']})")
    print("-" * 78)
    print("[1] 数量")
    for item in q["items"]:
        mark = "OK " if item["delta"] == 0 else "DIFF"
        print(f"    {mark} {item['name']}: 旧={item['legacy']} 新={item['workspace']} "
              f"delta={item['delta']}")
    print(f"    → 数量偏差 = {q['deviation']}")
    print("-" * 78)
    print("[2] 字数（净字数 = 去全部空白后的码点数）")
    print(f"    旧库正文净字数 = {w['legacyTotal']}")
    print(f"    新工作区净字数 = {w['workspaceTotal']}")
    print(f"    → 字数偏差 = {w['absDeviation']}；逐项不一致 = {w['itemDeviation']}")
    print("-" * 78)
    print("[3] checksum")
    content = c["content"]
    print(f"    正文多重集: 旧={content['legacyCount']} 条 / 新={content['workspaceCount']} 条；"
          f"缺={len(content['missing'])} 多={len(content['extra'])} → 偏差={content['deviation']}")
    versions = c["versions"]
    print(f"    版本逐条  : 检查={versions['checkedCount']}/{versions['legacyCount']}；"
          f"偏差={versions['deviation']}")
    print(f"    → checksum 偏差 = {c['deviation']}")
    print("-" * 78)
    print(f"结构: canvas {result['structure']['nodes']} 节点 / {result['structure']['edges']} 边 / "
          f"{result['structure']['events']} 事件（期望 {result['structure']['expectedEvents']}）")
    if result["failures"]:
        print("-" * 78)
        print(f"失败项 {len(result['failures'])} 条：")
        for failure in result["failures"]:
            print("  -", failure)
    if result["diffs"]:
        print("-" * 78)
        print(f"差异明细 {len(result['diffs'])} 条：")
        for diff in result["diffs"][:50]:
            print("  -", json.dumps(diff, ensure_ascii=False))
    print("=" * 78)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", required=True, help="旧 SQLite 快照路径（只读打开）")
    parser.add_argument("--workspace", required=True, help="迁移输出项目根目录")
    parser.add_argument("--json", default=None, help="把完整校验结果写成 JSON 到指定路径")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    workspace = Path(args.workspace).resolve()
    if not db_path.is_file():
        raise SystemExit(f"[verify] 旧库不存在: {db_path}")
    if not (workspace / "project.json").is_file():
        raise SystemExit(f"[verify] 不是迁移工作区（缺 project.json）: {workspace}")

    verifier = Verify(db_path, workspace)
    result = verifier.run()
    print_report(result)
    if args.json:
        out = Path(args.json).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[verify] JSON 结果 → {out}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
