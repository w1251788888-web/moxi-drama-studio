#!/usr/bin/env bash
# 墨戏生花 v2 · 一条命令安装（专用 moxi profile + 3 个 bundle + 技能）
# 用法：bash dsh/profile/install.sh            # 安装/升级
#       bash dsh/profile/install.sh --uninstall # 卸载（保留项目数据）
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILE="${MOXI_PROFILE:-moxi}"
SKILL_DIR="${DSH_HOME:-$HOME/.dsh}/skills/moxi-drama-creation"
MODE="${1:-install}"

say() { printf '\033[1;36m[install]\033[0m %s\n' "$*"; }

if [ "$MODE" = "--uninstall" ]; then
  say "移除 profile $PROFILE 的 bundle"
  dsh plugin --profile "$PROFILE" remove moxi-core-bundle moxi-canvas-bundle moxi-admin-bundle || true
  say "卸载完成（项目数据仍在 ~/Documents/Moxi/projects，未删除）"
  exit 0
fi

say "仓库：$REPO"
say "profile：$PROFILE"

# 1) 首次创建 profile（从 shipped web 模板）
if [ ! -d "${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE" ]; then
  say "创建 profile ${PROFILE}（shipped web 模板）"
  dsh --profile "$PROFILE" --from-default-profile web --dump-config > /dev/null
fi

# 2) 安装三个 bundle（本地 link；pnpm 会自动写入 dsh.profile.bundles）
say "安装 bundles"
dsh plugin --profile "$PROFILE" add \
  "$REPO/dsh/bundles/moxi-core" \
  "$REPO/dsh/bundles/moxi-canvas" \
  "$REPO/dsh/bundles/moxi-admin"

# 3) 技能（可选，默认不覆盖用户已有技能）
#    MOXI_INSTALL_SKILL=1 才会安装到 ~/.dsh/skills/moxi-drama-creation。
#    注意：如果目标是符号链接（例如指向 WorkBuddy 目录），安装会**替换该链接**，
#    因此先把链接目标的实际内容备份成真实目录，并在输出里明确告知。
if [ "${MOXI_INSTALL_SKILL:-0}" = "1" ]; then
  if [ -L "$SKILL_DIR" ]; then
    TARGET="$(readlink "$SKILL_DIR")"
    BAK="${TARGET}.bak.$(date +%Y%m%d-%H%M%S)"
    say "技能目录是符号链接 → $TARGET"
    say "备份链接目标的实际内容为真实目录 → $BAK"
    cp -RL "$TARGET" "$BAK"
    rm -f "$SKILL_DIR"
  elif [ -d "$SKILL_DIR" ]; then
    BAK="${SKILL_DIR}.bak.$(date +%Y%m%d-%H%M%S)"
    say "备份现有技能 → $BAK"
    cp -RL "$SKILL_DIR" "$BAK"
    rm -rf "$SKILL_DIR"
  fi
  say "安装技能 v2 → $SKILL_DIR"
  mkdir -p "$(dirname "$SKILL_DIR")"
  cp -RL "$REPO/skills/moxi-drama-creation" "$SKILL_DIR"
else
  say "跳过技能安装（如需安装：MOXI_INSTALL_SKILL=1 bash dsh/profile/install.sh）"
  say "技能 v2 源码位置：$REPO/skills/moxi-drama-creation"
fi

# 4) 校验
say "校验安装"
dsh --profile "$PROFILE" --dump-config | grep -q 'moxi-core-bundle' || { echo "✗ moxi-core 未挂载"; exit 1; }
dsh --profile "$PROFILE" --dump-config | grep -q 'moxi-canvas-bundle' || { echo "✗ moxi-canvas 未挂载"; exit 1; }
dsh --profile "$PROFILE" --dump-config | grep -q 'moxi-admin-bundle' || { echo "✗ moxi-admin 未挂载"; exit 1; }
if [ "${MOXI_INSTALL_SKILL:-0}" = "1" ]; then
  [ -f "$SKILL_DIR/SKILL.md" ] || { echo "✗ 技能未安装"; exit 1; }
fi

say "完成。启动：dsh --profile $PROFILE"
say "项目数据：${MOXI_PROJECTS_ROOT:-$HOME/Documents/Moxi/projects}"
