"""墨戏生花 Harness² eval v1 · 共享确定性检查工具。

纯标准库、离线可跑。所有口径在本模块内显式实现，禁止依赖模型或第三方包。
"""

import json
import re
from datetime import datetime

# ---------------------------------------------------------------- 文本口径

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
LATIN_RE = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*")
DIGIT_RE = re.compile(r"\d+")
SENTENCE_END_RE = re.compile(r"[。！？]")

FORBIDDEN_TITLE_PUNCT = "，。！？、；：,.!?;:"


def net_word_count(text):
    """净字数（与 moxi-core `lib/checks.js` 的 netWordCount 同口径）。

    CJK 字符各计 1；连续拉丁词各计 1；连续数字各计 1；标点/空白/符号不计。
    """
    if not text:
        return 0
    return len(CJK_RE.findall(text)) + len(LATIN_RE.findall(text)) + len(DIGIT_RE.findall(text))


def cjk_count(text):
    return len(CJK_RE.findall(text or ""))


def norm_text(text):
    """用于完全重复判定的归一化：去掉所有空白。"""
    return re.sub(r"\s+", "", text or "")


def strip_book_title(s):
    s = (s or "").strip()
    if s.startswith("《") and s.endswith("》"):
        s = s[1:-1].strip()
    return s


def split_paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", (text or "").strip()) if p.strip()]


# ---------------------------------------------------------------- 场次标头

BRACKET_HEADER_RE = re.compile(r"^【\s*场\s*(\d+)\s*[-－]\s*(\d+)\s*[：:]\s*([^】]*)】\s*$")
PLAIN_HEADER_RE = re.compile(r"^(\d+)\s*[-－]\s*(\d+)\s+(\S.*)$")

SCENE_TIME_TOKENS = ["清晨", "黄昏", "傍晚", "晨", "日", "夜"]
SCENE_INOUT_TOKENS = ["内外", "内", "外"]


def match_bracket_header(line):
    return BRACKET_HEADER_RE.match((line or "").strip())


def match_plain_header(line):
    return PLAIN_HEADER_RE.match((line or "").strip())


def parse_scenes(text, style="bracket"):
    """按标头切场。style='bracket' 只认方括号；'any' 两种都认。"""
    scenes = []
    cur = None
    for idx, line in enumerate((text or "").split("\n")):
        stripped = line.strip()
        m = match_bracket_header(stripped)
        kind = "bracket"
        if m is None and style == "any":
            m = match_plain_header(stripped)
            kind = "plain"
        if m is not None:
            if cur is not None:
                scenes.append(cur)
            cur = {
                "no": "%d-%d" % (int(m.group(1)), int(m.group(2))),
                "header": stripped,
                "kind": kind,
                "line": idx + 1,
                "body": [],
            }
        elif cur is not None:
            cur["body"].append(line)
    if cur is not None:
        scenes.append(cur)
    for s in scenes:
        s["text"] = "\n".join(s["body"]).strip()
    return scenes


def split_header_content(inner):
    """把 `夜  外  潮汐民宿门口` 拆成 (time, inOut, location)；拆不出返回 None。"""
    content = (inner or "").strip()
    time_token = None
    for t in SCENE_TIME_TOKENS:
        if t in content:
            time_token = t
            content = content.replace(t, " ", 1)
            break
    inout = None
    for t in SCENE_INOUT_TOKENS:
        if t in content:
            inout = "外" if t == "外" else ("内" if t == "内" else t)
            content = content.replace(t, " ", 1)
            break
    location = re.sub(r"[\s　]+", "", content)
    if not time_token or not inout or not location:
        return None
    return time_token, inout, location


# ---------------------------------------------------------------- 剧本行解析

OS_RE = re.compile(r"^(?P<name>[\u4e00-\u9fff·]{2,8})(?:（[^）]*）)?OS[：:]\s*(?P<content>.*)$")
VO_RE = re.compile(r"^VO（(?P<name>[\u4e00-\u9fff·]{2,8})）[：:]\s*(?P<content>.*)$")
DIALOGUE_RE = re.compile(r"^(?P<name>[\u4e00-\u9fff·]{2,8})(?:（[^）]*）)?[：:]\s*(?P<content>.*)$")

NON_SPEAKER_PREFIXES = ("人物", "VO", "△", "【", "字幕", "画面")


def is_action_line(line):
    return line.strip().startswith("△")


def parse_script(text):
    """把剧本正文解析成结构化行集合。"""
    lines = [ln.strip() for ln in (text or "").split("\n")]
    out = {
        "headers": [],
        "plain_headers": [],
        "people_lines": [],
        "dialogues": [],
        "actions": [],
        "os_lines": [],
        "vo_lines": [],
        "other_lines": [],
    }
    for i, line in enumerate(lines):
        if not line:
            continue
        if match_bracket_header(line):
            out["headers"].append({"line": i + 1, "text": line})
            continue
        if match_plain_header(line):
            out["plain_headers"].append({"line": i + 1, "text": line})
            continue
        if line.startswith("人物"):
            out["people_lines"].append({"line": i + 1, "text": line})
            continue
        if is_action_line(line):
            out["actions"].append({"line": i + 1, "text": line})
            continue
        m = OS_RE.match(line)
        if m:
            out["os_lines"].append({"line": i + 1, "text": line, "name": m.group("name"), "content": m.group("content")})
            continue
        m = VO_RE.match(line)
        if m:
            out["vo_lines"].append({"line": i + 1, "text": line, "name": m.group("name"), "content": m.group("content")})
            continue
        m = DIALOGUE_RE.match(line)
        if m and not any(line.startswith(p) for p in NON_SPEAKER_PREFIXES):
            out["dialogues"].append({"line": i + 1, "text": line, "name": m.group("name"), "content": m.group("content")})
            continue
        out["other_lines"].append({"line": i + 1, "text": line})
    return out


def parse_people_line(line):
    body = line.split("：", 1)[-1] if "：" in line else line
    return [n.strip() for n in re.split(r"[，,、]", body) if n.strip()]


# ---------------------------------------------------------------- 结果构造

def check(cid, ok, detail=""):
    return {"id": cid, "ok": bool(ok), "detail": str(detail)}


def load_json_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except FileNotFoundError:
        return None, "文件不存在：%s" % path
    except json.JSONDecodeError as exc:
        return None, "JSON 解析失败：%s" % exc
    except OSError as exc:
        return None, "读取失败：%s" % exc


def read_text_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), None
    except FileNotFoundError:
        return None, "文件不存在：%s" % path
    except OSError as exc:
        return None, "读取失败：%s" % exc


def finalize(task_id, output_path, checks, extra=None):
    total = len(checks)
    passed = sum(1 for c in checks if c["ok"])
    result = {
        "task": task_id,
        "output": str(output_path),
        "ok": passed == total and total > 0,
        "score": round(passed / total, 4) if total else 0.0,
        "passedChecks": passed,
        "totalChecks": total,
        "failed": [c["id"] for c in checks if not c["ok"]],
        "checks": checks,
    }
    if extra:
        result.update(extra)
    return result


def parse_iso8601(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
