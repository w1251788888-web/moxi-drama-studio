#!/usr/bin/env python3
"""moxi QA · 前后端数值一致性校验

三层对照：
  A. /stats（后端权威 API）
  B. 直接扫磁盘工作区（独立实现，不经过 moxi-core）
  C. 可选：UI 文本（由浏览器测试单独做，这里只做 A vs B）

用法：python3 scripts/qa/consistency.py
退出码 0 = 全部偏差 0
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import api  # noqa: E402

ROOT = Path(os.environ.get(
    'MOXI_PROJECTS_ROOT',
    str(Path.home() / 'Documents' / 'Moxi' / 'projects'),
))


def scan_disk(project_id):
    """独立实现：只读文件，不复用 moxi-core 代码"""
    d = ROOT / project_id
    canvas = json.loads((d / 'canvas.json').read_text(encoding='utf-8'))
    words = 0
    episodes = 0
    by_status = {}
    for n in canvas['nodes']:
        by_status[n['status']] = by_status.get(n['status'], 0) + 1
        ep = (n.get('ref') or {}).get('episode')
        if n['type'] == 'script_scene' and ep:
            episodes = max(episodes, int(ep))
        cf = n.get('contentFile')
        if cf:
            p = d / cf
            if p.exists():
                words += len(''.join(p.read_text(encoding='utf-8').split()))
    return {
        'nodes': len(canvas['nodes']),
        'edges': len(canvas['edges']),
        'rev': canvas.get('rev'),
        'words': words,
        'episodes': episodes,
        'byStatus': by_status,
        'pending': by_status.get('review', 0) + by_status.get('rejected', 0),
    }


def main():
    stats = api.post('/stats')
    diffs = []
    checked = 0
    for row in stats['projects']:
        disk = scan_disk(row['id'])
        checked += 1
        for key in ('nodes', 'edges', 'words', 'episodes', 'pending'):
            if row[key] != disk[key]:
                diffs.append(f"{row['title']}: {key} api={row[key]} disk={disk[key]}")
        if row['id'] == 'TOTAL':
            continue
    # 汇总核对
    total_disk = {'nodes': 0, 'edges': 0, 'words': 0, 'pending': 0}
    for row in stats['projects']:
        disk = scan_disk(row['id'])
        for k in total_disk:
            total_disk[k] += disk[k]
    for k, v in total_disk.items():
        if stats['total'][k] != v:
            diffs.append(f"TOTAL: {k} api={stats['total'][k]} disk={v}")

    report = {
        'projectsChecked': checked,
        'apiTotal': stats['total'],
        'diskTotal': total_disk,
        'diffs': diffs,
        'exitCode': 0 if not diffs else 1,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not diffs else 1


if __name__ == '__main__':
    sys.exit(main())
