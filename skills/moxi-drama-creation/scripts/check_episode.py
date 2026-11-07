#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
墨戏生花 · 集纲/剧本 确定性检查脚本

定位：SKILL.md「检查与反馈循环」里那个"尚未实现"的脚本的第一版。
只做**能计数、能写正则**的事，不碰任何需要语义理解的部分（那是模型的活，
而且模型在 emotion r=0.09 / density r=0.207 上与人评几乎不相关，别信直觉分）。

设计原则：
    1. 纯标准库，零依赖，可直接 copy 到任何项目
    2. 只报告，不改写——修是智能体的事
    3. 硬失败项退出码 1；告警不影响退出码，但必须打印

用法：
    python3 check_episode.py --file 细纲.md --protagonists "陆时,苏芮" --antagonist 姜蔓

    # 豁免反派视点集（全剧 ≤2 集），并把在场率阈值放宽到 80%
    python3 check_episode.py --file 细纲.md --protagonists "陆时,苏芮" \
        --exempt-eps 5 --min-presence 0.80

    # 只查字数与钩子（没有命题主语配置时）
    python3 check_episode.py --file 细纲.md

    # 剧本模式（一个文件 = 一集；正文取 "## 正文" 标题下的内容）
    python3 check_episode.py --file 第01集.md --single --body-section 正文 \
        --words-min 950 --words-max 1000 --protagonists "陆时,苏芮"

退出码：
    0 = 无硬失败（可能有告警）
    1 = 存在硬失败，必须修完再提交
    2 = 用法/解析错误
