#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨戏生花 S0 · 模型链路探针（直连 HTTP；无工具、无 agent 循环、无文件副作用）

做什么
------
1. 读 `~/.dsh/.credentials.yaml` 的 key（只进内存，不打印、不落盘）；
2. 读 `~/.dsh/profiles/desktop/cordis.patch.yml` 里 `llm-pi-ai` 的 provider/model 配置；
   补上 DSH 内置的 `deepseek-official / deepseek-flash`（见 BUILTIN_PROVIDERS 注释）；
3. 逐模型发一次最小 completion（默认 max_tokens=32，非流式），失败按指数退避重试 1 次；
4. 输出 JSONL 证据到 `analysis/probe/probe-<时间戳>.jsonl`，并在 stdout 打印汇总表。

硬约束
------
- 请求体不含 tools / tool_choice / 任何工具定义：模型没有工具可挂，探针不产生副作用。
- 不打印、不写 key；错误信息先打码（凭据值按字面替换 + `sk-*`/`Bearer *` 正则）再截断。
- 不改 `~/.dsh` 任何配置；本脚本只写 `analysis/probe/` 下的 JSONL。
- 失败不跳过：记录 http_status / error_code / error_msg / attempts，并给出判定；
  判定不了的写"未验证 + 原因"，不写假绿。

用法
----
    # 全量（按 profile 配置探测所有模型，约 40–90s）
    python3 scripts/model_probe.py

    # 只测一个模型（model id 或 provider/model 均可）
    python3 scripts/model_probe.py --only deepseek-flash
    python3 scripts/model_probe.py --only <provider>/<model> --max-tokens 512

    # 调超时
    python3 scripts/model_probe.py --timeout 90

依赖
----
Python 3.9+ 标准库（urllib）+ 本机已装的 PyYAML（仅解析 YAML，无网络依赖；不装任何包）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - 本机已装；缺失时给明确指令，不偷偷装包
    sys.stderr.write(
        "缺少 PyYAML（仅用于解析配置，不装网络依赖）。\n"
        "请用本机已安装 PyYAML 的 python3 解释器运行：python3 scripts/model_probe.py\n"
    )
    raise SystemExit(3)

# ---------------------------------------------------------------- 常量与路径

HOME = Path.home()
CREDENTIALS_PATH = HOME / ".dsh" / ".credentials.yaml"
PROFILE_PATCH_PATH = HOME / ".dsh" / "profiles" / "desktop" / "cordis.patch.yml"
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = HOME / ".moxi" / "probe"

PROMPT = "Reply with exactly: PONG"
DEFAULT_MAX_TOKENS = 32
DEFAULT_TIMEOUT = 60.0
# 显式 UA：部分模型网关的 Cloudflare 会拦截默认的 "Python-urllib/x.y"（返回 403 code 1010，
# 会掩盖真实的 401 额度错误）。这里用探针自有标识，稳定可复跑。
USER_AGENT = "moxi-model-probe/0.1 (+local chain probe)"

# DSH 内置 pi-ai catalog 里的默认模型（cordis.patch.yml 未定义 deepseek-official 的 llm-pi-ai 段）。
# 事实来源：DSH app.asar 内置 catalog 条目 `chat:deepseek-flash`：
#   {"id":"deepseek-flash","api":"openai-completions","baseUrl":"https://api.deepseek.com","provider":"deepseek"}
# 凭据引用：`~/.dsh/.credentials.yaml` refs.DEEPSEEK_API_KEY。
BUILTIN_PROVIDERS = {
    "deepseek-official": {
        "api": "openai-completions",
        "baseURL": "https://api.deepseek.com",
        "apiKeyEnv": "DEEPSEEK_API_KEY",
        "models": ["deepseek-flash"],
        "config_source": "DSH 内置 pi-ai catalog（app.asar: chat:deepseek-flash）",
    }
}

