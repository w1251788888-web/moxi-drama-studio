#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨戏生花 Harness² eval v1 · 确定性 grader CLI（纯标准库、离线可跑）。

用法：
  python3 harness/graders/grade.py --task E1 --output <file> [--json]
  python3 harness/graders/grade.py --all --run-dir <runs/stamp> [--json]
  python3 harness/graders/grade.py --selftest
  python3 harness/graders/grade.py --audit-isolation

约定：
  - 输出文件路径由任务 JSON 的 input.output.path 定义（如 E1 → project.json）
  - --all 时按 <run-dir>/<E1>/<output.path> 查找，找不到再递归找同名文件
  - 退出码：0 = 全部通过；1 = 有任务失败；2 = 用法/文件错误
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import checks  # noqa: E402
import graders  # noqa: E402

HARNESS_ROOT = Path(__file__).resolve().parents[1]
EVAL_DIR = HARNESS_ROOT / "eval" / "v1"
FORBIDDEN_ISOLATION_TOKENS = ["我的父母没素质", "父母没素质"]
REQUIRED_THEME_TOKEN = "海岛民宿继承"


# ---------------------------------------------------------------- 任务装载

def load_tasks():
    tasks = {}
    for path in sorted(EVAL_DIR.glob("E*_*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(data, dict) and data.get("id"):
            tasks[data["id"]] = data
    return tasks


def find_task(task_id):
    task = load_tasks().get(task_id)
    if task is None:
        raise SystemExit("未知任务：%s" % task_id)
    return task


def resolve_output(run_dir, task):
    name = task["input"]["output"]["path"]
    candidates = [Path(run_dir) / task["id"] / name, Path(run_dir) / name]
    for c in candidates:
        if c.is_file():
            return c
    hits = sorted(Path(run_dir).rglob(name))
    return hits[0] if hits else None


# ---------------------------------------------------------------- 单任务评分

def grade_one(task, output_path):
    func = getattr(graders, task["grader"]["function"], None)
    if func is None:
        raise SystemExit("任务 %s 的 grader 函数不存在：%s" % (task["id"], task["grader"]["function"]))
    if output_path is None or not Path(output_path).is_file():
        return {
            "task": task["id"],
            "output": str(output_path),
            "ok": False,
            "score": 0.0,
            "passedChecks": 0,
            "totalChecks": 1,
            "failed": ["output.missing"],
            "checks": [checks.check("output.missing", False, "未找到输出文件：%s" % output_path)],
        }
    return func(task, str(output_path), str(HARNESS_ROOT))


def print_result(result):
    print("%s %s  score=%.4f  (%d/%d checks)  output=%s" % (
        result["task"], "PASS" if result["ok"] else "FAIL",
        result["score"], result["passedChecks"], result["totalChecks"], result["output"]))
    for c in result["checks"]:
        if not c["ok"]:
            print("  [FAIL] %-26s %s" % (c["id"], c["detail"]))
    if result["ok"]:
        print("  （全部 checks 通过）")


# ---------------------------------------------------------------- 自测

def run_selftest():
    tasks = load_tasks()
    if not tasks:
        print("找不到任何任务 JSON（eval/v1/E*_*.json）")
        return 1
    failures = []
    print("== grader 自测（正例必须 PASS，反例必须 FAIL） ==")
    for task_id in sorted(tasks):
        task = tasks[task_id]
        for kind, expect_ok in (("positive", True), ("negative", False)):
            rel = task.get("selftest", {}).get(kind)
            if not rel:
                failures.append("%s %s：任务未配置 selftest 样本" % (task_id, kind))
                continue
            path = HARNESS_ROOT / rel
            result = grade_one(task, path)
            ok = result["ok"] is expect_ok
            print("  %s %-8s 期望 %-4s 实际 %-4s  %s" % (
                task_id, kind, "PASS" if expect_ok else "FAIL",
                "PASS" if result["ok"] else "FAIL",
                "OK" if ok else "✗ 失败项=%r" % (result["failed"],)))
            if not ok:
                failures.append("%s %s：期望 ok=%s，实际 ok=%s，失败项=%r" % (
                    task_id, kind, expect_ok, result["ok"], result["failed"]))

    # E5 额外自测：fixture 的 detector ground truth 必须与任务声明的 plantedCodes 一致
    if "E5" in tasks:
        task = tasks["E5"]
        config, err1 = checks.load_json_file(HARNESS_ROOT / task["expected"]["fixtureConfig"])
        draft, err2 = checks.read_text_file(HARNESS_ROOT / task["expected"]["fixtureDraft"])
        if err1 or err2:
            failures.append("E5 fixture 读取失败：%s" % (err1 or err2))
        else:
            detected = sorted(graders.detect_v1_codes(draft, config))
            planted = sorted(task["expected"]["plantedCodes"])
            ok = detected == planted
            print("  E5 fixture  detector=%r planted=%r  %s" % (detected, planted, "OK" if ok else "✗"))
            if not ok:
                failures.append("E5 fixture 漂移：detector %r != planted %r" % (detected, planted))

    if failures:
        print("\n自测失败 %d 项：" % len(failures))
        for f in failures:
            print("  - %s" % f)
        return 1
    print("\n自测通过：6 任务 × 正/反例 + E5 fixture 口径一致。")
    return 0


# ---------------------------------------------------------------- 隔离审计

def run_audit_isolation():
    tasks = load_tasks()
    problems = []
    scanned = 0

    def scan(label, text):
        nonlocal scanned
        scanned += 1
        for token in FORBIDDEN_ISOLATION_TOKENS:
            if token in text:
                problems.append("%s 出现验收项目 token：%r" % (label, token))

    for task_id, task in sorted(tasks.items()):
        scan("task %s input" % task_id, json.dumps(task.get("input", {}), ensure_ascii=False))
        theme = task.get("isolation", {}).get("evalTheme", "")
        if REQUIRED_THEME_TOKEN not in theme:
            problems.append("task %s isolation.evalTheme 未声明合成题材（缺 %r）" % (task_id, REQUIRED_THEME_TOKEN))
    # 任务 JSON 只扫描 input 段（isolation 元数据里允许出现验收项目名）；夹具与正反例全文扫描
    scanned_files = set()
    for base in (EVAL_DIR / "fixtures", HARNESS_ROOT / "graders" / "tests"):
        for path in sorted(base.rglob("*")):
            if path.is_file() and path not in scanned_files:
                scanned_files.add(path)
                scan(str(path.relative_to(HARNESS_ROOT)), path.read_text(encoding="utf-8", errors="ignore"))
    print("== 验收项目隔离审计 ==")
    print("扫描对象：%d 份（task input + fixtures + 正反例）" % scanned)
    print("禁用 token：%r；要求合成题材：%r" % (FORBIDDEN_ISOLATION_TOKENS, REQUIRED_THEME_TOKEN))
    if problems:
        print("发现问题 %d 条：" % len(problems))
        for p in problems:
            print("  - %s" % p)
        return 1
    print("通过：eval 题面/夹具/样例未复用《我的父母没素质》的内容。")
    return 0


# ---------------------------------------------------------------- main

def main(argv=None):
    parser = argparse.ArgumentParser(description="墨戏生花 Harness² eval v1 确定性 grader")
    parser.add_argument("--task", help="任务 id：E1…E6")
    parser.add_argument("--output", help="被测输出文件路径")
    parser.add_argument("--all", action="store_true", help="按 --run-dir 评测全部任务")
    parser.add_argument("--run-dir", help="一轮 rollout 的输出目录")
    parser.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    parser.add_argument("--selftest", action="store_true", help="跑 6 任务正/反例自测")
    parser.add_argument("--audit-isolation", action="store_true", help="审计 eval 与验收项目隔离")
    args = parser.parse_args(argv)

    if args.selftest:
        return run_selftest()
    if args.audit_isolation:
        return run_audit_isolation()

    if args.all:
        if not args.run_dir:
            parser.error("--all 需要 --run-dir")
        tasks = load_tasks()
        if not tasks:
            print("找不到任务 JSON")
            return 2
        results = []
        for task_id in sorted(tasks):
            output = resolve_output(args.run_dir, tasks[task_id])
            results.append(grade_one(tasks[task_id], output))
        summary = {
            "runDir": str(args.run_dir),
            "tasks": results,
            "passed": sum(1 for r in results if r["ok"]),
            "total": len(results),
            "roundScore": round(sum(1.0 if r["ok"] else 0.0 for r in results) / len(results), 4),
            "ok": all(r["ok"] for r in results),
        }
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        else:
            for r in results:
                print_result(r)
            print("\n本轮：%d/%d 任务通过，roundScore=%.4f" % (summary["passed"], summary["total"], summary["roundScore"]))
        return 0 if summary["ok"] else 1

    if not args.task or not args.output:
        parser.error("需要 --task 与 --output（或用 --all/--selftest/--audit-isolation）")
    task = find_task(args.task)
    result = grade_one(task, Path(args.output))
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_result(result)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
