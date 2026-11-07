"""墨戏生花 Harness² eval v1 · 6 个确定性 grader。

每个任务一个函数：grade_E1 … grade_E6。全部判定为纯规则判定，不调用模型、不联网。

返回结构：
{
  "task": "E1",
  "output": "<path>",
  "ok": true/false,          # 全部 checks 通过才 ok
  "score": 0.0-1.0,          # 通过项/总项，仅用于排序参考
  "passedChecks": n, "totalChecks": m,
  "failed": ["check.id", ...],
  "checks": [{"id","ok","detail"}, ...]
}
"""

import re
from pathlib import Path

from checks import (
    SCENE_INOUT_TOKENS,
    SCENE_TIME_TOKENS,
    FORBIDDEN_TITLE_PUNCT,
    SENTENCE_END_RE,
    cjk_count,
    check,
    finalize,
    load_json_file,
    match_bracket_header,
    net_word_count,
    norm_text,
    parse_people_line,
    parse_script,
    parse_scenes,
    parse_iso8601,
    read_text_file,
    split_header_content,
    split_paragraphs,
    strip_book_title,
)


def _p(harness_root, rel):
    return Path(harness_root) / rel


def _ep_text(ep):
    import json

    return json.dumps(ep, ensure_ascii=False)


def _load_fixture_json(task, key, harness_root):
    rel = task.get("expected", {}).get(key)
    if not rel:
        return None, "任务缺少 expected.%s" % key
    return load_json_file(_p(harness_root, rel))


# ================================================================ E1 项目初始化

def grade_E1(task, output_path, harness_root):
    exp = task["expected"]
    data, err = load_json_file(output_path)
    checks = [check("E1.json_parse", err is None, err or "OK")]
    if err:
        return finalize("E1", output_path, checks)
    if not isinstance(data, dict):
        checks.append(check("E1.json_object", False, "顶层必须是 JSON object，实际 %s" % type(data).__name__))
        return finalize("E1", output_path, checks)

    required = exp["requiredKeys"]
    keys = set(data.keys()) if isinstance(data, dict) else set()
    checks.append(check(
        "E1.keys.complete",
        isinstance(data, dict) and not (set(required) - keys),
        "缺失字段：%s" % sorted(set(required) - keys) if set(required) - keys else "OK",
    ))
    extra = keys - set(required)
    checks.append(check("E1.keys.no_unknown", not extra, "未定义字段：%s" % sorted(extra) if extra else "OK"))

    vals = exp["values"]
    checks.append(check("E1.schemaVersion", data.get("schemaVersion") == vals["schemaVersion"],
                        "schemaVersion=%r" % data.get("schemaVersion")))
    checks.append(check("E1.id", isinstance(data.get("id"), str) and re.match(exp["idPattern"], data["id"]) is not None,
                        "id=%r" % data.get("id")))
    checks.append(check("E1.title", strip_book_title(str(data.get("title", ""))) == exp["title"],
                        "title=%r（期望 %r，且不得带书名号）" % (data.get("title"), exp["title"])))
    logline = data.get("logline") or ""
    checks.append(check("E1.logline",
                        cjk_count(logline) >= exp["logline"]["minCJK"]
                        and all(s in logline for s in exp["logline"]["mustContain"]),
                        "logline 汉字 %d（需 ≥%d 且含 %s）" % (cjk_count(logline), exp["logline"]["minCJK"],
                                                              "/".join(exp["logline"]["mustContain"]))))
    genre = data.get("genre") if isinstance(data.get("genre"), dict) else {}
    checks.append(check("E1.genre", genre.get("main") == exp["genre"]["main"] and genre.get("sub") == exp["genre"]["sub"],
                        "genre=%r" % (data.get("genre"),)))
    checks.append(check("E1.audience", data.get("audience") == vals["audience"], "audience=%r" % data.get("audience")))
    checks.append(check("E1.format", data.get("format") == vals["format"], "format=%r" % data.get("format")))
    checks.append(check("E1.episodeCount",
                        isinstance(data.get("episodeCount"), int) and not isinstance(data.get("episodeCount"), bool)
                        and data["episodeCount"] == vals["episodeCount"], "episodeCount=%r" % data.get("episodeCount")))
    checks.append(check("E1.episodeSeconds",
                        isinstance(data.get("episodeSeconds"), int) and not isinstance(data.get("episodeSeconds"), bool)
                        and data["episodeSeconds"] == vals["episodeSeconds"],
                        "episodeSeconds=%r" % data.get("episodeSeconds")))
    wr = data.get("wordRange") if isinstance(data.get("wordRange"), dict) else {}
    checks.append(check("E1.wordRange",
                        wr.get("min") == exp["wordRange"]["min"] and wr.get("max") == exp["wordRange"]["max"],
                        "wordRange=%r（D-06 公式期望 %r）" % (data.get("wordRange"), exp["wordRange"])))
    checks.append(check("E1.sceneHeaderStyle", data.get("sceneHeaderStyle") == vals["sceneHeaderStyle"],
                        "sceneHeaderStyle=%r" % data.get("sceneHeaderStyle")))
    checks.append(check("E1.status", data.get("status") == vals["status"], "status=%r" % data.get("status")))
    checks.append(check("E1.rulesPack", data.get("rulesPack") == vals["rulesPack"], "rulesPack=%r" % data.get("rulesPack")))
    ts_ok = True
    ts_detail = "OK"
    pat = re.compile(exp["timestampPattern"])
    c_at, u_at = data.get("createdAt"), data.get("updatedAt")
    if not (isinstance(c_at, str) and pat.match(c_at)):
        ts_ok, ts_detail = False, "createdAt 格式不合法：%r" % (c_at,)
    elif not (isinstance(u_at, str) and pat.match(u_at)):
        ts_ok, ts_detail = False, "updatedAt 格式不合法：%r" % (u_at,)
    else:
        d1, d2 = parse_iso8601(c_at), parse_iso8601(u_at)
        if d1 is None or d2 is None or d2 < d1:
            ts_ok, ts_detail = False, "updatedAt 早于 createdAt：%r / %r" % (c_at, u_at)
    checks.append(check("E1.timestamps", ts_ok, ts_detail))
    return finalize("E1", output_path, checks)


