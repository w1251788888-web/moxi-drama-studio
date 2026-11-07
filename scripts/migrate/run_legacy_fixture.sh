#!/usr/bin/env bash
# S2.3 fixture 一键脚本：造旧库 → 快照 → kill 旧后端。
#
# 步骤（全部真实经过旧系统路由，不改旧代码、不改基线被跟踪文件）：
#   1. 生成独立 fixture config（DB 落到 analysis/migrate/fixture-<label>/legacy.db，
#      admin 密码 bcrypt 写死，backend 用 MOXI_CONFIG_PATH 加载，不碰仓库里的 config.yaml）
#   2. 启动旧后端 uvicorn（自动等 /api/health）
#   3. create_legacy_fixture.py 通过 HTTP API 建 1 项目 / 3 集 / 9 场 / 4 次保存
#   4. snapshot_legacy.py 快照 DB + 旧工作区 + 表计数（只读连接 + 只读探针）
#   5. kill -TERM 旧后端（trap 保证异常路径也不留孤儿）
#
# 用法：
#   bash scripts/migrate/run_legacy_fixture.sh \
#       [--label s23-fixture] [--port 6565] [--project-name 雾港旧书店]
#
# 产物（analysis/migrate/ 下）：
#   fixture-<label>/         fixture-config.yaml / legacy.db / fixture-manifest.json / logs/
#   legacy-snapshot-<label>/ tasks.db / table-counts.json / workspace/ / snapshot-manifest.json
#   fixture-<label>/logs/run-meta.json   PID / 启动耗时 / kill 结果 / 退出码
set -euo pipefail

V2="$(cd "$(dirname "$0")/../.." && pwd)"
B="$V2/archive/moxi-baseline"
C="$B/01-system-core"
PY="$C/.venv-baseline/bin/python"
LABEL="fixture"
PORT="6565"
PROJECT_NAME="雾港旧书店"
ADMIN_PASSWORD="MoxiFixture2026"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

RUN_DIR="$V2/analysis/migrate/fixture-$LABEL"
SNAP_DIR="$V2/analysis/migrate/legacy-snapshot-$LABEL"
LOG_DIR="$RUN_DIR/logs"
mkdir -p "$LOG_DIR" "$SNAP_DIR"

DB_PATH="$RUN_DIR/legacy.db"
CONFIG_PATH="$RUN_DIR/fixture-config.yaml"
MANIFEST_PATH="$RUN_DIR/fixture-manifest.json"
UVICORN_LOG="$LOG_DIR/uvicorn.log"
UVICORN_PID=""
HEALTH_SECONDS=""

kill_backend() {
  local pid="${UVICORN_PID:-}"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[run-fixture] SEND SIGTERM -> $pid"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 80); do
      if ! kill -0 "$pid" 2>/dev/null; then break; fi
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "[run-fixture] SIGTERM 后仍存活，SEND SIGKILL -> $pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
}
trap 'kill_backend' EXIT INT TERM

if [[ ! -x "$PY" ]]; then
  echo "[run-fixture] 缺少基线 venv: $PY（先按旧系统运行环境准备，参考 config.yaml.example）" >&2
  exit 1
fi
if [[ ! -f "$C/config.yaml" ]]; then
  echo "[run-fixture] 缺少 $C/config.yaml（可从 config.yaml.example 复制）" >&2
  exit 1
fi

# ---- 1) fixture config：独立 DB / 写死 bcrypt 密码 / 独立端口 ----
"$PY" - "$C/config.yaml" "$CONFIG_PATH" "$DB_PATH" "$ADMIN_PASSWORD" "$PORT" <<'PYEOF'
import sys, bcrypt, yaml
from pathlib import Path
src_path, out_path, db_path, password, port = sys.argv[1:6]
data = yaml.safe_load(Path(src_path).read_text(encoding="utf-8"))
data["admin"]["password"] = "bcrypt:" + bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
data["database"] = {"type": "sqlite", "path": db_path}
data["setup"] = {"initialized": True}
data.setdefault("server", {})["port"] = int(port)
Path(out_path).write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False), encoding="utf-8")
print(f"[run-fixture] fixture config -> {out_path}")
print(f"[run-fixture]       db path    -> {db_path}")
PYEOF

