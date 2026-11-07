#!/usr/bin/env python3
"""moxi QA · 30 集直出验收

判定（任一不满足 → exit 1）：
  1. 任务状态 done（无 failed 集）
  2. 30 集都有一集一个的 script_scene 节点，且都有正文
  3. 每集净字数落在 project.wordRange
  4. 每集质检节点 verdict != reject（findings 的 error = 0）
  5. 每集合规节点存在
  6. 导出 docx 成功且体积 > 20KB
  7. /stats 与磁盘一致性（调用 consistency.py 同一逻辑）
用法：
  python3 scripts/qa/acceptance_30.py --project <projectId> [--job <jobId>] [--episodes 30]
"""
import argparse
import json
import subprocess
import sys
import urllib.request
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import api  # noqa: E402

ROOT = Path(os.environ.get('MOXI_PROJECTS_ROOT', str(Path.home() / 'Documents' / 'Moxi' / 'projects')))


def net_words(text):
    import re
    cjk = len(re.findall(r'[\u4e00-\u9fff\u3400-\u4dbf]', text))
    latin = len(re.findall(r"[A-Za-z]+(?:['-][A-Za-z]+)*", text))
    digits = len(re.findall(r'\d+', text))
    return cjk + latin + digits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    ap.add_argument('--job')
    ap.add_argument('--episodes', type=int, default=30)
    ap.add_argument('--json-out')
    args = ap.parse_args()

    problems = []
    detail = {}

    project = api.post('/project/get', {'projectId': args.project})
    proj = project['project']
    canvas = project['canvas']
    wr = proj.get('wordRange') or {'min': 1000, 'max': 1550}
    detail['project'] = proj['title']
    detail['episodeCount'] = proj.get('episodeCount')

    jobs = api.post('/jobs/list', {'projectId': args.project})
    job = next((j for j in jobs if j['id'] == args.job), jobs[0] if jobs else None)  # jobs 已按时间倒序
    detail['job'] = {'id': job['id'], 'status': job['status'], 'progress': job['progress'], 'usage': job['usage']} if job else None
    if not job:
        problems.append('没有生成任务记录')
    else:
        if job['status'] != 'done':
            problems.append(f"任务状态 {job['status']}（期望 done）")
        if job['progress']['failed']:
            problems.append(f"失败集数 {job['progress']['failed']}")

    by_ep = {}
    for n in canvas['nodes']:
        if n['type'] in ('script_scene', 'quality', 'compliance'):
            ep = (n.get('ref') or {}).get('episode')
            if ep:
                by_ep.setdefault(ep, {})[n['type']] = n

    rows = []
    for ep in range(1, args.episodes + 1):
        rec = by_ep.get(ep) or {}
        script = rec.get('script_scene')
        quality = rec.get('quality')
        compliance = rec.get('compliance')
        row = {'ep': ep}
        if not script:
            problems.append(f'第 {ep} 集缺剧本节点')
            rows.append(row)
            continue
        content = api.post('/node/content', {'projectId': args.project, 'nodeId': script['id']})['text']
        words = net_words(content)
        meta = script.get('meta') or {}
        row.update({
            'nodeId': script['id'], 'status': script['status'],
            'words': words, 'inRange': wr['min'] <= words <= wr['max'],
            'hasQuality': bool(quality), 'hasCompliance': bool(compliance),
            'verdict': meta.get('verdict'),
        })
        if not content.strip():
            problems.append(f'第 {ep} 集正文为空')
        if not row['inRange']:
            problems.append(f"第 {ep} 集净字数 {words} 不在 {wr['min']}–{wr['max']}")
        if quality:
            qmeta = quality.get('meta') or {}
            rubric = qmeta.get('rubric') or {}
            if rubric.get('errors', 0) > 0 or rubric.get('verdict') == 'reject':
                problems.append(f"第 {ep} 集质检未通过（errors={rubric.get('errors')}）")
        else:
            problems.append(f'第 {ep} 集缺质检节点')
        if not compliance:
            problems.append(f'第 {ep} 集缺合规节点')
        rows.append(row)

    detail['episodes'] = rows
    detail['wordRange'] = wr

    # 导出
    try:
        exp = api.post('/export', {'projectId': args.project, 'format': 'docx'})
        detail['export'] = exp
        if exp.get('format') != 'docx':
            problems.append(f"导出被降级为 {exp.get('format')}（期望 docx）：{exp.get('fallback')}")
        if exp.get('fallback'):
            problems.append(f"导出发生降级：{exp.get('fallback')}")
        if not exp.get('path') or exp.get('bytes', 0) < 20000:
            problems.append(f"导出异常：{exp}")
    except Exception as e:  # noqa: BLE001
        problems.append(f'导出失败：{e}')

    # 一致性
    try:
        out = subprocess.run([sys.executable, str(Path(__file__).parent / 'consistency.py')],
                             capture_output=True, text=True, timeout=120)
        detail['consistencyExit'] = out.returncode
        if out.returncode != 0:
            problems.append('数值一致性校验失败（见 consistency.py 输出）')
    except Exception as e:  # noqa: BLE001
        problems.append(f'一致性校验异常：{e}')

    detail['problems'] = problems
    detail['ok'] = not problems
    print(json.dumps(detail, ensure_ascii=False, indent=2))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if not problems else 1


if __name__ == '__main__':
    sys.exit(main())