# ================================================================ E2 概念硬门

def grade_E2(task, output_path, harness_root):
    exp = task["expected"]
    data, err = load_json_file(output_path)
    checks = [check("E2.json_parse", err is None, err or "OK")]
    if err:
        return finalize("E2", output_path, checks)
    if not isinstance(data, dict):
        checks.append(check("E2.json_object", False, "顶层必须是 JSON object，实际 %s" % type(data).__name__))
        return finalize("E2", output_path, checks)

    required = ["schemaVersion", "title", "logline", "coreConflict", "sellingPoints",
                "mainline", "titleSubject", "commercialScore", "commercialWarnings", "seasonAnchors"]
    missing = [k for k in required if k not in data]
    checks.append(check("E2.fields", not missing, "缺失字段：%s" % missing if missing else "OK"))

    # 剧名 + 剧名主语判定
    title = strip_book_title(str(data.get("title", "")))
    checks.append(check("E2.title.value", title == exp["title"], "title=%r（期望 %r）" % (title, exp["title"])))
    title_cjk = cjk_count(title)
    title_punct = [ch for ch in title if ch in FORBIDDEN_TITLE_PUNCT]
    has_anchor = any(a in title for a in exp["titleSubjectAnchors"])
    checks.append(check("E2.title.subject_rule",
                        exp["titleLen"]["minCJK"] <= title_cjk <= exp["titleLen"]["maxCJK"]
                        and not title_punct and has_anchor,
                        "汉字 %d（需 %d–%d）/标点 %s/主语锚 %s" % (
                            title_cjk, exp["titleLen"]["minCJK"], exp["titleLen"]["maxCJK"],
                            title_punct or "无", "有" if has_anchor else "无")))
    ts = data.get("titleSubject") if isinstance(data.get("titleSubject"), dict) else {}
    subject = str(ts.get("subject", "") or "")
    evidence = str(ts.get("evidence", "") or "")
    subj_ok = (len(subject) >= 2 and ts.get("subjectType") in exp["subjectTypes"]
               and len(evidence) >= 10 and (subject in evidence or title in evidence))
    checks.append(check("E2.title.subject_declaration", subj_ok,
                        "subject=%r type=%r evidence 长度=%d" % (subject, ts.get("subjectType"), len(evidence))))

    # logline
    lg_cfg = exp["logline"]
    logline = str(data.get("logline", "") or "")
    lg_cjk = cjk_count(logline)
    sentence_ends = len(SENTENCE_END_RE.findall(logline))
    lg_ok = (lg_cfg["minCJK"] <= lg_cjk <= lg_cfg["maxCJK"]
             and sentence_ends <= lg_cfg["maxSentenceEnd"]
             and lg_cfg["protagonist"] in logline
             and any(v in logline for v in lg_cfg["goalVerbs"])
             and any(m in logline for m in lg_cfg["obstacleMarkers"])
             and any(m in logline for m in lg_cfg["stakeMarkers"]))
    checks.append(check("E2.logline", lg_ok,
                        "汉字 %d（%d–%d）/句末 %d/主角 %s/目标 %s/阻碍 %s/代价 %s" % (
                            lg_cjk, lg_cfg["minCJK"], lg_cfg["maxCJK"], sentence_ends,
                            lg_cfg["protagonist"] in logline,
                            any(v in logline for v in lg_cfg["goalVerbs"]),
                            any(m in logline for m in lg_cfg["obstacleMarkers"]),
                            any(m in logline for m in lg_cfg["stakeMarkers"]))))

    # coreConflict
    cc_cfg = exp["coreConflict"]
    conflict = str(data.get("coreConflict", "") or "")
    cc_ok = (cjk_count(conflict) >= cc_cfg["minCJK"]
             and all(n in conflict for n in cc_cfg["mustContain"])
             and any(m in conflict for m in cc_cfg["conflictMarkers"]))
    checks.append(check("E2.coreConflict", cc_ok,
                        "汉字 %d/双主角 %s/冲突词 %s" % (
                            cjk_count(conflict), all(n in conflict for n in cc_cfg["mustContain"]),
                            any(m in conflict for m in cc_cfg["conflictMarkers"]))))

    # sellingPoints
    sp = data.get("sellingPoints")
    sp = sp if isinstance(sp, list) else []
    sp_cfg = exp["sellingPoints"]
    sp_ok = (len(sp) == sp_cfg["count"]
             and all(isinstance(x, str) and sp_cfg["minChars"] <= cjk_count(x) <= sp_cfg["maxChars"] for x in sp)
             and len(set(sp)) == len(sp))
    checks.append(check("E2.sellingPoints", sp_ok, "条数 %d/去重 %d/长度逐条合规 %s" % (
        len(sp), len(set(sp)),
        all(isinstance(x, str) and sp_cfg["minChars"] <= cjk_count(x) <= sp_cfg["maxChars"] for x in sp))))

    # mainline
    ml = data.get("mainline") if isinstance(data.get("mainline"), dict) else {}
    ml_cfg = exp["mainline"]
    rt = ml.get("reversalTypes")
    rt = rt if isinstance(rt, list) else []
    ml_ok = (isinstance(ml.get("hookFrequency"), str) and cjk_count(ml["hookFrequency"]) >= ml_cfg["minHookFrequencyCJK"]
             and len([x for x in rt if isinstance(x, str) and x.strip()]) >= ml_cfg["minReversalTypes"])
    checks.append(check("E2.mainline", ml_ok, "hookFrequency 汉字 %d/反转类型 %d 条" % (
        cjk_count(ml.get("hookFrequency", "")), len(rt))))

    # commercial
    cm_cfg = exp["commercial"]
    score = data.get("commercialScore")
    warnings = data.get("commercialWarnings")
    warnings = warnings if isinstance(warnings, list) else None
    score_ok = isinstance(score, int) and not isinstance(score, bool) and cm_cfg["scoreMin"] <= score <= cm_cfg["scoreMax"]
    if warnings is None:
        warn_ok = False
    elif score_ok and score < cm_cfg["lowScoreThreshold"]:
        warn_ok = len(warnings) >= cm_cfg["lowScoreMinWarnings"] and all(
            isinstance(x, str) and cjk_count(x) >= 6 for x in warnings)
    else:
        warn_ok = warnings == []
    checks.append(check("E2.commercial", score_ok and warn_ok,
                        "score=%r（0–10 整数）warnings=%d 条（<6 需 ≥2 条，≥6 需空数组）" % (score, len(warnings or []))))

    # seasonAnchors
    anchors = data.get("seasonAnchors")
    anchors = anchors if isinstance(anchors, list) else []
    a_cfg = exp["anchors"]
    eps = []
    field_ok = True
    detail = []
    for i, a in enumerate(anchors):
        if not isinstance(a, dict):
            field_ok = False
            detail.append("#%d 非对象" % i)
            continue
        ep = a.get("episode")
        if isinstance(ep, int) and not isinstance(ep, bool):
            eps.append(ep)
        else:
            field_ok = False
            detail.append("#%d episode 非整数" % i)
        if not (isinstance(a.get("event"), str) and cjk_count(a["event"]) >= a_cfg["minEventCJK"]):
            field_ok = False
            detail.append("#%d event 太短" % i)
        elif any(w in a["event"] for w in a_cfg["abstractBlocklist"]):
            field_ok = False
            detail.append("#%d event 含无变化套话" % i)
        if not (isinstance(a.get("primary_change"), str) and cjk_count(a["primary_change"]) >= a_cfg["minPrimaryChangeCJK"]):
            field_ok = False
            detail.append("#%d primary_change 太短" % i)
        if not (isinstance(a.get("keyword"), str) and cjk_count(a["keyword"]) >= 2):
            field_ok = False
            detail.append("#%d keyword 缺失" % i)
    anchors_ok = (
        a_cfg["min"] <= len(anchors) <= a_cfg["max"]
        and field_ok
        and len(set(eps)) == len(eps)
        and all(a_cfg["episodeMin"] <= e <= a_cfg["episodeMax"] for e in eps)
        and eps == sorted(eps)
        and any(e <= a_cfg["mustCoverLow"] for e in eps)
        and any(e >= a_cfg["mustCoverHigh"] for e in eps)
    )
    checks.append(check("E2.seasonAnchors", anchors_ok,
                        "条数 %d（%d–%d）/首尾覆盖 %s/%s/字段问题 %s" % (
                            len(anchors), a_cfg["min"], a_cfg["max"],
                            any(e <= a_cfg["mustCoverLow"] for e in eps),
                            any(e >= a_cfg["mustCoverHigh"] for e in eps),
                            detail[:5] or "无")))

    return finalize("E2", output_path, checks)