# ---- 2) 启动旧后端（无 --reload，避免文件监听干扰）----
(
  cd "$C"
  MOXI_CONFIG_PATH="$CONFIG_PATH" exec "$PY" -m uvicorn app.main:app \
    --host 127.0.0.1 --port "$PORT" >"$UVICORN_LOG" 2>&1
) &
UVICORN_PID=$!
echo "[run-fixture] uvicorn PID=$UVICORN_PID (log: $UVICORN_LOG)"

START_TS=$(date +%s)
READY=""
for _ in $(seq 1 240); do
  if ! kill -0 "$UVICORN_PID" 2>/dev/null; then
    echo "[run-fixture] 后端进程提前退出，日志尾部：" >&2
    tail -30 "$UVICORN_LOG" >&2 || true
    exit 1
  fi
  if curl -sf -m 1 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    READY="yes"; break
  fi
  sleep 0.25
done
END_TS=$(date +%s)
HEALTH_SECONDS=$((END_TS - START_TS))
if [[ -z "$READY" ]]; then
  echo "[run-fixture] 等待 /api/health 超时（${HEALTH_SECONDS}s），日志尾部：" >&2
  tail -40 "$UVICORN_LOG" >&2 || true
  exit 1
fi
echo "[run-fixture] health OK in ${HEALTH_SECONDS}s; $(curl -s "http://127.0.0.1:$PORT/api/health")"

# ---- 3) 通过旧后端 API 造 fixture ----
"$PY" "$V2/scripts/migrate/create_legacy_fixture.py" \
  --base-url "http://127.0.0.1:$PORT" \
  --password "$ADMIN_PASSWORD" \
  --project-name "$PROJECT_NAME" \
  --manifest-out "$MANIFEST_PATH" | tee "$LOG_DIR/create-fixture.log"

# ---- 4) 快照（只读连接；fixture 数据已落库）----
"$PY" "$V2/scripts/migrate/snapshot_legacy.py" \
  --db "$DB_PATH" --manifest "$MANIFEST_PATH" --out "$SNAP_DIR" | tee "$LOG_DIR/snapshot.log"

# ---- 5) 显式 kill 旧后端 ----
kill_backend
EXIT_CODE=$?
sleep 0.5
LISTENING="$(lsof -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
ORPHAN="$(pgrep -fl "uvicorn app.main" || true)"
echo "[run-fixture] kill 后端口监听: ${LISTENING:-无}; uvicorn 进程: ${ORPHAN:-无}"

{
  printf '{\n'
  printf '  "label": "%s",\n' "$LABEL"
  printf '  "port": %s,\n' "$PORT"
  printf '  "projectName": "%s",\n' "$PROJECT_NAME"
  printf '  "uvicornPid": %s,\n' "$UVICORN_PID"
  printf '  "healthReadySeconds": %s,\n' "$HEALTH_SECONDS"
  printf '  "fixtureManifest": "%s",\n' "$MANIFEST_PATH"
  printf '  "snapshotDir": "%s",\n' "$SNAP_DIR"
  printf '  "killExitCode": %s,\n' "$EXIT_CODE"
  printf '  "portListeningAfterKill": "%s",\n' "${LISTENING:-}"
  printf '  "orphanUvicornAfterKill": "%s"\n' "${ORPHAN:-}"
  printf '}\n'
} > "$LOG_DIR/run-meta.json"

if [[ -n "$LISTENING" || -n "$ORPHAN" ]]; then
  echo "[run-fixture] ERROR 旧后端未清理干净" >&2
  exit 1
fi
echo "[run-fixture] DONE fixture=$RUN_DIR snapshot=$SNAP_DIR"
