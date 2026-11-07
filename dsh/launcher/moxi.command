#!/usr/bin/env bash
# 墨戏生花 v2 · 本地应用启动器（安装后复制到 ~/.moxi/launch.sh，双击 App 调用）
#
# 设计约束（来自复审意见）：
#   - 不写死路径：仓库/工具/浏览器都从 ~/.moxi/launcher.json 读，安装时写入
#   - 不裸调 dsh：用安装时解析出的绝对路径，Finder 启动也不依赖 PATH
#   - 不静默退回网页：没有可用浏览器就直接报错并提示，不打开普通网页冒充本地应用
#   - 只监听回环地址；数据全在本地
set -uo pipefail

CFG="$HOME/.moxi/launcher.json"
LOG_DIR="$HOME/.moxi"
LOG="$LOG_DIR/web.log"
APP_DATA="$HOME/Library/Application Support/MoxiApp"
say() { printf '\033[1;36m[墨戏]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[墨戏]\033[0m %s\n' "$*"; exit 1; }

mkdir -p "$LOG_DIR"
[ -f "$CFG" ] || die "未安装：缺少 $CFG。请运行 moxi/dsh/profile/install-desktop.sh"
PY="$(command -v python3 || true)"
[ -n "$PY" ] || die "缺少 python3，无法读取安装配置"

read_cfg() {
  "$PY" - "$CFG" "$1" <<'PYEOF'
import json, sys
cfg = json.load(open(sys.argv[1]))
print(cfg.get(sys.argv[2], ""))
PYEOF
}

REPO="$(read_cfg repo)"
DSH_BIN="$(read_cfg dsh)"
BROWSER="$(read_cfg browser)"
PORT="$(read_cfg port)"; PORT="${PORT:-59911}"
NODE_BIN="$(read_cfg node)"
# Finder 冷启动 PATH 很窄：把安装时记录的工具目录补回去（dsh 入口是 #!/usr/bin/env node）
[ -n "${NODE_BIN:-}" ] && [ -x "$NODE_BIN" ] && PATH="$(dirname "$NODE_BIN"):$PATH"
[ -n "${DSH_BIN:-}" ] && PATH="$(dirname "$DSH_BIN"):$PATH"
export PATH
[ -n "${DSH_BIN:-}" ] && [ -x "$DSH_BIN" ] || die "安装配置里的 dsh 不可执行：$DSH_BIN（请重跑 install-desktop.sh）"
[ -n "${BROWSER:-}" ] && [ -x "$BROWSER" ] || die "没有可用的本地应用窗口浏览器（Chrome / ego lite），请安装任意一个后重跑 install-desktop.sh"
[ -d "$REPO/dsh/bundles/moxi-core" ] || die "源码目录不存在：$REPO（移动过目录请重跑 install-desktop.sh）"

port_up() { curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/"; }
token_from_log() {
  for f in "$LOG" /tmp/moxi-web.log "${TMPDIR:-/tmp}/moxi-web.log"; do
    [ -f "$f" ] || continue
    local u
    u="$(grep -oE "http://127\.0\.0\.1:$PORT/\?token=[A-Za-z0-9_-]+" "$f" | tail -1 || true)"
    [ -n "$u" ] && { echo "$u"; return 0; }
  done
  return 1
}
stop_ours() {
  local pids
  pids="$(pgrep -f -- "--profile moxi .*--port $PORT" || true)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  sleep 2
}
start_server() {
  say "启动本地服务（127.0.0.1:$PORT）…"
  : > "$LOG"
  nohup "$DSH_BIN" --profile moxi --no-open --port "$PORT" >> "$LOG" 2>&1 &
  for _ in $(seq 1 45); do sleep 1; port_up && return 0; done
  return 1
}

# 已开着应用窗口 → 直接激活，不重复开
if pgrep -f "user-data-dir=$APP_DATA" >/dev/null 2>&1; then
  say "窗口已打开，正在切到前台"
  open -a "$(basename "$BROWSER" .app)" 2>/dev/null || true
  # 窗口在但服务可能挂了：顺手救一下
  port_up || { start_server || die "服务启动失败，日志：$LOG"; }
  exit 0
fi

URL=""
if port_up; then
  URL="$(token_from_log || true)"
  [ -z "${URL:-}" ] && { say "服务在跑但拿不到登录 token，重启本地服务…"; stop_ours; }
fi
if [ -z "${URL:-}" ]; then
  start_server || die "服务启动失败，日志：$LOG"
  URL="$(token_from_log || true)"
fi
[ -n "${URL:-}" ] || die "没拿到登录 token，日志：$LOG"

say "以应用窗口打开"
ARGS=(--app="$URL" --user-data-dir="$APP_DATA" --window-size=1440,900 --no-first-run --no-default-browser-check)
BROWSER_NAME="$(basename "$(dirname "$(dirname "$BROWSER")")" .app)"
case "$BROWSER" in
  *"Google Chrome"*) open -na "Google Chrome" --args "${ARGS[@]}" >/dev/null 2>&1 || exec "$BROWSER" "${ARGS[@]}" ;;
  *) exec "$BROWSER" "${ARGS[@]}" ;;
esac
