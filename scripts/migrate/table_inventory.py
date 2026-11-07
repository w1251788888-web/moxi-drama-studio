#!/usr/bin/env python3
"""生成旧库 92 张表 → 新落点的迁移盘点清单（报告附表用）。

复用 legacy_sqlite_to_workspace.py 的 TABLE_MAPPING 口径，输出 JSON：
    {tables:[{table, rows, destination, status}], summary:{...}}

用法：
    python3 table_inventory.py --db analysis/migrate/legacy-snapshot/tasks.db \
        --out analysis/migrate/table-inventory.json
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from legacy_sqlite_to_workspace import (  # noqa: E402
    SQLITE_INTERNAL_TABLE_PREFIXES, TABLE_MAPPING, open_ro, table_counts,
)


def classify(table: str, rows: int) -> dict:
    if table in TABLE_MAPPING:
        destination, status = TABLE_MAPPING[table]
        return {"table": table, "rows": rows, "destination": destination, "status": status}
    if table.startswith(SQLITE_INTERNAL_TABLE_PREFIXES) or table == "sqlite_sequence":
        return {"table": table, "rows": rows,
                "destination": "SQLite 内部表（FTS 虚拟表/shadow 表）",
                "status": "sqlite_internal"}
    if rows > 0:
        return {"table": table, "rows": rows,
                "destination": "未建立映射（fixture 非空，需裁定；数据契约-v1 §7 未列）",
                "status": "unmapped_nonempty"}
    return {"table": table, "rows": rows,
            "destination": "未建立映射（fixture 为空，S2.3 未覆盖）",
            "status": "unmapped_empty"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    con = open_ro(Path(args.db))
    try:
        counts = table_counts(con)
    finally:
        con.close()
    tables = [classify(table, rows) for table, rows in sorted(counts.items())]
    summary: dict[str, int] = {}
    for item in tables:
        summary[item["status"]] = summary.get(item["status"], 0) + 1
    summary["totalTables"] = len(tables)
    summary["nonEmptyTables"] = sum(1 for item in tables if item["rows"] > 0)
    payload = {"source": str(Path(args.db).resolve()),
               "sqliteMasterTables": len(tables),
               "note": "sqlite_master 92 张 = 86 张业务表 + search_documents_fts 虚拟表及其 5 张 shadow 表",
               "summary": summary,
               "tables": tables}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    print(f"[table-inventory] → {out.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