# ================================================================ E3 分集节拍

def _e3_check_episode_fields(ep, exp, idx):
    """返回 (ok, detail)；逐字段最小长度。"""
    mc = exp["minChars"]
    problems = []
    for field in exp["requiredFields"]:
        val = ep.get(field)
        if not (isinstance(val, str) and cjk_count(val) >= mc[field]):
            problems.append("%s 缺失或不足 %d 字" % (field, mc[field]))
    return (not problems, "第 %d 集：%s" % (ep.get("episode", idx + 1), problems[:4] or "OK"))


def grade_E3(task, output_path, harness_root):
    exp = task["expected"]
    data, err = load_json_file(output_path)
    checks = [check("E3.json_parse", err is None, err or "OK")]
    if err:
        return finalize("E3", output_path, checks)
    if not isinstance(data, dict):
        checks.append(check("E3.json_object", False, "顶层必须是 JSON object，实际 %s" % type(data).__name__))
        return finalize("E3", output_path, checks)

    project_fx, e1 = _load_fixture_json(task, "fixtureProject", harness_root)
    concept_fx, e2 = _load_fixture_json(task, "fixtureConcept", harness_root)
    if e1 or e2:
        checks.append(check("E3.fixtures", False, e1 or e2))
        return finalize("E3", output_path, checks)

    # 顶层
    missing = [k for k in ("schemaVersion", "evalVersion", "project", "seasonCurve", "paywall", "episodes") if k not in data]
    checks.append(check("E3.top_fields", not missing, "缺失：%s" % missing if missing else "OK"))

    proj = data.get("project") if isinstance(data.get("project"), dict) else {}
    checks.append(check("E3.project",
                        proj.get("title") == project_fx["title"] and proj.get("episodeCount") == exp["episodeCount"],
                        "project=%r" % (data.get("project"),)))
    checks.append(check("E3.seasonCurve", data.get("seasonCurve") == exp["seasonCurve"],
                        "seasonCurve=%r（期望 %r）" % (data.get("seasonCurve"), exp["seasonCurve"])))
    pw = data.get("paywall") if isinstance(data.get("paywall"), dict) else {}
    a, b = pw.get("a"), pw.get("b")
    pw_ok = (isinstance(a, int) and not isinstance(a, bool) and exp["paywall"]["aMin"] <= a <= exp["paywall"]["aMax"]
             and b == exp["paywall"]["b"] and a != b)
    checks.append(check("E3.paywall", pw_ok, "paywall=%r（a∈%d–%d，b=%d，a≠b）" % (
        data.get("paywall"), exp["paywall"]["aMin"], exp["paywall"]["aMax"], exp["paywall"]["b"])))

    episodes = data.get("episodes")
    episodes = episodes if isinstance(episodes, list) else []
    numbers = [ep.get("episode") for ep in episodes if isinstance(ep, dict)]
    checks.append(check("E3.episodes.count",
                        len(episodes) == exp["episodeCount"] and numbers == list(range(1, exp["episodeCount"] + 1)),
                        "集数 %d/集号 %r" % (len(episodes), numbers)))

    # 标题
    titles = [str(ep.get("title", "") or "").strip() for ep in episodes if isinstance(ep, dict)]
    title_ok = (len(set(titles)) == len(titles)
                and all(2 <= cjk_count(t) <= 8 for t in titles))
    checks.append(check("E3.titles", title_ok, "标题去重 %s/长度合规 %s" % (
        len(set(titles)) == len(titles),
        all(2 <= cjk_count(t) <= 8 for t in titles))))

    # 每集必填四要素
    field_results = [_e3_check_episode_fields(ep, exp, idx) for idx, ep in enumerate(episodes) if isinstance(ep, dict)]
    checks.append(check("E3.episode_fields", all(ok for ok, _ in field_results),
                        "; ".join(d for ok, d in field_results if not ok)[:400] or "OK"))

    # callbacks
    cb_problems = []
    for ep in episodes:
        if not isinstance(ep, dict):
            cb_problems.append("非对象集")
            continue
        num = ep.get("episode")
        cbs = ep.get("callbacks")
        if not isinstance(cbs, list):
            cb_problems.append("第 %r 集 callbacks 非数组" % num)
            continue
        if num == 1:
            if cbs:
                cb_problems.append("第 1 集 callbacks 必须为空")
        else:
            if not cbs:
                cb_problems.append("第 %r 集 callbacks 为空" % num)
            for cb in cbs:
                if not (isinstance(cb, dict) and isinstance(cb.get("episode"), int)
                        and cb["episode"] < num
                        and isinstance(cb.get("event"), str) and cjk_count(cb["event"]) >= exp["minChars"]["callbackEvent"]):
                    cb_problems.append("第 %r 集 callback 非法：%r" % (num, cb))
    checks.append(check("E3.callbacks", not cb_problems, "; ".join(cb_problems[:5]) or "OK"))

    # beats 结构与数量
    beat_problems = []
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        num = ep.get("episode")
        beats = ep.get("beats")
        if not isinstance(beats, list) or not (exp["beatsPerEpisode"]["min"] <= len(beats) <= exp["beatsPerEpisode"]["max"]):
            beat_problems.append("第 %r 集节拍条数非法：%r" % (num, len(beats) if isinstance(beats, list) else beats))
            continue
        nos = [bt.get("no") for bt in beats if isinstance(bt, dict)]
        if nos != list(range(1, len(beats) + 1)):
            beat_problems.append("第 %r 集节拍编号不连续：%r" % (num, nos))
        kinds = [bt.get("kind") for bt in beats if isinstance(bt, dict)]
        if not kinds or kinds[0] != "open_hook" or kinds[-1] != "close_hook":
            beat_problems.append("第 %r 集首尾节拍不是 open_hook/close_hook" % num)
        bad_kind = [k for k in kinds if k not in exp["beatKinds"]]
        if bad_kind:
            beat_problems.append("第 %r 集非法节拍类型：%r" % (num, bad_kind))
        for bt in beats:
            if not (isinstance(bt, dict) and isinstance(bt.get("text"), str)
                    and cjk_count(bt["text"]) >= exp["minChars"]["beatText"]):
                beat_problems.append("第 %r 集节拍文本缺失/过短" % num)
                break
        need = {"satisfaction": 2, "conflict": 1, "reveal": 1, "escalation": 1, "twist": 1}
        for kind, minimum in need.items():
            if kinds.count(kind) < minimum:
                beat_problems.append("第 %r 集 %s 只有 %d 条（需 ≥%d）" % (num, kind, kinds.count(kind), minimum))
    checks.append(check("E3.beats", not beat_problems, "; ".join(beat_problems[:6]) or "OK"))

    # hooks
    hook_problems = []
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        num = ep.get("episode")
        hooks = ep.get("hooks") if isinstance(ep.get("hooks"), dict) else {}
        for side in ("open", "close"):
            h = hooks.get(side) if isinstance(hooks.get(side), dict) else {}
            if h.get("type") not in exp["hookFormulaTypes"]:
                hook_problems.append("第 %r 集 %s.type 非法：%r" % (num, side, h.get("type")))
            if h.get("subtag") not in exp["hookSubtags"]:
                hook_problems.append("第 %r 集 %s.subtag 非法：%r" % (num, side, h.get("subtag")))
        if isinstance(hooks.get("open"), dict) and isinstance(hooks.get("close"), dict):
            if hooks["open"].get("type") == hooks["close"].get("type"):
                hook_problems.append("第 %r 集 hooks.open.type 与 close.type 相同" % num)
        if isinstance(hooks.get("open"), dict):
            if cjk_count(hooks["open"].get("reason", "")) < exp["minChars"]["beatText"]:
                hook_problems.append("第 %r 集 open.reason 过短" % num)
        close = hooks.get("close") if isinstance(hooks.get("close"), dict) else {}
        concrete = close.get("concrete") if isinstance(close.get("concrete"), dict) else {}
        scene = str(concrete.get("scene", "") or "")
        chars = concrete.get("characters")
        chars = chars if isinstance(chars, list) else []
        prop = str(concrete.get("prop", "") or "")
        action = str(concrete.get("action", "") or "")
        if cjk_count(scene) < 2 or scene.strip() in ("某处", "某地", "未知"):
            hook_problems.append("第 %r 集 close.concrete.scene 不具体：%r" % (num, scene))
        if not chars or any(c not in exp["canonNames"] for c in chars):
            hook_problems.append("第 %r 集 close.concrete.characters 非 canon：%r" % (num, chars))
        if cjk_count(prop) < 1 or prop.strip() in ("无", "待定", "空"):
            hook_problems.append("第 %r 集 close.concrete.prop 缺失：%r" % (num, prop))
        if cjk_count(action) < exp["minChars"]["concreteAction"]:
            hook_problems.append("第 %r 集 close.concrete.action 过短" % num)
        elif any(w in action for w in exp["abstractActionBlocklist"]):
            hook_problems.append("第 %r 集 close.concrete.action 含抽象套话：%r" % (num, action))
    checks.append(check("E3.hooks", not hook_problems, "; ".join(hook_problems[:6]) or "OK"))

    # 爽感点
    sat_problems = []
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        num = ep.get("episode")
        sats = ep.get("satisfactionPoints")
        if not isinstance(sats, list) or len(sats) != 2:
            sat_problems.append("第 %r 集爽感点不是恰好 2 条" % num)
            continue
        positions = []
        for pt in sats:
            if not isinstance(pt, dict):
                sat_problems.append("第 %r 集爽感点非对象" % num)
                continue
            if pt.get("type") not in exp["satisfactionTypes"]:
                sat_problems.append("第 %r 集爽感类型非法：%r" % (num, pt.get("type")))
            ws = pt.get("witnesses")
            if not isinstance(ws, list) or not ws or any(w not in exp["canonNames"] for w in ws):
                sat_problems.append("第 %r 集爽感点 witnesses 非 canon：%r" % (num, ws))
            if not (isinstance(pt.get("position"), (int, float)) and not isinstance(pt.get("position"), bool)
                    and 0.0 <= float(pt["position"]) <= 1.0):
                sat_problems.append("第 %r 集爽感点 position 非法：%r" % (num, pt.get("position")))
            else:
                positions.append(float(pt["position"]))
            if cjk_count(pt.get("description", "")) < exp["minChars"]["satisfactionDescription"]:
                sat_problems.append("第 %r 集爽感点 description 过短" % num)
        if positions:
            if positions[0] > 0.34:
                sat_problems.append("第 %r 集第一个爽感点 position=%.2f > 0.34" % (num, positions[0]))
            if all(p > 0.67 for p in positions):
                sat_problems.append("第 %r 集爽感点全部堆在最后 1/3" % num)
        types = [pt.get("type") for pt in sats if isinstance(pt, dict)]
        if not any(t in exp["femalePrimaryTypes"] for t in types):
            sat_problems.append("第 %r 集缺少女频一级爽感（%s）" % (num, "/".join(exp["femalePrimaryTypes"])))
    checks.append(check("E3.satisfaction", not sat_problems, "; ".join(sat_problems[:6]) or "OK"))

    # 付费墙落位
    pw_problems = []
    if episodes:
        flags = [(ep.get("paywall") if isinstance(ep, dict) else None) for ep in episodes]
        if isinstance(a, int) and isinstance(b, int) and 1 <= a <= len(flags) and 1 <= b <= len(flags):
            if flags[a - 1] != "A":
                pw_problems.append("第 %d 集 paywall 应为 A，实际 %r" % (a, flags[a - 1]))
            if flags[b - 1] != "B":
                pw_problems.append("第 %d 集 paywall 应为 B，实际 %r" % (b, flags[b - 1]))
        for i, f in enumerate(flags):
            if f not in (None, "A", "B"):
                pw_problems.append("第 %d 集 paywall 值非法：%r" % (i + 1, f))
        if flags.count("A") != 1 or flags.count("B") != 1:
            pw_problems.append("paywall A/B 标记数量应为 1/1，实际 %d/%d" % (flags.count("A"), flags.count("B")))
    checks.append(check("E3.paywall_flags", not pw_problems, "; ".join(pw_problems) or "OK"))

    # 钩子多样性
    div_cfg = exp["hookDiversity"]
    subtags = []
    for ep in episodes:
        hooks = ep.get("hooks") if isinstance(ep, dict) and isinstance(ep.get("hooks"), dict) else {}
        close = hooks.get("close") if isinstance(hooks.get("close"), dict) else {}
        subtags.append(close.get("subtag"))
    div_problems = []
    for i in range(len(subtags) - 2):
        if subtags[i] == subtags[i + 1] == subtags[i + 2]:
            div_problems.append("第 %d–%d 集连续 3 集同 subtag %r" % (i + 1, i + 3, subtags[i]))
    for i in range(len(subtags) - 4):
        window = subtags[i:i + 5]
        for tag in set(window):
            if tag is not None and window.count(tag) >= div_cfg["window5Max"] + 1:
                div_problems.append("第 %d–%d 集 5 集滑窗内 %r 出现 %d 次" % (i + 1, i + 5, tag, window.count(tag)))
    checks.append(check("E3.hook_diversity", not div_problems, "; ".join(sorted(set(div_problems))[:5]) or "OK"))

    # 重复内容
    dup_problems = []
    seen_main = {}
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        key = norm_text(ep.get("mainline", ""))
        if key in seen_main:
            dup_problems.append("第 %r 集与第 %r 集 mainline 完全重复" % (ep.get("episode"), seen_main[key]))
        seen_main[key] = ep.get("episode")
    seen_beat = {}
    for ep in episodes:
        if not isinstance(ep, dict) or not isinstance(ep.get("beats"), list):
            continue
        for bt in ep["beats"]:
            if not isinstance(bt, dict):
                continue
            key = norm_text(bt.get("text", ""))
            if len(key) < 6:
                continue
            if key in seen_beat and seen_beat[key] != ep.get("episode"):
                dup_problems.append("第 %r 集与第 %r 集节拍文本完全重复" % (ep.get("episode"), seen_beat[key]))
            seen_beat[key] = ep.get("episode")
    checks.append(check("E3.no_duplicates", not dup_problems, "; ".join(sorted(set(dup_problems))[:5]) or "OK"))

    # 角色与姓名变体
    name_problems = []
    json_text = _ep_text(episodes)
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        if "林小满" not in _ep_text(ep):
            name_problems.append("第 %r 集未出现林小满" % ep.get("episode"))
    for name in ("周曼", "陈砚", "林阿婆"):
        if name not in json_text:
            name_problems.append("全季未出现 %s" % name)
    for variant in exp["forbiddenNameVariants"]:
        if variant in json_text:
            name_problems.append("出现姓名变体 %r" % variant)
    checks.append(check("E3.names", not name_problems, "; ".join(name_problems[:6]) or "OK"))

    # 概念锚点对齐
    anchor_problems = []
    by_ep = {ep.get("episode"): ep for ep in episodes if isinstance(ep, dict)}
    for anchor in concept_fx.get("seasonAnchors", []):
        ep = by_ep.get(anchor.get("episode"))
        keyword = anchor.get("keyword", "")
        if ep is None or not keyword:
            anchor_problems.append("锚点 %r 无法对齐（缺集或缺 keyword）" % anchor.get("episode"))
        elif keyword not in _ep_text(ep):
            anchor_problems.append("第 %r 集未落地锚点关键词 %r" % (anchor.get("episode"), keyword))
    checks.append(check("E3.anchor_alignment", not anchor_problems, "; ".join(anchor_problems[:6]) or "OK"))

    return finalize("E3", output_path, checks)