# 配置里不写 `api` 时，按 pi-ai 内置 provider 的默认协议推断（已用 app.asar catalog 核对）。
PROVIDER_DEFAULT_API = {
    "anthropic": "anthropic-messages",
    "google": "google-generative-ai",
    "deepseek": "openai-completions",
    "openai": "openai-completions",
    "azure": "azure-openai-responses",
}

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
RETRY_BACKOFF_S = 1.5  # 重试 1 次，退避 1.5 * 2^attempt

# DSH 实际调用走流式；`--stream` 只对这两类 api 做 SSE 兼容性抽测，
# 其余协议（anthropic-messages / google-generative-ai）本探针未实现 SSE 解析，
# 会退化为非流式并在 JSONL 里如实标注 stream=false（不假装测过流式）。
STREAMABLE_APIS = {"openai-completions", "openai-responses"}


# ---------------------------------------------------------------- 凭据 / 配置


def load_credentials(path: Path = CREDENTIALS_PATH) -> dict[str, str]:
    """读 refs 段（env 名 -> key 原文）。只进内存，调用方绝不打印。"""
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    refs = data.get("refs") or {}
    return {str(k): str(v) for k, v in refs.items() if isinstance(v, str)}


def load_provider_configs(path: Path = PROFILE_PATCH_PATH) -> dict[str, dict]:
    """从 cordis.patch.yml 取 llm-pi-ai 段的 providers 配置（只读）。"""
    entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    llm_entries = [e for e in entries if isinstance(e, dict) and e.get("id") == "llm-pi-ai"]
    if not llm_entries:
        raise SystemExit(f"未在 {path} 找到 id=llm-pi-ai 的配置条目")
    providers = ((llm_entries[0].get("config") or {}).get("providers")) or {}
    if not isinstance(providers, dict) or not providers:
        raise SystemExit(f"{path} 的 llm-pi-ai.providers 为空或格式不符")
    return providers


def build_targets(providers: dict[str, dict]) -> list[dict]:
    """展开成待测目标列表：provider/model/api/baseURL/apiKeyEnv/headers/config_source。"""
    targets: list[dict] = []

    for name, cfg in BUILTIN_PROVIDERS.items():
        for model in cfg["models"]:
            targets.append(
                {
                    "provider": name,
                    "model": model,
                    "api": cfg["api"],
                    "baseURL": cfg["baseURL"],
                    "apiKeyEnv": cfg.get("apiKeyEnv"),
                    "headers": {},
                    "config_source": cfg["config_source"],
                }
            )

    for name, cfg in providers.items():
        if not isinstance(cfg, dict):
            continue
        api = cfg.get("api") or PROVIDER_DEFAULT_API.get(name, "openai-completions")
        base = cfg.get("baseURL") or ""
        headers = cfg.get("headers") or {}
        for item in cfg.get("models") or []:
            model = item.get("id") if isinstance(item, dict) else str(item)
            if not model:
                continue
            targets.append(
                {
                    "provider": name,
                    "model": model,
                    "api": api,
                    "baseURL": base,
                    "apiKeyEnv": cfg.get("apiKeyEnv"),
                    "headers": {str(k): str(v) for k, v in headers.items()},
                    "config_source": f"{PROFILE_PATCH_PATH}#llm-pi-ai.providers.{name}",
                }
            )
    return targets


# ---------------------------------------------------------------- 请求构造


def endpoint_for(api: str, base_url: str, model: str) -> str:
    base = base_url.rstrip("/")
    if api == "openai-completions":
        return f"{base}/chat/completions"
    if api == "openai-responses":
        return f"{base}/responses"
    if api == "anthropic-messages":
        # pi-ai 的 anthropic 传输在 baseURL 后接 /v1/messages（baseURL 本身可含或不含 /v1）
        return f"{base}/v1/messages" if not base.endswith("/v1") else f"{base}/messages"
    if api == "google-generative-ai":
        return f"{base}/models/{model}:generateContent"
    raise ValueError(f"不支持的 api 类型: {api}")


def headers_for(target: dict, api_key: str) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    api = target["api"]
    if api in ("openai-completions", "openai-responses"):
        headers["Authorization"] = f"Bearer {api_key}"
    elif api == "anthropic-messages":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    elif api == "google-generative-ai":
        headers["x-goog-api-key"] = api_key
    headers.update(target.get("headers") or {})
    return headers