"""

import argparse
import re
import sys
from collections import Counter

# ---- 常量 ----

VALID_HOOKS = {f"H{i}" for i in range(1, 12)}          # H1-H11
HOOK_WINDOW = 5                                         # 5 集滑窗
HOOK_WINDOW_MAX = 3                                     # 滑窗内同标签上限（达到即失败）
PASSIVE_MARKERS = ["只想", "只是", "希望有人", "想被", "不知道该", "想弄明白", "想被看见"]

RESULT_FAIL, RESULT_WARN, RESULT_OK = "硬失败", "告警", "通过"

# 由 main() 按 CLI 参数赋值（避免把编译期常量散到各函数签名里）
HEADER_RE = None        # 场景标头正则，如 **【1】 公寓 · 主卧 · 清晨
COUNT_HEADERS = False   # 场景标头是否计入字数（默认不计，剧本行业惯例）


def die(msg, code=2):
    print(f"[用法错误] {msg}", file=sys.stderr)
    sys.exit(code)


# ---- 解析 ----

def parse_episodes(text, ep_pattern, body_pattern):
    """按集切块，返回 [(集号, 标题, 正文, 整块文本), ...]"""
    ep_re = re.compile(ep_pattern)
    heads = list(ep_re.finditer(text))
    if not heads:
        return []

    # 每集的块 = 从本集标题到下一集标题（或到"## "级别的分隔/文末）
    eps = []
    for i, m in enumerate(heads):
        start = m.end()
        # 下一个边界：下一集标题，或下一个二级标题，或文末
        cands = [len(text)]
        if i + 1 < len(heads):
            cands.append(heads[i + 1].start())
        nxt = re.search(r"\n## ", text[start:])
        if nxt:
            cands.append(start + nxt.start())
        end = min(cands)

        block = text[start:end]
        bm = re.search(body_pattern + r"\n(.+?)\n", block, re.S)
        claimed = int(bm.group(1)) if bm else None
        raw = bm.group(2) if bm else ""
        text_body, n_header = _clean_body(raw, HEADER_RE, COUNT_HEADERS)
        eps.append({
            "num": int(m.group(1)),
            "title": m.group(2),
            "body": text_body,
            "scenes": n_header,
            "claimed": claimed,
            "block": block,
        })
    return eps


def parse_single(text, ep_pattern, body_section):
    """单集剧本模式：一个文件就是一集（如 第01集.md）。

    正文 = `--body-section` 指定标题下的内容，直到下一个同级或更高级标题。
    """
    m = re.search(ep_pattern, text)
    num = int(m.group(1)) if m else 1
    title = m.group(2) if m else "(未命名)"

    body = ""
    if body_section:
        hm = re.search(r"^#{1,6}\s*" + re.escape(body_section) + r"\s*$", text, re.M)
        if hm:
            rest = text[hm.end():]
            nxt = re.search(r"^#{1,6}\s", rest, re.M)
            body = rest[:nxt.start()] if nxt else rest

    # 标称字数：优先找 "N 字" 的显式声明（取正文字数相关那一条）
    claimed = None
    for pat in (r"正文[^\n]{0,10}?(\d+)\s*字", r"单集字数[^\n]{0,10}?(\d+)\s*字",
                r"共\s*(\d+)\s*字", r"含标点总字符[^\n]{0,8}?(\d+)", r"总字符[^\n]{0,8}?(\d+)"):
        cm = re.search(pat, text)
        if cm:
            claimed = int(cm.group(1))
            break

    text_body, n_header = _clean_body(body, HEADER_RE, COUNT_HEADERS)
    return [{"num": num, "title": title, "body": text_body,
             "scenes": n_header, "claimed": claimed, "block": text}]


def _clean_body(s, header_re=None, count_headers=False):
    """去掉标题行与分隔线，只留正文。

    用 "" 拼接而不是 "\n"——换行符不该计入字数（第一版踩过这个坑：
    63 个换行被算成 63 个字，997 报成了 1148）。

    返回 (正文, 场景标头数)。场景标头默认不计入字数（剧本行业惯例，
    也是项目内既有脚本核验采用的口径），可用 --count-headers 打开。
    """
    body, n_header = [], 0
    for ln in s.split("\n"):
        t = ln.strip()
        if not t or t.startswith("#") or set(t) <= set("-—*"):
            continue
        if header_re and header_re.match(t):
            n_header += 1
            if not count_headers:
                continue
        body.append(t)
    return "".join(body), n_header


def get_hook(block):
    # 兼容三种写法：`hook_subtag`：H1 / `hook_subtag` = **H1 预示冲突** / hook_subtag H1
    m = re.search(r"`?hook_subtag`?[^\nH]{0,12}?(H\d+)", block)
    return m.group(1) if m else None


def get_subgoal(block):
    m = re.search(r"`subgoal_for_protagonist`[：:]\s*(.+)", block)
    return m.group(1).strip() if m else None


# ---- 检查项 ----

def check_words(eps, wmin, wmax, smin=0, smax=0):
    """正文字数（区间 + 标称实测一致）+ 场数。全部硬失败。"""
    hard, warn, rows = [], [], []
    for e in eps:
        if not e["body"]:
            warn.append(f"第 {e['num']} 集：未解析到正文，跳过字数检查")
            continue
        real = len(e["body"])
        ok_range = wmin <= real <= wmax
        drift = None if e["claimed"] is None else real - e["claimed"]
        if not ok_range:
            hard.append(f"第 {e['num']} 集正文字数 {real}，超出区间 {wmin}-{wmax}")
        if drift:
            hard.append(f"第 {e['num']} 集字数标称与实测不一致：标称 {e['claimed']}，"
                        f"实测 {real}（差 {drift:+d}）——标称必须来自实测，禁止估算")

        scenes = e.get("scenes", 0)
        ok_scene = True
        if scenes and smax and scenes > smax:
            hard.append(f"第 {e['num']} 集场数 {scenes} > 上限 {smax}")
            ok_scene = False
        if scenes and smin and scenes < smin:
            hard.append(f"第 {e['num']} 集场数 {scenes} < 下限 {smin}")
            ok_scene = False
        rows.append((e["num"], e["title"], real, e["claimed"], drift, ok_range,
                     scenes, ok_scene))
    return hard, warn, rows


def check_hooks(eps):
    """钩子合法性 + 多样性窗口。"""
    hard, warn = [], []
    seq, bad_eps = [], []
    for e in eps:
        h = get_hook(e["block"])
        if h is None:
            hard.append(f"第 {e['num']} 集：缺 `hook_subtag`")
            seq.append(None)
            continue
        if h not in VALID_HOOKS:
            hard.append(f"第 {e['num']} 集：hook_subtag `{h}` 不在 H1-H11")
        seq.append(h)

    for i in range(len(seq) - 1):
        if seq[i] and seq[i] == seq[i + 1]:
            hard.append(f"第 {i+1}/{i+2} 集钩子完全相同（{seq[i]}）→ hook_diversity_pass = false")
    for i in range(len(seq) - HOOK_WINDOW + 1):
        w = [x for x in seq[i:i + HOOK_WINDOW] if x]
        over = [k for k, v in Counter(w).items() if v >= HOOK_WINDOW_MAX]
        if over:
            hard.append(f"第 {i+1}-{i+HOOK_WINDOW} 集滑窗内 {over} 出现 ≥{HOOK_WINDOW_MAX} 次 "
                        f"→ hook_diversity_pass = false")
    return hard, warn, seq


def check_presence(eps, protagonists, min_rate=0.90, exempt=()):
    """命题主语在场率 + 连续零出场。exempt = 豁免集号（反派视点集，全剧 ≤2）。"""
    hard, warn, detail = [], [], {}
    if not protagonists:
        return hard, warn, detail

    checked = [e for e in eps if e["num"] not in exempt]
    base = len(checked) if checked else len(eps)
    if exempt:
        warn.append(f"已豁免集号 {sorted(exempt)}（反派视点集），在场率按 {base} 集计算")

    for p in protagonists:
        hits = [bool(p in e["body"]) for e in checked]
        cnt = sum(hits)
        rate = cnt / base if base else 0
        # 最长连续缺席（跨豁免集也连续计——豁免不该掩盖真的断供）
        all_hits = {e["num"]: bool(p in e["body"]) for e in eps}
        longest = cur = 0
        for e in eps:
            cur = 0 if all_hits[e["num"]] else cur + 1
            longest = max(longest, cur)
        detail[p] = {"cnt": cnt, "rate": rate, "base": base,
                     "longest_absent": longest,
                     "eps": [e["num"] for e in checked if all_hits[e["num"]]],
                     "absent": [e["num"] for e in eps if not all_hits[e["num"]]]}

        if rate < min_rate:
            hard.append(f"命题主语「{p}」在场率 {rate:.0%}（{cnt}/{base}）< {min_rate:.0%} "
                        f"—— 剧名的主语被移出画面；缺席集号 {detail[p]['absent']}")
        if longest >= 3:
            hard.append(f"命题主语「{p}」连续 {longest} 集零出场（阈值 ≥3）")

    # 全部命题主语同场率（只记录）
    if len(protagonists) > 1:
        both = sum(1 for e in checked if all(p in e["body"] for p in protagonists))
        warn.append(f"全部命题主语同场：{both}/{base}（记录，不卡阈值）")
    return hard, warn, detail


def check_antagonist_dominance(eps, protagonists, antagonist):
    """叙事主体倒挂（告警）。"""
    warn = []
    if not antagonist or not protagonists:
        return warn
    a_cnt = sum(1 for e in eps if antagonist in e["body"])
    for p in protagonists:
        p_cnt = sum(1 for e in eps if p in e["body"])
        if a_cnt > p_cnt:
            warn.append(f"叙事主体倒挂：反派「{antagonist}」在场 {a_cnt} 集 > 命题主语"
                        f"「{p}」在场 {p_cnt} 集 —— 镜头倒向了有动作的一方")
    return warn


def check_subgoal(eps):
    """主角目标是'目标'还是'状态描述'（告警 + 人工确认）。"""
    warn = []
    for e in eps:
        g = get_subgoal(e["block"])
        if not g:
            continue
        hit = [m for m in PASSIVE_MARKERS if m in g]
        if hit:
            warn.append(f"第 {e['num']} 集 `subgoal_for_protagonist` 疑似状态描述（命中 {hit}）：「{g}」")
    return warn


def check_titles(eps):
    hard = []
    dup = [t for t, c in Counter(e["title"] for e in eps).items() if c > 1]
    if dup:
        hard.append(f"集标题重复：{dup}")
    return hard


def check_flaw_display(eps, protagonists):
    """命题主语的「缺陷展示」——本剧标题命题的兑现方式。

    在场率只能证明"人在场"，证明不了"人在演命题"。
    判例：v1.0 的 11-20 集双亲同场 10/10，但两人全程站着陪主角做抉择，
    标题命题（《我的父母没素质》的"没素质"）一次都没演——脚本全绿，剧没了。

    规则：每集 `flaw_display` 必须存在，且**每个命题主语各占一件具体行为**。
    """
    hard, warn, ok_cnt = [], [], 0
    if not protagonists:
        return hard, warn, ok_cnt
    for e in eps:
        m = re.search(r"`flaw_display`[：:]\s*(.+)", e["block"])
        if not m:
            hard.append(f"第 {e['num']} 集：缺 `flaw_display`——命题主语这一集没有演标题命题")
            continue
        val = m.group(1)
        missing = [p for p in protagonists if p not in val]
        if missing:
            hard.append(f"第 {e['num']} 集 `flaw_display` 缺 {missing} 的具体行为"
                        f"（每个命题主语各一件，不能只写一个人）")
        elif len(val.strip()) < 12:
            hard.append(f"第 {e['num']} 集 `flaw_display` 太笼统：「{val}」——要写具体可拍的行为")
        else:
            ok_cnt += 1
    return hard, warn, ok_cnt


# ---- 输出 ----

def emit(title, items, level):
    if not items:
        print(f"  ✅ {title}")
        return
    tag = "❌" if level == RESULT_FAIL else "⚠️ "
    print(f"  {tag} {title}（{level}）")
    for it in items:
        print(f"       - {it}")


def main():
    ap = argparse.ArgumentParser(description="墨戏生花 · 集纲/剧本确定性检查")
    ap.add_argument("--file", required=True, help="待检查的 markdown 文件（绝对路径）")
    ap.add_argument("--protagonists", default="", help="命题主语，逗号分隔，如 陆时,苏芮")
    ap.add_argument("--antagonist", default="", help="反派/对手名（用于叙事主体倒挂告警）")
    ap.add_argument("--ep-pattern", default=r"### 第 (\d+) 集《([^》]+)》", help="集标题正则")
    ap.add_argument("--body-pattern", default=r"\*\*集纲正文（(\d+) 字）\*\*",
                    help="正文标记正则，须含一个捕获组取标称字数")
    ap.add_argument("--words-min", type=int, default=150, help="正文字数下限")
    ap.add_argument("--words-max", type=int, default=250, help="正文字数上限")
    ap.add_argument("--min-presence", type=float, default=0.90,
                    help="命题主语在场率下限（默认 0.90）")
    ap.add_argument("--exempt-eps", default="",
                    help="豁免集号，逗号分隔（反派视点集，全剧 ≤2 集）")
    ap.add_argument("--single", action="store_true",
                    help="单集模式：一个文件就是一集（剧本常用）")
    ap.add_argument("--body-section", default="",
                    help="单集模式下，正文所在的一级/二级标题名，如 正文")
    ap.add_argument("--scene-header", default=r"\*\*【",
                    help="场景标头正则（默认 **【 ）。用于场数统计与字数剔除")
    ap.add_argument("--count-headers", action="store_true",
                    help="场景标头计入字数（默认不计）")
    ap.add_argument("--scenes-min", type=int, default=0, help="场数下限（0=不检查）")
    ap.add_argument("--scenes-max", type=int, default=0, help="场数上限（0=不检查）")
    args = ap.parse_args()

    global HEADER_RE, COUNT_HEADERS
    HEADER_RE = re.compile(args.scene_header) if args.scene_header else None
    COUNT_HEADERS = args.count_headers

    try:
        text = open(args.file, encoding="utf-8").read()
    except OSError as e:
        die(f"读不到文件 {args.file}：{e}")

    if args.single:
        eps = parse_single(text, args.ep_pattern, args.body_section)
    else:
        eps = parse_episodes(text, args.ep_pattern, args.body_pattern)
    if not eps:
        die("没解析到任何一集——多集模式检查 --ep-pattern，单集模式加 --single")

    protagonists = [x.strip() for x in args.protagonists.split(",") if x.strip()]
    exempt = {int(x) for x in args.exempt_eps.split(",") if x.strip()}

    print(f"\n=== 墨戏生花 · 确定性检查 ===")
    print(f"文件：{args.file}")
    print(f"解析到 {len(eps)} 集 | 命题主语：{protagonists or '（未配置，跳过在场率检查）'}")
    print(f"正文字数区间：{args.words_min}-{args.words_max}\n")

    all_hard, all_warn = [], []

    # 1 字数
    print("【1】正文字数（区间 + 标称实测一致）与场数")
    h, w, rows = check_words(eps, args.words_min, args.words_max,
                             args.scenes_min, args.scenes_max)
    for num, title, real, claimed, drift, ok, scenes, ok_scene in rows:
        flag = "" if drift in (None, 0) else f"  标称差 {drift:+d}"
        mark = "✓" if ok and ok_scene and drift in (None, 0) else "✗"
        s = f" | {scenes} 场" if scenes else ""
        print(f"      {mark} 第 {num:>2} 集《{title}》 实测 {real} 字{s}{flag}")
    if not COUNT_HEADERS:
        print("      （字数口径：场景标头不计入；加 --count-headers 可计入）")
    emit("区间/标称/场数", h, RESULT_FAIL)
    all_hard += h; all_warn += w

    # 2 钩子
    print("\n【2】集末钩子（合法性 + 多样性窗口）")
    h, w, seq = check_hooks(eps)
    print(f"      序列：{' / '.join(str(x) for x in seq)}")
    print(f"      分布：{dict(Counter(x for x in seq if x))}")
    emit("钩子", h, RESULT_FAIL)
    all_hard += h; all_warn += w

    # 3 命题主语在场
    print("\n【3】命题主语在场率（防「剧名的主语被写没了」）")
    if not protagonists:
        print("      ⏭  未配置 --protagonists，跳过（强烈建议配置）")
    else:
        h, w, detail = check_presence(eps, protagonists, args.min_presence, exempt)
        for p, d in detail.items():
            print(f"      「{p}」在场 {d['cnt']}/{d['base']} = {d['rate']:.0%} | "
                  f"最长连续缺席 {d['longest_absent']} 集 | 缺席集号 {d['absent']}")
        emit("命题主语在场", h, RESULT_FAIL)
        all_hard += h; all_warn += w

    # 4 叙事主体倒挂
    print("\n【4】叙事主体倒挂")
    w = check_antagonist_dominance(eps, protagonists, args.antagonist)
    emit("倒挂", w, RESULT_WARN)
    all_warn += w

    # 5 主角目标
    print("\n【5】主角目标是'目标'还是'状态描述'")
    w = check_subgoal(eps)
    emit("subgoal 判定", w, RESULT_WARN)
    all_warn += w

    # 6 标题去重
    print("\n【6】集标题去重")
    h = check_titles(eps)
    emit("标题", h, RESULT_FAIL)
    all_hard += h

    # 7 命题主语的缺陷展示
    print("\n【7】命题主语的「缺陷展示」（标题命题有没有被演出来）")
    if not protagonists:
        print("      ⏭  未配置 --protagonists，跳过")
    else:
        h, w, ok = check_flaw_display(eps, protagonists)
        print(f"      每集两人各一件：{ok}/{len(eps)}")
        emit("flaw_display", h, RESULT_FAIL)
        all_hard += h; all_warn += w

    # 汇总
    print("\n" + "=" * 60)
    if all_hard:
        print(f"❌ 硬失败 {len(all_hard)} 项，必须修完再提交：")
        for i, it in enumerate(all_hard, 1):
            print(f"   {i}. {it}")
    else:
        print("✅ 无硬失败")
    if all_warn:
        print(f"\n⚠️  告警 {len(all_warn)} 项（不阻断，但要看）：")
        for i, it in enumerate(all_warn, 1):
            print(f"   {i}. {it}")
    print("=" * 60 + "\n")
    sys.exit(1 if all_hard else 0)


if __name__ == "__main__":
    main()