# ================================================================ E4 单场剧本

def _check_header_block(header_inner, exp):
    time_tokens = exp.get("timeTokens") or SCENE_TIME_TOKENS
    inout_tokens = exp.get("inOutTokens") or SCENE_INOUT_TOKENS
    parsed = split_header_content(header_inner)
    if parsed is None:
        return False, "标头内容缺少 时间/内或外/地点：%r" % header_inner
    time_token, inout, location = parsed
    if time_token not in time_tokens:
        return False, "时间词非法：%r" % time_token
    if inout not in inout_tokens:
        return False, "内/外缺失：%r" % inout
    return True, "时间=%s 内外=%s 地点=%s" % (time_token, inout, location)


def grade_E4(task, output_path, harness_root):
    exp = task["expected"]
    text, err = read_text_file(output_path)
    checks = [check("E4.read", err is None, err or "OK")]
    if err:
        return finalize("E4", output_path, checks)

    script = parse_script(text)
    headers = script["headers"]
    plain_headers = script["plain_headers"]
    checks.append(check("E4.header.one",
                        len(headers) == 1 and not plain_headers,
                        "bracket 标头 %d 个 / plain 标头 %d 个（必须只写 1 场且用 bracket）" % (
                            len(headers), len(plain_headers))))
    header_ok = False
    header_detail = "无标头"
    if len(headers) == 1:
        m = match_bracket_header(headers[0]["text"])
        inner = m.group(3) if m else ""
        num_ok = bool(m and int(m.group(1)) == 1 and int(m.group(2)) == 1)
        content_ok, cdetail = _check_header_block(inner, exp)
        header_ok = num_ok and content_ok
        header_detail = "场号=%s；%s" % ("1-1" if num_ok else "非 1-1", cdetail)
    checks.append(check("E4.header.format", header_ok, header_detail))

    # 人物行
    people = script["people_lines"]
    people_ok = False
    people_detail = "无人物行"
    if people:
        names = parse_people_line(people[0]["text"])
        bad = [n for n in names if n not in exp["canonNames"]]
        people_ok = len(names) >= 1 and not bad
        people_detail = "人物=%r 非 canon=%r" % (names, bad)
    checks.append(check("E4.people_line", people_ok, people_detail))

    # 台词
    dialogues = script["dialogues"]
    bad_speakers = [d["name"] for d in dialogues if d["name"] not in exp["canonNames"]]
    dialog_ok = (len(dialogues) >= exp["minDialogueLines"] and not bad_speakers
                 and all(d["content"].strip() for d in dialogues))
    checks.append(check("E4.dialogue", dialog_ok, "台词 %d 条（需 ≥%d）/非 canon 说话人 %r" % (
        len(dialogues), exp["minDialogueLines"], bad_speakers[:5])))

    # 动作行：第三人称 + 禁止心理描写
    actions = script["actions"]
    fp_hits, psy_hits = [], []
    for a in actions:
        body = a["text"]
        for p in exp["firstPersonPronouns"]:
            if p in body:
                fp_hits.append("第 %d 行含 %r" % (a["line"], p))
        for v in exp["psychVerbs"]:
            if v in body:
                psy_hits.append("第 %d 行含 %r" % (a["line"], v))
    action_ok = len(actions) >= exp["minActionLines"] and not fp_hits and not psy_hits
    checks.append(check("E4.action_lines", action_ok, "△ 行 %d 条（需 ≥%d）/第一人称 %s/心理描写 %s" % (
        len(actions), exp["minActionLines"], fp_hits[:3] or "无", psy_hits[:3] or "无")))

    # OS / VO 格式
    os_lines = script["os_lines"]
    bad_os_markers = [m for m in exp["osBadMarkers"] if m in text]
    vo_ok = True
    vo_detail = "无 VO 行"
    for ln in text.split("\n"):
        if "VO（" in ln:
            vo_detail = "存在 VO 行"
            if not re.match(r"^VO（[\u4e00-\u9fff·]{2,8}）[：:]", ln.strip()):
                vo_ok = False
                vo_detail = "VO 格式非法：%r" % ln.strip()
            else:
                name = re.match(r"^VO（([\u4e00-\u9fff·]{2,8})）", ln.strip()).group(1)
                if name not in exp["canonNames"]:
                    vo_ok = False
                    vo_detail = "VO 角色非 canon：%r" % name
    checks.append(check("E4.os_vo", len(os_lines) >= exp["minOS"] and not bad_os_markers and vo_ok,
                        "OS %d 条（需 ≥%d）/非法标记 %r/%s" % (len(os_lines), exp["minOS"], bad_os_markers, vo_detail)))

    # 核心道具/事件
    checks.append(check("E4.keyword", exp["keyword"] in text, "本场必须出现 %r" % exp["keyword"]))

    # 净字数
    words = net_word_count(text)
    checks.append(check("E4.word_count",
                        exp["wordRange"]["min"] <= words <= exp["wordRange"]["max"],
                        "净字数 %d（需 %d–%d）" % (words, exp["wordRange"]["min"], exp["wordRange"]["max"])))
    return finalize("E4", output_path, checks)