def body_for(api: str, model: str, max_tokens: int) -> dict:
    """请求体里绝不出现 tools / tool_choice / functions —— 模型无从调用工具。"""
    if api == "openai-completions":
        return {
            "model": model,
            "messages": [{"role": "user", "content": PROMPT}],
            "max_tokens": max_tokens,
            "stream": False,
        }
    if api == "openai-responses":
        return {
            "model": model,
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": PROMPT}]}
            ],
            "max_output_tokens": max_tokens,
            "stream": False,
        }
    if api == "anthropic-messages":
        return {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": PROMPT}],
        }
    if api == "google-generative-ai":
        return {
            "contents": [{"role": "user", "parts": [{"text": PROMPT}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        }
    raise ValueError(f"不支持的 api 类型: {api}")


# ---------------------------------------------------------------- 响应解析 / 打码


def extract_text(api: str, data: dict) -> tuple[str, dict]:
    """返回 (可见文本, 附加证据)。只取文本，不做任何工具/内容执行。"""
    extra: dict = {}
    text = ""
    try:
        if api == "openai-completions":
            choices = data.get("choices") or []
            if choices:
                msg = choices[0].get("message") or {}
                text = msg.get("content") or ""
                extra["finish_reason"] = choices[0].get("finish_reason")
            usage = data.get("usage") or {}
            extra["usage_out"] = usage.get("completion_tokens")
        elif api == "openai-responses":
            parts: list[str] = []
            for item in data.get("output") or []:
                if item.get("type") == "message":
                    for c in item.get("content") or []:
                        if c.get("type") == "output_text":
                            parts.append(c.get("text") or "")
            text = "".join(parts)
            extra["status"] = data.get("status")
            usage = data.get("usage") or {}
            extra["usage_out"] = usage.get("output_tokens")
            if data.get("incomplete_details"):
                extra["incomplete_details"] = data["incomplete_details"]
        elif api == "anthropic-messages":
            for block in data.get("content") or []:
                if block.get("type") == "text":
                    text += block.get("text") or ""
            extra["stop_reason"] = data.get("stop_reason")
            extra["usage_out"] = (data.get("usage") or {}).get("output_tokens")
        elif api == "google-generative-ai":
            candidates = data.get("candidates") or []
            if candidates:
                for part in (candidates[0].get("content") or {}).get("parts") or []:
                    text += part.get("text") or ""
                extra["finish_reason"] = candidates[0].get("finishReason")
            extra["usage_out"] = ((data.get("usageMetadata") or {}).get("candidatesTokenCount"))
    except Exception as exc:  # 响应结构异常也要留证据，不吞掉
        extra["parse_error"] = f"{type(exc).__name__}: {exc}"[:120]
    return text, extra


def mask_text(text: object, secrets: list[str]) -> str:
    """给错误信息打码：凭据值字面替换 + 常见 token 形态正则。"""
    if text is None:
        return ""
    out = str(text)
    for secret in secrets:
        if secret and len(secret) >= 8 and secret in out:
            out = out.replace(secret, "***MASKED***")
    out = re.sub(r"sk-[A-Za-z0-9_\-]{8,}", "sk-***", out)
    out = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{8,}", r"\1***", out)
    out = re.sub(r"(?i)((?:x-api-key|x-goog-api-key|authorization)[\"'\s:=]+)[A-Za-z0-9._\-]{8,}",
                 r"\1***", out)
    return out


def error_fields(data: object, http_status: int | None) -> tuple[str | None, str | None]:
    """从 JSON 错误体里取 (error_code, error_msg)；取不到就返回 None。"""
    code = None
    msg = None
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            code = err.get("code") or err.get("type")
            msg = err.get("message") or err.get("msg")
        elif isinstance(err, str):
            msg = err
        if not code:
            code = data.get("type") if isinstance(data.get("type"), str) else None
        if not msg:
            for key in ("message", "error_msg", "detail"):
                if isinstance(data.get(key), str):
                    msg = data[key]
                    break
    if msg is None and http_status is not None:
        msg = f"HTTP {http_status}"
    return (str(code) if code else None, str(msg) if msg else None)


# ---------------------------------------------------------------- 传输（非流式 / SSE）

# 归一化传输结果字段：http_status / latency_ms / raw / text / extra /
# error_code / error_msg / retryable / stream_completed


def _send_plain(url: str, headers: dict, payload: bytes, timeout: float) -> dict:
    """非流式 POST；HTTP 错误体也读回来当证据。"""
    result = {"http_status": None, "latency_ms": None, "raw": "", "error": None,
              "retryable": False, "stream_completed": None}
    t0 = time.time()
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result["raw"] = resp.read().decode("utf-8", "replace")
            result["http_status"] = resp.status
    except urllib.error.HTTPError as exc:
        result["raw"] = exc.read().decode("utf-8", "replace")
        result["http_status"] = exc.code
        result["retryable"] = exc.code in RETRYABLE_STATUS
    except Exception as exc:  # URLError / SSL / 超时
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["retryable"] = True
    result["latency_ms"] = int((time.time() - t0) * 1000)
    return result


def _consume_stream_event(api: str, event: dict, extra: dict) -> tuple[str, bool, dict | None]:
    """消费一个 SSE data 事件，返回 (增量文本, 是否完成, 错误对象或 None)。"""
    etype = event.get("type")
    err = None
    text = ""
    done = False
    if api == "openai-completions":
        if etype == "error":
            err = event.get("error") or event
        for choice in event.get("choices") or []:
            delta = choice.get("delta") or {}
            text += delta.get("content") or ""
            if choice.get("finish_reason"):
                done = True
                extra["finish_reason"] = choice["finish_reason"]
        usage = event.get("usage") or {}
        if usage.get("completion_tokens") is not None:
            extra["usage_out"] = usage["completion_tokens"]
    elif api == "openai-responses":
        if etype == "response.output_text.delta":
            text = event.get("delta") or ""
        elif etype == "response.completed":
            done = True
            resp = event.get("response") or {}
            extra["status"] = resp.get("status")
            extra["usage_out"] = (resp.get("usage") or {}).get("output_tokens")
        elif etype == "response.incomplete":
            done = True
            resp = event.get("response") or {}
            extra["status"] = resp.get("status")
            extra["incomplete_details"] = resp.get("incomplete_details")
        elif etype in ("response.failed", "error"):
            err = event.get("response") or event
        else:
            # 兼容部分网关：把完整 response 对象塞在 data 里
            resp = event.get("response") if isinstance(event.get("response"), dict) else None
            if resp and resp.get("status") == "completed":
                done = True
    return text, done, err


def _send_stream(url: str, headers: dict, payload: bytes, api: str, timeout: float) -> dict:
    """SSE 流式 POST（仅 openai-completions / openai-responses）。"""
    result = {"http_status": None, "latency_ms": None, "text": "", "extra": {},
              "error_code": None, "error_msg": None, "retryable": False,
              "stream_completed": False}
    headers = {**headers, "Accept": "text/event-stream"}
    t0 = time.time()
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result["http_status"] = resp.status
            for raw_line in resp:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line or line.startswith(("event:", ":", "id:", "retry:")):
                    continue
                if not line.startswith("data:"):
                    continue
                data_str = line[len("data:"):].strip()
                if data_str == "[DONE]":
                    result["stream_completed"] = True
                    break
                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                if isinstance(event, list):  # 某些网关把批量事件包成数组
                    event = event[0] if event else {}
                text, done, err = _consume_stream_event(api, event, result["extra"])
                result["text"] += text
                if err:
                    result["error_code"] = err.get("code") or err.get("type")
                    result["error_msg"] = err.get("message") or str(err)[:200]
                if done:
                    result["stream_completed"] = True
                    break
    except urllib.error.HTTPError as exc:
        result["raw"] = exc.read().decode("utf-8", "replace")
        result["http_status"] = exc.code
        result["retryable"] = exc.code in RETRYABLE_STATUS
    except Exception as exc:  # 读流中断等
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["retryable"] = True
    result["latency_ms"] = int((time.time() - t0) * 1000)
    return result


# ---------------------------------------------------------------- 单模型探测 / 判定


def verdict_of(rec: dict) -> str:
    """判定只依据实测字段；无法判定写未验证，不写假绿。"""
    code = (rec.get("error_code") or "").lower()
    hs = rec.get("http_status")
    if hs is None:
        return "阻塞：网络/SSL 失败（无 HTTP 响应）"
    if 200 <= hs < 300:
        if rec.get("text"):
            return "通"
        if rec.get("stream") and not rec.get("stream_completed"):
            return "阻塞：SSE 未见完成事件"
        if rec.get("error_code"):
            return f"阻塞：流内错误（{rec['error_code']}）"
        if rec.get("incomplete_details") or (rec.get("status") and rec["status"] != "completed"):
            return "通（鉴权/路由 OK；max_tokens 被推理耗尽，未出文本）"
        return "通（鉴权/路由 OK；无文本输出）"
    if hs == 401:
        return "阻塞：401 鉴权/额度"
    if hs == 403:
        if "quota" in code or "insufficient" in code:
            return "配置通·余额0（403 insufficient_user_quota）"
        return "阻塞：403 被拒"
    if hs == 404:
        return "阻塞：404 路由/模型不存在"
    if hs == 429:
        return "阻塞：429 限流"
    return f"阻塞：HTTP {hs}"


def probe_one(target: dict, api_key: str | None, secrets: list[str],
              max_tokens: int, timeout: float, stream: bool = False) -> dict:
    """对单个 provider/model 发一次最小请求；网络/5xx 类错误重试 1 次（指数退避）。"""
    ts = datetime.now().astimezone().isoformat(timespec="seconds")
    stream_mode = bool(stream and target["api"] in STREAMABLE_APIS)
    rec: dict = {
        "ts": ts,
        "provider": target["provider"],
        "model": target["model"],
        "api": target["api"],
        "config_source": target["config_source"],
        "max_tokens": max_tokens,
        "stream": stream_mode,
        "attempts": 0,
        "http_status": None,
        "ok": False,
        "latency_ms": None,
        "text": "",
        "pong": False,
        "error_code": None,
        "error_msg": None,
        "verdict": "",
    }

    if not api_key:
        rec["verdict"] = f"未验证：凭据缺失（{target.get('apiKeyEnv') or '未配置 apiKeyEnv'}）"
        return rec

    try:
        url = endpoint_for(target["api"], target["baseURL"], target["model"])
    except ValueError as exc:
        rec["verdict"] = f"未验证：{exc}"
        return rec
    rec["endpoint"] = url
    headers = headers_for(target, api_key)
    body = body_for(target["api"], target["model"], max_tokens)
    if stream_mode:
        body["stream"] = True
    payload = json.dumps(body).encode("utf-8")

    for attempt in range(2):  # 最多 2 次 = 首次 + 重试 1 次
        rec["attempts"] = attempt + 1
        if stream_mode:
            res = _send_stream(url, headers, payload, target["api"], timeout)
        else:
            res = _send_plain(url, headers, payload, timeout)

        hs = res["http_status"]
        rec["http_status"] = hs
        rec["latency_ms"] = res["latency_ms"]
        rec["ok"] = bool(hs and 200 <= hs < 300)

        if rec["ok"]:
            if stream_mode:
                rec["text"] = mask_text(res["text"], secrets)[:120]
                rec["pong"] = "PONG" in res["text"].upper()
                rec["stream_completed"] = bool(res["stream_completed"])
                rec.update({k: v for k, v in (res.get("extra") or {}).items() if v is not None})
                ec, em = res.get("error_code"), res.get("error_msg")
                rec["error_code"] = mask_text(ec, secrets)[:80] if ec else None
                rec["error_msg"] = mask_text(em, secrets)[:200] if em else None
            else:
                data = None
                try:
                    data = json.loads(res["raw"]) if res["raw"] else None
                except json.JSONDecodeError:
                    data = None
                text, extra = extract_text(target["api"], data or {})
                rec["text"] = mask_text(text, secrets)[:120]
                rec["pong"] = "PONG" in text.upper()
                rec.update({k: v for k, v in extra.items() if v is not None})
                rec["error_code"], rec["error_msg"] = None, None
        else:
            data = None
            raw = res.get("raw") or ""
            try:
                data = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                data = None
            code, msg = error_fields(data, hs)
            if data is None and res.get("error"):
                msg = res["error"]
            elif data is None and raw:
                msg = raw[:200]
            rec["error_code"] = mask_text(code, secrets)[:80] if code else None
            rec["error_msg"] = mask_text(msg, secrets)[:200] if msg else None

        if res.get("retryable") and attempt == 0:
            time.sleep(RETRY_BACKOFF_S * (2 ** attempt))
            continue
        break

    rec["verdict"] = verdict_of(rec)
    return rec


# ---------------------------------------------------------------- 主流程


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="墨戏生花 S0 模型链路探针（直连 HTTP，无工具/无副作用）"
    )
    parser.add_argument("--only", action="append", default=None, metavar="MODEL",
                        help="只测指定模型，可写 model id 或 provider/model；可重复")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT,
                        help=f"单次请求超时秒数（默认 {DEFAULT_TIMEOUT:g}）")
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS,
                        help=f"单次生成上限（默认 {DEFAULT_MAX_TOKENS}；推理模型可用 512 复测）")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR,
                        help=f"JSONL 输出目录（默认 {OUTPUT_DIR}）")
    parser.add_argument("--stream", action="store_true",
                        help="改用 SSE 流式请求（仅 openai-completions/openai-responses；"
                             "DSH 实际走流式，用此模式抽测协议兼容性）")
    args = parser.parse_args(argv)

    credentials = load_credentials()
    providers = load_provider_configs()
    targets = build_targets(providers)

    if args.only:
        wanted = [s.strip() for s in args.only if s and s.strip()]
        selected = []
        for t in targets:
            for w in wanted:
                if w == t["model"] or w == f"{t['provider']}/{t['model']}":
                    selected.append(t)
                    break
        if not selected:
            sys.stderr.write("--only 没有匹配到任何模型。可选目标：\n")
            for t in targets:
                sys.stderr.write(f"  {t['provider']}/{t['model']}  ({t['api']})\n")
            return 2
        targets = selected

    secrets = [v for v in credentials.values() if v]
    out_dir = Path(args.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = out_dir / f"probe-{stamp}.jsonl"

    print(f"== 墨戏生花 S0 模型链路探针 {datetime.now().astimezone().isoformat(timespec='seconds')} ==")
    print(f"   配置: {PROFILE_PATCH_PATH} (+ 内置 deepseek-official)")
    print(f"   参数: max_tokens={args.max_tokens} timeout={args.timeout:g}s "
          f"mode={'SSE 流式' if args.stream else '非流式'} 目标 {len(targets)} 个")
    print()

    records: list[dict] = []
    with out_path.open("w", encoding="utf-8") as fh:
        for t in targets:
            api_key = credentials.get(t.get("apiKeyEnv") or "")
            rec = probe_one(t, api_key, secrets, args.max_tokens, args.timeout, args.stream)
            records.append(rec)
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            fh.flush()
            hs = rec["http_status"] if rec["http_status"] is not None else "-"
            lat = f"{rec['latency_ms']}ms" if rec["latency_ms"] is not None else "-"
            print(f"   {t['provider'] + '/' + t['model']:<38} http={str(hs):<4} {lat:>8}  {rec['verdict']}")
            if rec["error_msg"]:
                print(f"       error_code={rec['error_code']} error_msg={rec['error_msg'][:120]}")

    print()
    ok = sum(1 for r in records if r["verdict"] == "通")
    rt = sum(1 for r in records if r["verdict"].startswith("通"))
    blocked = len(records) - rt
    print(f"汇总: {len(records)} 个模型，判定=通 {ok}，可路由(含降级) {rt}，阻塞/未验证 {blocked}")
    print(f"JSONL: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
