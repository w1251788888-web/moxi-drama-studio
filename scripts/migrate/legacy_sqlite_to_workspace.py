#!/usr/bin/env python3
"""S2.3 旧 SQLite → 工作区迁移。

把旧系统 SQLite（只读打开）按 `docs/设计/数据契约-v1.md` §7 映射成 v2 工作区：
    <out>/project.json
    <out>/canvas.json
    <out>/content/<nodeId>.md
    <out>/versions/<nodeId>/<ver>.md
    <out>/versions/<nodeId>/<checkpoint>.json
    <out>/history/events.jsonl
    <out>/history/migration-manifest.json   # 迁移溯源（旧 id ↔ 新 id、生成文件清单）

约束：
- 旧库一律 `file:<path>?mode=ro` 只读打开，脚本内没有任何写旧库路径；
- 输出可重复生成（同一输入 → 逐字节相同的输出；不写入当前时间等非确定值）；
- 落盘用 tmp + os.replace 原子替换；
- 迁移正文逐字节回写（不追加尾部换行），保证 checksum 可与旧库字段直接比对。

用法：
    python3 legacy_sqlite_to_workspace.py \
        --db analysis/migrate/legacy-snapshot/tasks.db \
        --legacy-workspace analysis/migrate/legacy-snapshot/workspace \
        --out analysis/migrate/workspace/moxi-projects/雾港旧书店 \
        [--project-id <legacy uuid>] [--dry-run] [--report <report.json>]

退出码：0 成功；1 失败（不静默跳过任何校验失败）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TZ = timezone(timedelta(hours=8))
TOOL_VERSION = 1

# Crockford Base32（ULID 字母表）。旧 UUID 经 uuid5 派生后编码成 26 位，满足
# 数据契约 "id = <前缀>_<26位 ULID>" 的形状；同时保持确定性（幂等）。
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ID_NAMESPACE = uuid.UUID("6f5b2f7a-3c1e-4a8e-9d63-5c2f1b8a7e40")

# 旧表 → 新落点（数据契约-v1 §7）。用于报告：已迁移 / 明确不迁移。
TABLE_MAPPING = {
    # ---- §7 有落点且本次已实现（fixture 覆盖验证）----
    "project_v2": ("project.json", "migrated"),
    "episode": ("canvas.json:beat_sheet/scene_list + content/*.md", "migrated"),
    "scene": ("canvas.json:script_scene + content/*.md", "migrated"),
    "content_version": ("versions/<nodeId>/<ver>.md + events.jsonl", "migrated"),
    "checkpoint": ("versions/<nodeId>/<cp>.json + canvas.json.rev + events.jsonl", "migrated"),
    "evidence_event": ("events.jsonl", "migrated"),
    # ---- §7 有落点、本次未实现（真实库非空时会丢，S3 补）----
    "contribution_ledger": ("events.jsonl 派生统计（不单独存）", "derived"),
    "generation_job": ("节点 status + events.jsonl", "deferred"),
    "short_drama_generation_job": ("节点 status + events.jsonl", "deferred"),
    "episode_segments": ("script_scene 节点（分段落盘）", "deferred"),
    "segment_reviews": ("events.jsonl check.run + 质检节点 meta.findings", "deferred"),
    "step_gates": ("节点状态机", "deferred"),
    "outline_episode_job": ("节点状态 + events.jsonl", "deferred"),
    "approval_task": ("events.jsonl", "deferred"),
    "review_record": ("质检节点历史", "deferred"),
    "issue_record": ("meta.findings", "deferred"),
    "material_item": ("assets/ + asset 节点", "deferred"),
    "project_materials": ("assets/ + asset 节点", "deferred"),
    "character_visual_bases": ("asset 节点 meta.fields", "deferred"),
    "scene_visual_bases": ("asset 节点 meta.fields", "deferred"),
    "compliance_rule_set": ("合规节点 meta.findings", "deferred"),
    "compliance_scan": ("合规节点 meta.findings", "deferred"),
    "compliance_finding": ("合规节点 meta.findings", "deferred"),
    "compliance_patch": ("合规节点 meta.findings", "deferred"),
    "rights_profile": ("合规节点子字段（首版裁剪）", "deferred"),
    "copyright_party": ("合规节点子字段（首版裁剪）", "deferred"),
    "rights_source": ("合规节点子字段（首版裁剪）", "deferred"),
    "rights_check_result": ("合规节点子字段（首版裁剪）", "deferred"),
    "legal_material": ("合规节点子字段（首版裁剪）", "deferred"),
    "evidence_package": ("合规节点子字段（首版裁剪）", "deferred"),
    "export_record": ("delivery 节点", "deferred"),
    "shots": ("delivery 节点（P2）", "deferred"),
    "shot_prompts": ("delivery 节点（P2）", "deferred"),
    "step_versions": ("versions/ + 边", "deferred"),
    "step_dependencies": ("versions/ + 边", "deferred"),
    "step_reviews": ("质检节点历史", "deferred"),
    "dynamic_rules": ("rules/v2/*.md（文件化）", "deferred"),
    # ---- 契约明确不迁移 ----
    "model_provider": ("DSH profile LLM 配置（不迁移）", "not_migrated"),
    "render_provider_configs": ("DSH 配置（不迁移）", "not_migrated"),
    "rule": ("rules/v2/*.md（文件化，另有迁移路径）", "not_migrated"),
    "task": ("不迁移（DSH 会话/jobs 替代）", "not_migrated"),
    "sub_task": ("不迁移（DSH 会话/jobs 替代）", "not_migrated"),
    "module": ("不迁移（DSH 会话/jobs 替代）", "not_migrated"),
    "activity_log": ("不迁移（Host 审计替代）", "not_migrated"),
    "request_log": ("不迁移（Host 审计替代）", "not_migrated"),
    "admin_session": ("不迁移（DSH 鉴权替代）", "not_migrated"),
    "admin_user": ("不迁移（DSH 鉴权替代）", "not_migrated"),
    "admin_feature_flag": ("不迁移（管理端重写）", "not_migrated"),
    "agent": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "skill_registry": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "skill_binding": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "skill_invocation": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "skill_artifact": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "skill_quality_feedback": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "reward_log": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "patrol_record": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "prompt_optimization_cache": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "user_edit_records": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "rule_extraction_jobs": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "workflow_efficiency_metrics": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "learning_insights": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "segment_metrics": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "rule_effectiveness_records": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "rule_promotion_paths": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "rule_conflict_detections": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "genre_rule_pools": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "rule_guardrails": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "failure_patterns": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "fix_strategies": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "auto_fix_records": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "success_patterns": ("不迁移（对应能力删除/重写）", "not_migrated"),
    "project_member": ("不迁移（协同能力删除/重写）", "not_migrated"),
    "project_permission": ("不迁移（协同能力删除/重写）", "not_migrated"),
    "project_invite": ("不迁移（协同能力删除/重写）", "not_migrated"),
    "collab_event": ("不迁移（协同能力删除/重写）", "not_migrated"),
    "contribution_attribution": ("不迁移（协同能力删除/重写）", "not_migrated"),
    "knowledge_chunks": ("不迁移（RAG 能力重写）", "not_migrated"),
    "front_user": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "front_user_session": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "user_access_key": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "subscription_plan": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "payment_order": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "operator_audit_log": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "invite_code": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "credit_ledger": ("不迁移（SaaS 能力删除）", "not_migrated"),
    "llm_provider_setting": ("不迁移（SaaS 能力删除）", "not_migrated"),
}

SQLITE_INTERNAL_TABLE_PREFIXES = ("search_documents_fts",)

NODE_SIZES = {
    "project_root": (320, 200),
    "beat_sheet": (320, 200),
    "scene_list": (360, 240),
    "script_scene": (420, 520),
}

EPISODE_STATUS_MAP = {
    "draft": "draft", "writing": "generating", "review": "review",
    "reviewing": "review", "completed": "approved",
}
SCENE_STATUS_MAP = {
    "draft": "draft", "writing": "generating", "reviewing": "review",
    "review": "review", "completed": "approved",
}

EVENT_ACTOR_BY_EDITOR = {
    "human": "user", "ai": "agent", "skill_writer": "agent", "skill_reviewer": "agent",
}


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def net_word_count(text: str) -> int:
    """净字数规则（写死在此，verify.py 使用同一规则）：去掉全部空白字符后的码点数。"""
    return len(re.sub(r"\s+", "", text or ""))


def ulid_like(*parts: Any) -> str:
    """uuid5(固定命名空间, parts) 的 128bit → Crockford Base32 26 位（ULID 形状）。"""
    digest = uuid.uuid5(_ID_NAMESPACE, "|".join(str(p) for p in parts)).bytes
    value = int.from_bytes(digest, "big")
    chars = ["0"] * 26
    for index in range(25, -1, -1):
        chars[index] = _ALPHABET[value & 0x1F]
        value >>= 5
    return "".join(chars)


def legacy_datetime_to_iso(value: str | None) -> str:
    """旧库 DateTime 以 naive 本地时间存（datetime.now()），补 +08:00 输出 ISO 8601。"""
    if not value:
        return datetime.now(TZ).replace(microsecond=0).isoformat()
    text = str(value).strip()
    parsed = None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            break
        except ValueError:
            continue
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValueError(f"无法解析旧库时间: {value!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=TZ)
    return parsed.astimezone(TZ).isoformat(timespec="seconds")


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp.s23")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def atomic_write_text(path: Path, text: str) -> None:
    atomic_write_bytes(path, text.encode("utf-8"))


def atomic_write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


# ---------------------------------------------------------------------------
# 旧库读取（只读）
# ---------------------------------------------------------------------------

def open_ro(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.resolve()}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    return con


def table_counts(con: sqlite3.Connection) -> dict[str, int]:
    tables = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' order by name")]
    return {t: con.execute(f'select count(*) from "{t}"').fetchone()[0] for t in tables}


def load_legacy(con: sqlite3.Connection, project_id: str | None) -> dict[str, Any]:
    projects = [dict(r) for r in con.execute("select * from project_v2 order by id")]
    if project_id:
        projects = [p for p in projects if p["id"] == project_id]
        if not projects:
            raise SystemExit(f"[migrate] 旧库中找不到 project_id={project_id}")
    if not projects:
        raise SystemExit("[migrate] 旧库 project_v2 为空，没有可迁移项目")
    if len(projects) > 1:
        raise SystemExit(
            "[migrate] 旧库有多个项目，请用 --project-id 指定；"
            f"现有: {[p['id'] + ':' + p['name'] for p in projects]}")
    project = projects[0]
    pid = project["id"]

    episodes = [dict(r) for r in con.execute(
        "select * from episode where project_id=? order by episode_number", (pid,))]
    scene_rows = [dict(r) for r in con.execute(
        "select s.* from scene s join episode e on e.id = s.episode_id "
        "where e.project_id=? order by e.episode_number, s.scene_number", (pid,))]
    episode_by_id = {e["id"]: e for e in episodes}
    for scene in scene_rows:
        episode = episode_by_id.get(scene["episode_id"])
        if episode is None:
            raise SystemExit(f"[migrate] scene {scene['id']} 找不到所属 episode")
        scene["_episode_number"] = episode["episode_number"]

    content_versions = [dict(r) for r in con.execute(
        "select * from content_version where project_id=? "
        "order by episode_number, scene_number, version_code", (pid,))]
    checkpoints = [dict(r) for r in con.execute(
        "select * from checkpoint where project_id=? order by checkpoint_code", (pid,))]
    evidence = [dict(r) for r in con.execute(
        "select * from evidence_event where project_id=? order by created_at, id", (pid,))]
    ledger_count = con.execute(
        "select count(*) from contribution_ledger where project_id=?", (pid,)).fetchone()[0]
    return {
        "project": project,
        "episodes": episodes,
        "scenes": scene_rows,
        "contentVersions": content_versions,
        "checkpoints": checkpoints,
        "evidenceEvents": evidence,
        "ledgerCount": ledger_count,
    }


# ---------------------------------------------------------------------------
# 映射：project.json / canvas.json / content / versions / events
# ---------------------------------------------------------------------------

def map_project(legacy: dict[str, Any]) -> dict[str, Any]:
    project = legacy["project"]
    try:
        config = json.loads(project.get("config") or "{}")
    except json.JSONDecodeError:
        config = {}
    project_id_legacy = project["id"]

    # episodeCount：只有"已确认"才写数字，否则 null（数据契约 §2：null = 未确认）
    ep_count_status = str(config.get("episode_count_status") or "").strip()
    confirmed = config.get("confirmed_total_episodes")
    plain = config.get("total_episodes")
    if ep_count_status == "confirmed" and (confirmed or plain):
        episode_count = int(confirmed or plain)
    elif confirmed:
        episode_count = int(confirmed)
    else:
        episode_count = None

    episode_seconds = int(config.get("episode_seconds") or 90)
    episode_seconds = max(30, min(600, episode_seconds))

    word_min = word_max = None
    raw_range = str(config.get("word_count_per_episode") or "")
    match = re.fullmatch(r"\s*(\d{2,5})\s*[-~－—]\s*(\d{2,5})\s*", raw_range)
    if match:
        word_min, word_max = int(match.group(1)), int(match.group(2))
    else:  # D-06 公式回填：seconds/90 × (1000, 1550)
        word_min = max(100, round(episode_seconds / 90 * 1000))
        word_max = max(word_min, round(episode_seconds / 90 * 1550))

    project_type = str(project.get("project_type") or "")
    format_value = "真人短剧"
    if "真人短剧" in project_type:
        format_value = "真人短剧"
    elif "漫剧" in project_type or "影视" in project_type:
        format_value = "影视剧"
    elif "长剧" in project_type:
        format_value = "长剧"
    elif "话剧" in project_type:
        format_value = "话剧"

    legacy_status = str(project.get("status") or "")
    status = "archived" if legacy_status == "archived" else "active"

    new_id = "proj_" + ulid_like("project", project_id_legacy)
    return {
        "schemaVersion": 1,
        "id": new_id,
        "title": str(project.get("name") or ""),
        "logline": str(project.get("description") or ""),
        "genre": {"main": str(project.get("genre_main") or ""),
                  "sub": str(project.get("genre_sub") or "")},
        "audience": str(project.get("audience_axis") or ""),
        "format": format_value,
        "episodeCount": episode_count,
        "episodeSeconds": episode_seconds,
        "wordRange": {"min": word_min, "max": word_max},
        "sceneHeaderStyle": str(config.get("scene_header_style") or "bracket"),
        "status": status,
        "rulesPack": "rules/v2",
        "createdAt": legacy_datetime_to_iso(project.get("created_at")),
        "updatedAt": legacy_datetime_to_iso(project.get("updated_at")),
        "_legacy": {
            "projectId": project_id_legacy,
            "status": legacy_status,
            "projectType": project_type,
            "episodeCountStatus": ep_count_status,
            "workspacePath": str(project.get("workspace_path") or ""),
        },
    }


def node_layout(index: int) -> tuple[int, int]:
    """确定性网格布局：按节点生成顺序排，够读即可（迁移不追求视觉排版）。"""
    return (index % 6) * 460, (index // 6) * 620


def build_plan(legacy: dict[str, Any], legacy_workspace: Path | None) -> dict[str, Any]:
    project = map_project(legacy)
    legacy_project_id = legacy["project"]["id"]
    legacy_ws = Path(legacy["project"].get("workspace_path") or "")

    new_project_id = project["id"]
    warnings: list[str] = []
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    contents: dict[str, bytes] = {}
    versions: dict[str, bytes] = {}
    events: list[dict[str, Any]] = []
    mapping = {"project": {"legacyId": legacy_project_id, "newId": new_project_id},
               "episodes": [], "scenes": [], "contentVersions": [], "checkpoints": []}

    def node_id(kind: str, episode: int | None = None, scene: int | None = None) -> str:
        return "n_" + ulid_like("node", legacy_project_id, kind, episode, scene)

    def edge_id(frm: str, to: str, kind: str) -> str:
        return "e_" + ulid_like("edge", legacy_project_id, frm, to, kind)

    def add_node(node: dict[str, Any], content: str | None = None) -> None:
        index = len(nodes)
        w, h = NODE_SIZES[node["type"]]
        x, y = node_layout(index)
        node.update({"x": x, "y": y, "w": w, "h": h, "contentVersion": 0})
        if content is not None:
            rel = f"content/{node['id']}.md"
            node["contentFile"] = rel
            node["contentVersion"] = 1
            contents[rel] = content.encode("utf-8")
        else:
            node["contentFile"] = None
        nodes.append(node)

    def add_edge(frm: str, to: str, kind: str) -> None:
        edges.append({"id": edge_id(frm, to, kind), "from": frm, "to": to, "kind": kind})

    evidence = legacy["evidenceEvents"]
    evidence_by_version = {
        e["content_version_id"]: e for e in evidence
        if e.get("content_version_id") and e.get("content_version_id") in {
            v["id"] for v in legacy["contentVersions"]}
    }

    # --- project_root ---
    root_id = node_id("project_root")
    add_node({
        "id": root_id,
        "type": "project_root",
        "title": project["title"] or "项目根",
        "status": "approved",
        "ref": {"episode": None, "scene": None},
        "meta": {
            "audience": project["audience"],
            "genre": project["genre"],
            "episodeCount": project["episodeCount"],
            "logline": project["logline"],
        },
        "createdAt": project["createdAt"],
        "updatedAt": project["updatedAt"],
    })

    episode_nodes: dict[int, dict[str, str]] = {}
    for episode in legacy["episodes"]:
        ep_no = int(episode["episode_number"])
        status = EPISODE_STATUS_MAP.get(str(episode.get("status") or ""), "draft")
        created = legacy_datetime_to_iso(episode.get("created_at"))
        updated = legacy_datetime_to_iso(episode.get("updated_at"))

        beat_id = node_id("beat_sheet", ep_no)
        add_node({
            "id": beat_id,
            "type": "beat_sheet",
            "title": f"第{ep_no}集·分集节拍",
            "status": status,
            "ref": {"episode": ep_no, "scene": None},
            "meta": {"episode": ep_no, "hooks": [], "anchors": []},
            "createdAt": created,
            "updatedAt": updated,
        }, content=str(episode.get("summary") or ""))

        scene_list_id = node_id("scene_list", ep_no)
        ep_scenes = [s for s in legacy["scenes"] if s["_episode_number"] == ep_no]
        add_node({
            "id": scene_list_id,
            "type": "scene_list",
            "title": f"第{ep_no}集·分场表",
            "status": status,
            "ref": {"episode": ep_no, "scene": None},
            "meta": {
                "episode": ep_no,
                "scenes": [{
                    "no": int(scene["scene_number"]),
                    "location": f"{scene.get('location_type') or ''}·{scene.get('location_name') or ''}",
                    "time": str(scene.get("time") or ""),
                    "summary": "",
                } for scene in ep_scenes],
            },
            "createdAt": created,
            "updatedAt": updated,
        })

        episode_nodes[ep_no] = {"beat_sheet": beat_id, "scene_list": scene_list_id,
                                "status": status, "createdAt": created, "updatedAt": updated}
        mapping["episodes"].append({
            "episodeNumber": ep_no,
            "legacyId": episode["id"],
            "title": episode.get("title") or "",
            "statusLegacy": episode.get("status"),
            "beatSheetNodeId": beat_id,
            "sceneListNodeId": scene_list_id,
        })

    # --- script_scene ---
    for scene in legacy["scenes"]:
        ep_no = int(scene["_episode_number"])
        scene_no = int(scene["scene_number"])
        ep_info = episode_nodes[ep_no]
        node_id_ = node_id("script_scene", ep_no, scene_no)
        content = str(scene.get("content") or "")
        add_node({
            "id": node_id_,
            "type": "script_scene",
            "title": f"第{scene.get('scene_code') or f'{ep_no}-{scene_no}'}场",
            "status": SCENE_STATUS_MAP.get(str(scene.get("status") or ""), "draft"),
            "ref": {"episode": ep_no, "scene": scene_no},
            "meta": {
                "episode": ep_no,
                "sceneNo": str(scene.get("scene_code") or f"{ep_no}-{scene_no}"),
                "wordCount": net_word_count(content),
                "segment": None,
            },
            "createdAt": legacy_datetime_to_iso(scene.get("created_at")),
            "updatedAt": legacy_datetime_to_iso(scene.get("updated_at")),
        }, content=content)
        mapping["scenes"].append({
            "episodeNumber": ep_no,
            "sceneNumber": scene_no,
            "sceneCode": scene.get("scene_code") or "",
            "legacyId": scene["id"],
            "scriptSceneNodeId": node_id_,
            "contentFile": f"content/{node_id_}.md",
            "wordCountLegacy": int(scene.get("word_count") or 0),
            "wordCountMigrated": net_word_count(content),
        })

    # --- content_version → versions/<nodeId>/<ver>.md ---
    scene_node_by_key = {
        (m["episodeNumber"], m["sceneNumber"]): m["scriptSceneNodeId"] for m in mapping["scenes"]
    }
    for version in legacy["contentVersions"]:
        key = (int(version["episode_number"]), int(version["scene_number"] or 0))
        target_node = scene_node_by_key.get(key)
        if target_node is None:
            raise SystemExit(
                f"[migrate] content_version {version['id']} 指向不存在的场次 {key}")
        raw_path = Path(str(version.get("content_path") or ""))
        if not raw_path:
            raise SystemExit(f"[migrate] content_version {version['id']} 没有 content_path")
        try:
            rel_from_workspace = raw_path.resolve().relative_to(legacy_ws.resolve())
        except ValueError:
            raise SystemExit(
                f"[migrate] content_version {version['id']} 路径不在旧项目工作区 {legacy_ws} 内: {raw_path}")
        if legacy_workspace is None:
            raise SystemExit(
                "[migrate] 需要 --legacy-workspace 才能读取旧版本文件内容；"
                f"期望 {legacy_workspace / rel_from_workspace}")
        source_file = legacy_workspace / rel_from_workspace
        if not source_file.is_file():
            raise SystemExit(f"[migrate] 旧版本文件缺失: {source_file}")
        data = source_file.read_bytes()
        actual_hash = sha256_bytes(data)
        expected_hash = str(version.get("content_hash") or "")
        if expected_hash and actual_hash != expected_hash:
            raise SystemExit(
                f"[migrate] 版本 {version['version_code']} 内容哈希不一致: "
                f"db={expected_hash} file={actual_hash} ({source_file})")
        rel_out = f"versions/{target_node}/{version['version_code']}.md"
        if rel_out in versions:
            raise SystemExit(f"[migrate] 版本文件路径冲突: {rel_out}")
        versions[rel_out] = data
        evidence_row = evidence_by_version.get(version["id"])
        mapping["contentVersions"].append({
            "legacyId": version["id"],
            "episodeNumber": int(version["episode_number"]),
            "sceneNumber": int(version["scene_number"]),
            "versionCode": version["version_code"],
            "parentVersion": version.get("parent_version") or "",
            "editorType": version.get("editor_type") or "",
            "editorName": version.get("editor_name") or "",
            "sha256": actual_hash,
            "versionFile": rel_out,
            "evidenceEventId": evidence_row["id"] if evidence_row else "",
        })

    # 重新计算每个节点 contentVersion（有正文=最少 1；有版本=版本数）
    per_node_version_count: dict[str, int] = {}
    for version_map in mapping["contentVersions"]:
        node_ref = version_map["versionFile"].split("/")[1]
        per_node_version_count[node_ref] = per_node_version_count.get(node_ref, 0) + 1
    for node in nodes:
        if node["contentFile"]:
            node["contentVersion"] = max(1, per_node_version_count.get(node["id"], 0))

    # --- checkpoint → versions/<nodeId>/<cp>.json + canvas.rev + events ---
    for checkpoint in legacy["checkpoints"]:
        ep_no = int(checkpoint.get("episode_number") or 0)
        scene_no = int(checkpoint.get("scene_number") or 0)
        target_node = scene_node_by_key.get((ep_no, scene_no))
        if target_node is None:
            warnings.append(
                f"checkpoint {checkpoint['checkpoint_code']} 指向场次 {ep_no}-{scene_no}，"
                "场次不存在，按 project_root 归档")
            target_node = root_id
        raw_path = Path(str(checkpoint.get("data_path") or ""))
        data: bytes
        if raw_path and legacy_workspace is not None:
            try:
                rel_from_workspace = raw_path.resolve().relative_to(legacy_ws.resolve())
                source_file = legacy_workspace / rel_from_workspace
                data = source_file.read_bytes()
            except (ValueError, FileNotFoundError):
                warnings.append(f"checkpoint {checkpoint['checkpoint_code']} 旧快照文件缺失，"
                                f"改用 DB 元数据生成 ({raw_path})")
                data = json.dumps({
                    "source": "legacy.checkpoint(meta only)",
                    "checkpointCode": checkpoint["checkpoint_code"],
                    "episode": ep_no, "scene": scene_no,
                    "note": checkpoint.get("note") or "",
                }, ensure_ascii=False, indent=2).encode("utf-8")
        else:
            data = json.dumps({
                "source": "legacy.checkpoint(meta only)",
                "checkpointCode": checkpoint["checkpoint_code"],
                "episode": ep_no, "scene": scene_no,
                "note": checkpoint.get("note") or "",
            }, ensure_ascii=False, indent=2).encode("utf-8")
        rel_out = f"versions/{target_node}/{checkpoint['checkpoint_code']}.json"
        versions[rel_out] = data
        mapping["checkpoints"].append({
            "legacyId": checkpoint["id"],
            "checkpointCode": checkpoint["checkpoint_code"],
            "nodeId": target_node,
            "episodeNumber": ep_no,
            "sceneNumber": scene_no,
            "note": checkpoint.get("note") or "",
            "versionFile": rel_out,
        })

    # --- edges（DAG：project_root → beat_sheet → scene_list → script_scene；同类型按集 context） ---
    for ep_no in sorted(episode_nodes):
        info = episode_nodes[ep_no]
        add_edge(root_id, info["beat_sheet"], "dependency")
        add_edge(info["beat_sheet"], info["scene_list"], "dependency")
        for scene_map in mapping["scenes"]:
            if scene_map["episodeNumber"] == ep_no:
                add_edge(info["scene_list"], scene_map["scriptSceneNodeId"], "dependency")
    episode_numbers = sorted(episode_nodes)
    for prev, nxt in zip(episode_numbers, episode_numbers[1:]):
        add_edge(episode_nodes[prev]["beat_sheet"], episode_nodes[nxt]["beat_sheet"], "context")
        add_edge(episode_nodes[prev]["scene_list"], episode_nodes[nxt]["scene_list"], "context")

    # --- events.jsonl ---
    def event(seq: int, ts: str, actor: str, op: str, node: str | None,
              data: dict[str, Any], hash_seed: str) -> dict[str, Any]:
        return {
            "seq": seq,
            "ts": ts,
            "actor": actor,
            "op": op,
            "projectId": new_project_id,
            "nodeId": node,
            "data": data,
            "idempotencyKey": hashlib.sha1(
                f"{new_project_id}|{op}|{node or ''}|{hash_seed}".encode("utf-8")).hexdigest(),
        }

    evidence_project_created = next(
        (e for e in evidence if e.get("event_type") == "project_created"), None)
    project_created_ts = (legacy_datetime_to_iso(evidence_project_created.get("created_at"))
                          if evidence_project_created else project["createdAt"])
    seq = 1
    events.append(event(seq, project_created_ts, "system", "project.create", None, {
        "source": "legacy.project_v2",
        "legacyProjectId": legacy_project_id,
        "title": project["title"],
        "legacyStatus": project["_legacy"]["status"],
        "legacyWorkspacePath": project["_legacy"]["workspacePath"],
    }, legacy_project_id))
    seq += 1
    for node in nodes:
        events.append(event(seq, node["createdAt"], "system", "node.create", node["id"], {
            "nodeType": node["type"],
            "title": node["title"],
            "contentFile": node["contentFile"],
            "source": "legacy.episode/scene" if node["type"] != "project_root" else "legacy.project_v2",
        }, node["id"]))
        seq += 1
    for edge in edges:
        events.append(event(seq, project["createdAt"], "system", "edge.create", edge["from"], {
            "kind": edge["kind"], "from": edge["from"], "to": edge["to"], "edgeId": edge["id"],
        }, edge["id"]))
        seq += 1
    for version_map in mapping["contentVersions"]:
        evidence_row = evidence_by_version.get(version_map["legacyId"])
        ts = (legacy_datetime_to_iso(evidence_row.get("created_at")) if evidence_row
              else project["createdAt"])
        actor = EVENT_ACTOR_BY_EDITOR.get(version_map["editorType"], "system")
        target_node = scene_node_by_key[(version_map["episodeNumber"],
                                         version_map["sceneNumber"])]
        events.append(event(seq, ts, actor, "content.save", target_node, {
            "versionCode": version_map["versionCode"],
            "parentVersion": version_map["parentVersion"],
            "sha256": version_map["sha256"],
            "editorType": version_map["editorType"],
            "editorName": version_map["editorName"],
            "versionFile": version_map["versionFile"],
            "source": "legacy.content_version",
            "legacyVersionId": version_map["legacyId"],
        }, version_map["sha256"]))
        seq += 1
    for checkpoint_map in mapping["checkpoints"]:
        events.append(event(
            seq, project["updatedAt"], "system", "node.transition",
            checkpoint_map["nodeId"], {
                "reason": "legacy.checkpoint",
                "checkpointCode": checkpoint_map["checkpointCode"],
                "note": checkpoint_map["note"],
                "versionFile": checkpoint_map["versionFile"],
                "source": "legacy.checkpoint",
                "legacyCheckpointId": checkpoint_map["legacyId"],
            }, checkpoint_map["checkpointCode"]))
        seq += 1

    # 未映射的旧证据事件类型（fixture 中为 0，真实库出现时在此登记，不静默丢弃）
    mapped_event_types = {"project_created"}
    unmapped_evidence = [
        {"id": e["id"], "eventType": e.get("event_type"), "summary": e.get("summary")}
        for e in evidence
        if e.get("event_type") not in mapped_event_types
        and e["id"] not in {m["evidenceEventId"] for m in mapping["contentVersions"]}
    ]
    if unmapped_evidence:
        warnings.append(f"{len(unmapped_evidence)} 条 evidence_event 未映射进 events.jsonl（类型不在契约 op 表，见 manifest.unmappedEvidenceEvents）")

    canvas = {
        "schemaVersion": 1,
        "rev": 1 + len(mapping["checkpoints"]),
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": nodes,
        "edges": edges,
    }

    return {
        "project": project,
        "canvas": canvas,
        "contents": contents,
        "versions": versions,
        "events": events,
        "mapping": mapping,
        "warnings": warnings,
        "unmappedEvidenceEvents": unmapped_evidence,
        "sourceStats": {
            "projects": 1,
            "episodes": len(legacy["episodes"]),
            "scenes": len(legacy["scenes"]),
            "contentVersions": len(legacy["contentVersions"]),
            "checkpoints": len(legacy["checkpoints"]),
            "evidenceEvents": len(evidence),
            "contributionLedgerRows": legacy["ledgerCount"],
        },
    }


# ---------------------------------------------------------------------------
# 落盘
# ---------------------------------------------------------------------------

def plan_output_files(plan: dict[str, Any]) -> dict[str, bytes]:
    project_public = {k: v for k, v in plan["project"].items() if not k.startswith("_")}
    files: dict[str, bytes] = {
        "project.json": (json.dumps(project_public, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
        "canvas.json": (json.dumps(plan["canvas"], ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    }
    files.update(plan["contents"])
    files.update(plan["versions"])
    events_bytes = "".join(
        json.dumps(ev, ensure_ascii=False) + "\n" for ev in plan["events"]
    ).encode("utf-8")
    files["history/events.jsonl"] = events_bytes
    return files


def prune_previous_output(out: Path, new_files: dict[str, bytes]) -> list[str]:
    """只清理上一次迁移 manifest 里登记过的输出文件（绝不碰用户文件）。"""
    manifest_path = out / "history/migration-manifest.json"
    if not manifest_path.is_file():
        return []
    try:
        old = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    removed: list[str] = []
    for entry in old.get("generatedFiles") or []:
        rel = str(entry.get("path") or "")
        if not rel or rel in new_files:
            continue
        target = out / rel
        try:
            if target.is_file():
                target.unlink()
                removed.append(rel)
        except OSError:
            pass
    # 清理空目录（只清 content/ versions/ history/ 下）
    for root_name in ("content", "versions"):
        root = out / root_name
        if not root.exists():
            continue
        for path in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if path.is_dir():
                try:
                    path.rmdir()
                except OSError:
                    pass
    return removed


def write_output(out: Path, plan: dict[str, Any], source_db: Path, legacy_workspace: Path | None,
                 source_counts: dict[str, int], force: bool) -> dict[str, Any]:
    files = plan_output_files(plan)
    previous_removed = prune_previous_output(out, files)

    # 已存在非空目录且没有迁移标记：拒绝覆盖，避免误伤真实工作区
    marker = out / "history/migration-manifest.json"
    existing = [p for p in out.iterdir()] if out.exists() else []
    if existing and not marker.is_file() and not force:
        raise SystemExit(
            f"[migrate] 输出目录已存在且不是本工具生成的（缺 {marker}）。"
            "确认可覆盖后加 --force，或换一个 --out。")

    for rel, data in sorted(files.items()):
        atomic_write_bytes(out / rel, data)

    generated_files = [{
        "path": rel,
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    } for rel, data in sorted(files.items())]

    unmapped_tables = []
    internal_tables = []
    for table, count in sorted(source_counts.items()):
        if count <= 0:
            continue
        if table in TABLE_MAPPING:
            continue
        if table.startswith(SQLITE_INTERNAL_TABLE_PREFIXES) or table == "sqlite_sequence":
            internal_tables.append({
                "table": table, "rows": count,
                "destination": "SQLite 内部表（FTS 虚拟表/shadow 表），不迁移",
            })
            continue
        unmapped_tables.append({
            "table": table, "rows": count,
            "destination": "未建立映射：真实库出现即需裁定（数据契约-v1 §7 未覆盖）",
        })

    # 真实旧库里 deferred 表若非空：必须显式告警（不静默丢数据）
    non_empty_deferred = [
        {"table": table, "rows": source_counts.get(table, 0), "destination": TABLE_MAPPING[table][0]}
        for table in sorted(TABLE_MAPPING)
        if TABLE_MAPPING[table][1] == "deferred" and source_counts.get(table, 0) > 0
    ]
    warnings = list(plan["warnings"])
    for item in non_empty_deferred:
        warnings.append(
            f"表 {item['table']} 有 {item['rows']} 行数据：§7 有落点但 S2.3 未实现迁移，本次未迁移")

    manifest = {
        "migrationVersion": TOOL_VERSION,
        "tool": "scripts/migrate/legacy_sqlite_to_workspace.py",
        "source": {
            "db": str(source_db.resolve()),
            "dbSha256": sha256_bytes(source_db.read_bytes()),
            "legacyWorkspace": str(legacy_workspace.resolve()) if legacy_workspace else None,
            "legacyProjectWorkspacePath": plan["project"]["_legacy"]["workspacePath"],
        },
        "project": {
            "legacyId": plan["mapping"]["project"]["legacyId"],
            "newId": plan["mapping"]["project"]["newId"],
            "title": plan["project"]["title"],
        },
        "counts": {
            **plan["sourceStats"],
            "canvasNodes": len(plan["canvas"]["nodes"]),
            "canvasEdges": len(plan["canvas"]["edges"]),
            "contentFiles": len(plan["contents"]),
            "versionFiles": len(plan["versions"]),
            "events": len(plan["events"]),
        },
        "mapping": plan["mapping"],
        "generatedFiles": generated_files,
        "prunedPreviousFiles": previous_removed,
        "warnings": warnings,
        "nonEmptyDeferredTables": non_empty_deferred,
        "unmappedEvidenceEvents": plan["unmappedEvidenceEvents"],
        "sourceTableCounts": source_counts,
        "tableMigration": {
            "migrated": {t: v[0] for t, v in TABLE_MAPPING.items() if v[1] == "migrated"},
            "deferred": {t: v[0] for t, v in TABLE_MAPPING.items() if v[1] == "deferred"},
            "derived": {t: v[0] for t, v in TABLE_MAPPING.items() if v[1] == "derived"},
            "notMigrated": {t: v[0] for t, v in TABLE_MAPPING.items() if v[1] == "not_migrated"},
            "unmappedNonEmptyTables": unmapped_tables,
            "sqliteInternalTables": internal_tables,
        },
    }
    manifest_rel = "history/migration-manifest.json"
    atomic_write_json(out / manifest_rel, manifest)
    return {"generatedFiles": generated_files, "manifest": manifest,
            "manifestRel": manifest_rel, "prunedPreviousFiles": previous_removed,
            "warnings": warnings}


# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", required=True, help="旧 SQLite 路径（只读打开）")
    parser.add_argument("--out", required=True, help="输出项目根目录（工作区 <projectId>/）")
    parser.add_argument("--legacy-workspace", default=None,
                        help="旧工作区快照根目录（content_version / checkpoint 文件来源）")
    parser.add_argument("--project-id", default=None, help="旧库 project_v2.id；库中仅一个项目时可省略")
    parser.add_argument("--dry-run", action="store_true", help="只计算与校验，不落盘")
    parser.add_argument("--report", default=None, help="额外写一份 JSON 迁移报告到指定路径")
    parser.add_argument("--force", action="store_true", help="允许覆盖非本工具生成的输出目录")
    args = parser.parse_args()

    source_db = Path(args.db).resolve()
    if not source_db.is_file():
        raise SystemExit(f"[migrate] 旧库不存在: {source_db}")
    legacy_workspace = Path(args.legacy_workspace).resolve() if args.legacy_workspace else None
    if legacy_workspace is not None and not legacy_workspace.is_dir():
        raise SystemExit(f"[migrate] 旧工作区快照不存在: {legacy_workspace}")
    out = Path(args.out).resolve()

    con = open_ro(source_db)
    try:
        source_counts = table_counts(con)
        legacy = load_legacy(con, args.project_id)
    finally:
        con.close()

    plan = build_plan(legacy, legacy_workspace)
    files = plan_output_files(plan)

    print(f"[migrate] source db = {source_db}")
    print(f"[migrate] source sha256 = {sha256_bytes(source_db.read_bytes())}")
    print(f"[migrate] project {plan['mapping']['project']['legacyId']} "
          f"→ {plan['mapping']['project']['newId']} ({plan['project']['title']})")
    print(f"[migrate] source counts: {plan['sourceStats']}")
    print(f"[migrate] plan: nodes={len(plan['canvas']['nodes'])} "
          f"edges={len(plan['canvas']['edges'])} content={len(plan['contents'])} "
          f"versions={len(plan['versions'])} events={len(plan['events'])}")
    print(f"[migrate] content bytes total={sum(len(v) for v in plan['contents'].values())} "
          f"netWords={sum(net_word_count(v.decode('utf-8')) for v in plan['contents'].values())}")
    for warning in plan["warnings"]:
        print(f"[migrate] WARN {warning}")

    if args.dry_run:
        print(f"[migrate] --dry-run: 将写出 {len(files)} 个文件到 {out}（未写盘）")
        for rel in sorted(files):
            print(f"[migrate]   would write {rel} ({len(files[rel])} bytes)")
        return 0

    result = write_output(out, plan, source_db, legacy_workspace, source_counts, args.force)
    print(f"[migrate] OK 写出 {len(result['generatedFiles'])} 个文件 → {out}")
    if result["prunedPreviousFiles"]:
        print(f"[migrate] 清理上次迁移残留 {len(result['prunedPreviousFiles'])} 个文件")
    for warning in result["warnings"]:
        print(f"[migrate] WARN {warning}")
    report = {
        "ok": True,
        "out": str(out),
        "sourceDb": str(source_db),
        "sourceDbSha256": sha256_bytes(source_db.read_bytes()),
        "project": plan["project"],
        "sourceStats": plan["sourceStats"],
        "generatedFiles": result["generatedFiles"],
        "warnings": plan["warnings"],
        "tableMigration": result["manifest"]["tableMigration"],
        "generatedAt": datetime.now(TZ).isoformat(timespec="seconds"),
    }
    if args.report:
        report_path = Path(args.report).resolve()
        atomic_write_json(report_path, report)
        print(f"[migrate] report → {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