# ================================================================ E5 质检回放

def detect_v1_codes(text, config):
    """按 E5-config.json 的 v1DetectorScope 计算 ground truth。返回 {code: {severity, evidence}}。"""
    codes = {}
    wr = config["project"]["wordRange"]
    total = net_word_count(text)
    if total < wr["min"] or total > wr["max"]:
        first_line = next((ln.strip() for ln in text.split("\n") if ln.strip()), "")
        codes["C002"] = {"severity": "warning", "evidence": first_line}
    scenes = parse_scenes(text, style="any")
    for s in scenes:
        scene_net = net_word_count(s["header"] + "\n" + s["text"])
        if scene_net < config["sceneMinNet"]:
            codes["C006"] = {"severity": "error", "evidence": s["header"]}
            break
    if config["project"].get("sceneHeaderStyle") == "bracket":
        plain = [s for s in scenes if s["kind"] == "plain"]
        if plain:
            codes["Q_SCENE_HEADER_MIXED"] = {"severity": "error", "evidence": plain[0]["header"]}
    paragraphs = split_paragraphs(text)
    last = paragraphs[-1] if paragraphs else ""
    for phrase in config["hookAbstractBlocklist"]:
        if phrase in last:
            codes["Q_HOOK_ABSTRACT"] = {"severity": "error", "evidence": phrase}
            break
    for marker in config["osBadMarkers"]:
        if marker in text:
            line = next((ln.strip() for ln in text.split("\n") if marker in ln), marker)
            codes["Q_OS_FORMAT"] = {"severity": "warning", "evidence": line}
            break
    for variant in config["forbiddenNameVariants"]:
        if variant in text:
            line = next((ln.strip() for ln in text.split("\n") if variant in ln), variant)
            codes["Q_NAME_VARIANT"] = {"severity": "error", "evidence": line}
            break
    return codes


