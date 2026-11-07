#!/usr/bin/env bash
# 墨戏生花 v2 · 本地部署（macOS 本地应用）
#
# 把产品装成 ~/Applications/墨戏生花.app：
#   双击图标 → 自动拉起本地服务（127.0.0.1:59911）→ 用应用窗口模式打开，无浏览器界面。
#
# 为什么不是装进 DeepSeek Harness 桌面 App：
#   DSH Electron 独占 desktop profile，CLI 明确拒绝（profile "desktop" is managed exclusively
#   by the Electron application），第三方无法安全写入。因此本脚本交付独立本地应用外壳。
#
# 用法：
#   bash dsh/profile/install-desktop.sh              # 安装/升级
#   bash dsh/profile/install-desktop.sh --check      # 只做自检，不安装
#   bash dsh/profile/install-desktop.sh --uninstall  # 卸载应用（项目数据不动）
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="$HOME/Applications/墨戏生花.app"
CFG_DIR="$HOME/.moxi"
CFG="$CFG_DIR/launcher.json"
PORT="${MOXI_PORT:-59911}"
MODE="${1:-install}"
say() { printf '\033[1;36m[desktop]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[desktop]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[desktop]\033[0m %s\n' "$*"; }

# ---------- 依赖自检 ----------
DSH_BIN="$(command -v dsh || true)"
BROWSER=""
[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] && BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -z "$BROWSER" ] && [ -x "/Applications/ego lite.app/Contents/MacOS/ego lite" ] && BROWSER="/Applications/ego lite.app/Contents/MacOS/ego lite"
PY_BIN="$(command -v python3 || true)"
NODE_BIN="$(command -v node || true)"
BUNDLES_OK=0
dsh --profile moxi --dump-config 2>/dev/null | grep -q moxi-core-bundle && BUNDLES_OK=1

self_check() {
  local bad=0
  [ -n "$DSH_BIN" ] && say "✓ dsh：$DSH_BIN" || { fail "✗ 缺少 dsh（DeepSeek Harness CLI）"; bad=1; }
  [ "$BUNDLES_OK" = "1" ] && say "✓ moxi profile 已装 3 个 bundle" || { fail "✗ moxi profile 未安装 bundle（先跑 dsh/profile/install.sh）"; bad=1; }
  [ -n "$BROWSER" ] && say "✓ 应用窗口浏览器：$BROWSER" || { fail "✗ 缺少 Chrome 或 ego lite（应用窗口模式需要）"; bad=1; }
  [ -n "$PY_BIN" ] && say "✓ python3：$PY_BIN" || { fail "✗ 缺少 python3"; bad=1; }
  [ -n "$NODE_BIN" ] && say "✓ node：$NODE_BIN" || { fail "✗ 缺少 node（dsh 入口是 `#!/usr/bin/env node`，必须把 node 目录写进启动 PATH）"; bad=1; }
  return $bad
}

if [ "$MODE" = "--check" ]; then
  say "自检（不安装）"
  self_check && say "全部通过" || { fail "自检未通过"; exit 1; }
  exit 0
fi

if [ "$MODE" = "--uninstall" ]; then
  say "卸载本地应用"
  rm -rf "$APP"
  rm -f "$CFG" "$CFG_DIR/launch.sh"
  say "已移除 $APP（项目数据仍在 ~/Documents/Moxi/projects）"
  exit 0
fi

# ---------- 安装 ----------
if ! self_check; then
  fail "依赖不满足，已中止安装"
  exit 1
fi

mkdir -p "$CFG_DIR" "$HOME/Applications"
cp -f "$REPO/dsh/launcher/moxi.command" "$CFG_DIR/launch.sh"
chmod +x "$CFG_DIR/launch.sh"

cat > "$CFG" <<JSON
{
  "repo": "$REPO",
  "dsh": "$DSH_BIN",
  "browser": "$BROWSER",
  "port": $PORT,
  "node": "$NODE_BIN",
  "installedAt": "$(date -Iseconds)"
}
JSON
say "写入安装配置：$CFG"

# 图标
ICNS="$REPO/dsh/launcher/Moxi.icns"
if [ ! -f "$ICNS" ] && [ -x "$PY_BIN" ]; then
  "$PY_BIN" "$REPO/dsh/launcher/make-icon.py" >/dev/null 2>&1 || true
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
[ -f "$ICNS" ] && cp -f "$ICNS" "$APP/Contents/Resources/icon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>墨戏生花</string>
  <key>CFBundleDisplayName</key><string>墨戏生花</string>
  <key>CFBundleIdentifier</key><string>local.moxi.studio</string>
  <key>CFBundleVersion</key><string>2.0.0</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>moxi-launch</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict>
</plist>
PLIST
cat > "$APP/Contents/MacOS/moxi-launch" <<'SH'
#!/bin/bash
# 由 ~/Applications/墨戏生花.app 调用；真正的启动逻辑在 ~/.moxi/launch.sh
exec /bin/bash "$HOME/.moxi/launch.sh"
SH
chmod +x "$APP/Contents/MacOS/moxi-launch"
xattr -cr "$APP" 2>/dev/null || true

say "已安装：$APP"
say "双击「墨戏生花」即可使用（首次会拉起本地服务，约 15 秒）。"
warn "说明：窗口由本机 Chrome/ego lite 以 --app 模式承载（无地址栏/标签页）；"
warn "      若要完全独立进程身份，需要自研 Electron 壳，属于后续工作。"
say "自检：bash dsh/profile/install-desktop.sh --check"
say "卸载：bash dsh/profile/install-desktop.sh --uninstall"