def grade_E5(task, output_path, harness_root):
    exp = task["expected"]
    config, e1 = _load_fixture_json(task, "fixtureConfig", harness_root)
    draft_text, e2 = read_text_file(_p(harness_root, exp["fixtureDraft"]))
    checks = [check("E5.fixtures", e1 is None and e2 is None, e1 or e2 or "OK")]
    if e1 or e2:
        return finalize("E5", output_path, checks)
    ground_truth = detect_v1_codes(draft_text, config)

    data, err = load_json_file(output_path)
    checks.append(check("E5.json_parse", err is None, err or "OK"))
    if err:
        return finalize("E5", output_path, checks, extra={"groundTruth": sorted(ground_truth)})
    if not isinstance(data, dict):
        checks.append(check("E5.json_object", False, "顶层必须是 JSON object，实际 %s" % type(data).__name__))
        return finalize("E5", output_path, checks, extra={"groundTruth": sorted(ground_truth)})

    verdict = data.get("verdict")
    checks.append(check("E5.verdict", verdict == exp["requiredVerdict"],
                        "verdict=%r（必须 %r）" % (verdict, exp["requiredVerdict"])))

    findings = []
    for bucket in ("mustFix", "shouldFix"):
        items = data.get(bucket)
        if items is None:
            continue
        if not isinstance(items, list):
            checks.append(check("E5.findings_shape", False, "%s 不是数组" % bucket))
            return finalize("E5", output_path, checks, extra={"groundTruth": sorted(ground_truth)})
        for item in items:
            if isinstance(item, dict):
                findings.append(item)
    reported = {}
    for f in findings:
        code = f.get("code")
        if isinstance(code, str):
            reported.setdefault(code, f)

    scope = set(config["v1DetectorScope"])
    out_of_scope = [c for c in reported if c not in scope]
    checks.append(check("E5.code_scope", not out_of_scope,
                        "报了范围外的码：%r（v1 只检查 %s）" % (sorted(out_of_scope), sorted(scope))))

    expected = set(ground_truth)
    missing = sorted(expected - set(reported))
    checks.append(check("E5.recall", not missing, "漏报：%r" % missing if missing else "OK"))

    fp = sorted(set(reported) - expected)
    checks.append(check("E5.false_positive", len(fp) <= exp["maxFalsePositive"],
                        "误报 %d 条（上限 %d）：%r" % (len(fp), exp["maxFalsePositive"], fp)))

    sev_problems = []
    for code, f in reported.items():
        want = config["codebook"].get(code, {}).get("severity")
        got = str(f.get("severity", "")).lower()
        if want and got != want:
            sev_problems.append("%s 期望 %s，实际 %r" % (code, want, f.get("severity")))
    checks.append(check("E5.severity", not sev_problems, "; ".join(sev_problems) or "OK"))

    ev_problems = []
    for code, f in reported.items():
        ev = f.get("evidence")
        if not isinstance(ev, str) or len(ev) < exp["findingEvidenceMinChars"]:
            ev_problems.append("%s evidence 缺失或过短" % code)
        elif ev not in draft_text:
            ev_problems.append("%s evidence 不是原文逐字片段：%r" % (code, ev[:30]))
    checks.append(check("E5.evidence", not ev_problems, "; ".join(ev_problems[:6]) or "OK"))

    error_codes = [c for c, v in ground_truth.items() if v["severity"] == "error"]
    checks.append(check("E5.fail_justified", verdict == "fail" and any(c in reported for c in error_codes),
                        "≥1 个 error 级命中码支撑 fail（error 期望：%r）" % sorted(error_codes)))

    return finalize("E5", output_path, checks, extra={"groundTruth": sorted(ground_truth)})


# ================================================================ E6 连续性

def _find_conflicts(text, canon):
    violations = []
    for c in canon.get("conflicts", []):
        cid = c.get("id")
        wrong_lit = c.get("wrongLiteral")
        if wrong_lit and wrong_lit in text:
            violations.append("%s wrongLiteral 仍存在：%r" % (cid, wrong_lit))
        pattern = c.get("wrongPattern")
        if pattern:
            for m in re.finditer(pattern, text):
                seg = m.group(0)
                if not any(neg in seg for neg in ("不是", "并非", "没有", "不叫", "别叫", "而不是")):
                    violations.append("%s wrongPattern 命中：%r" % (cid, seg))
                    break
        fix_lit = c.get("fixLiteral")
        if fix_lit and fix_lit not in text:
            violations.append("%s fixLiteral 缺失：%r" % (cid, fix_lit))
    return violations


def grade_E6(task, output_path, harness_root):
    exp = task["expected"]
    canon, e1 = _load_fixture_json(task, "fixtureCanon", harness_root)
    checks = [check("E6.fixtures", e1 is None, e1 or "OK")]
    if e1:
        return finalize("E6", output_path, checks)
    text, e2 = read_text_file(output_path)
    checks.append(check("E6.read", e2 is None, e2 or "OK"))
    if e2:
        return finalize("E6", output_path, checks)

    script = parse_script(text)
    headers = script["headers"]
    plain = script["plain_headers"]
    expected_nos = [s["no"] for s in canon.get("scenes", [])]
    scene_nos = []
    header_problems = []
    if plain:
        header_problems.append("出现 plain 标头 %d 个（项目是 bracket）" % len(plain))
    for h in headers:
        m = match_bracket_header(h["text"])
        scene_nos.append("%d-%d" % (int(m.group(1)), int(m.group(2))))
        ok, detail = _check_header_block(m.group(3), exp)
        if not ok:
            header_problems.append("第 %d 行：%s" % (h["line"], detail))
    checks.append(check("E6.headers",
                        len(headers) == exp["requiredSceneCount"] and not plain
                        and scene_nos == expected_nos and not header_problems,
                        "标头 %d 个（需 %d）/场号 %r（期望 %r）/问题 %s" % (
                            len(headers), exp["requiredSceneCount"], scene_nos, expected_nos,
                            header_problems[:3] or "无")))

    # 每场人物行
    scenes = parse_scenes(text, style="bracket")
    people_problems = []
    for s in scenes:
        people = [ln for ln in s["text"].split("\n") if ln.strip().startswith("人物")]
        if not people:
            people_problems.append("场 %s 缺人物行" % s["no"])
            continue
        names = parse_people_line(people[0])
        bad = [n for n in names if n not in exp["canonNames"]]
        if not names or bad:
            people_problems.append("场 %s 人物行非法：%r" % (s["no"], names))
    checks.append(check("E6.people_lines", not people_problems, "; ".join(people_problems[:5]) or "OK"))

    dialogues = script["dialogues"]
    bad_speakers = [d["name"] for d in dialogues if d["name"] not in exp["canonNames"]]
    checks.append(check("E6.dialogue", len(dialogues) >= exp["minDialogueLines"] and not bad_speakers,
                        "台词 %d 条（需 ≥%d）/非 canon 说话人 %r" % (
                            len(dialogues), exp["minDialogueLines"], bad_speakers[:5])))

    fp_hits, psy_hits = [], []
    for a in script["actions"]:
        for p in exp["firstPersonPronouns"]:
            if p in a["text"]:
                fp_hits.append("第 %d 行含 %r" % (a["line"], p))
        for v in exp["psychVerbs"]:
            if v in a["text"]:
                psy_hits.append("第 %d 行含 %r" % (a["line"], v))
    checks.append(check("E6.action_lines", not fp_hits and not psy_hits,
                        "第一人称 %s/心理描写 %s" % (fp_hits[:3] or "无", psy_hits[:3] or "无")))

    checks.append(check("E6.os", len(script["os_lines"]) >= exp["minOS"],
                        "OS %d 条（需 ≥%d）" % (len(script["os_lines"]), exp["minOS"])))

    words = net_word_count(text)
    checks.append(check("E6.word_count", exp["wordRange"]["min"] <= words <= exp["wordRange"]["max"],
                        "净字数 %d（需 %d–%d）" % (words, exp["wordRange"]["min"], exp["wordRange"]["max"])))

    variants = [v for v in canon.get("forbiddenNameVariants", []) if v in text]
    checks.append(check("E6.name_variants", not variants, "姓名变体：%r" % variants if variants else "OK"))

    violations = _find_conflicts(text, canon)
    checks.append(check("E6.conflicts", not violations, "冲突数 %d（必须 0）：%s" % (
        len(violations), "; ".join(violations[:6]) or "OK")))

    paragraphs = split_paragraphs(text)
    last = paragraphs[-1] if paragraphs else ""
    ending_problems = []
    if net_word_count(last) < 20:
        ending_problems.append("最后一段净字数 %d < 20" % net_word_count(last))
    for phrase in exp["hookAbstractBlocklist"]:
        if phrase in last:
            ending_problems.append("结尾含抽象套话 %r" % phrase)
            break
    checks.append(check("E6.ending", not ending_problems, "; ".join(ending_problems) or "OK"))

    return finalize("E6", output_path, checks)
