# Harness² eval v1 · baseline 手册

> **状态：框架就绪，baseline 未跑（NOT RUN）。**
> 原因：S2.4 的硬边界是「不调用任何付费模型跑 eval，只搭框架」。本文件把「怎么跑一轮」写死，S3 起直接按此执行并回填结果。
> 版本：evalVersion = `v1`；harnessVersion = `v1-skeleton`；grader 入口 `graders/grade.py`。

---

## 1. baseline 是什么（待跑时冻结）

| 字段 | 值 | 说明 |
|---|---|---|
| `baselineId` | `baseline-v1-skeleton` | 首个 baseline 的稳定 id |
| `evalVersion` | `v1` | 改题必须 bump 到 v2 |
| `harnessVersion` | `v1-skeleton` | 当前 harness（rules 未接入 / skills 空 / persona 默认） |
| `model` | `deepseek-flash` | 锁死；换模型 = 换 baseline |
| `k` | `3` | 每任务 3 次独立抽样 |
| `rolloutsPerRound` | `18` | 6 任务 × 3 |
| `probeSessionsPerRound` | `0` | v1 不做 improver（P=0） |
| 预算上限/轮 | `192 turns / 600 tool calls / 5760s` | 见 `manifest.yaml#budget` |

> 注意：`v1-skeleton` 只是「还没接规则包/技能」的初始 harness。S3 把 `rules/v2` + `skills/moxi-drama-creation` 接进去之后，必须**新开 baseline**（`baseline-v2-rules`），不能拿旧 baseline 对比新 harness。

---

## 2. 怎么跑一轮（运维版）

一轮 = 3 个 draw-set；一个 draw-set = E1–E6 各一次独立会话。

```bash
cd moxi

STAMP=$(date +%Y%m%d-%H%M)
RUN=harness/runs/$STAMP
for d in 1 2 3; do mkdir -p "$RUN/draw-$d"; done

# ① 铺夹具（离线）
python3 - "$RUN" <<'PY'
import json, shutil, sys
from pathlib import Path
root = Path("harness"); run = Path(sys.argv[1])
for f in sorted((root / "eval/v1").glob("E*_*.json")):
    t = json.loads(f.read_text(encoding="utf-8"))
    for d in ("draw-1", "draw-2", "draw-3"):
        ws = run / d / t["id"]; ws.mkdir(parents=True, exist_ok=True)
        for spec in t["input"]["workspaceFiles"]:
            shutil.copy(root / spec["from"], ws / spec["to"])
print("ready:", run)
PY

# ② rollout（需要 DSH；每任务一个全新会话）
#   - 工作目录：$RUN/draw-<N>/<E>
#   - 任务文本：任务 JSON 的 input.prompt（原样，不要人工改写）
#   - 模型：deepseek-flash（baseline 锁死）
#   - 校验点：Agent 必须把结果写成 workspace 根目录的 <output.path>
#   - 立刻记录：本 draw 的 model / turns / toolCalls / wallClockS
#   - 每个 draw 结束：杀掉会话，重开新会话（禁止复用上下文）

# ③ 评分（离线、纯标准库、不烧额度）
for d in draw-1 draw-2 draw-3; do
  python3 harness/graders/grade.py --all --run-dir "$RUN/$d" --json > "$RUN/$d/grade.json"
  # 人工看失败项：jq '.tasks[] | select(.ok==false) | {task, failed}' "$RUN/$d/grade.json"
done

# ④ 写 ledger（每个 draw 每个任务一行，模板见下）
# ⑤ 汇总成 §4 的记录表
```

**重试规则**（防止用重试刷分）：

- 会话崩溃/超时（非任务失败）可以重跑该 draw，但必须：重跑次数入 ledger（`retryOf` 字段）、最多重试 1 次、重试后仍失败记为 fail。
- 「输出格式不对」不允许人工修，直接记 fail——grader 就是判这个的。
- 禁止在 rollout 期间改 harness / 改题 / 改沙箱；发现动了 → 本轮作废。

---

## 3. 预算 ledger

每行一个字段，JSONL（`ledger-template.jsonl` 是样板）。**不记美元**（DSH 按订阅计费，不提供按会话金额，编造 usd 就是作弊）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `roundId` | string | ✅ | 例如 `20261106-0200`（= `$RUN` 目录名） |
| `harnessId` | string | ✅ | 例如 `baseline-v1-skeleton` |
| `evalVersion` | string | ✅ | `v1` |
| `task` | string | ✅ | `E1`…`E6` |
| `draw` | int | ✅ | 1–3 |
| `model` | string | ✅ | 例如 `deepseek-flash`；换模型不记录 = 本轮作废 |
| `startedAt` | ISO8601 | ✅ | 带时区 |
| `wallClockS` | number | ✅ | 该 rollout 墙上时间 |
| `turns` | int | ✅ | 会话 turn 数 |
| `toolCalls` | int | ✅ | 工具调用数（从 session 统计） |
| `budgetHit` | bool | ✅ | 是否触达任务 JSON 的 budget 上限 |
| `retryOf` | string/null |  | 重试时填前一次 draw 标识；最多 1 次 |
| `graderExit` | int | ✅ | 0=pass，1=fail，2=文件/用法错 |
| `passed` | bool | ✅ | = graderExit==0 |
| `failedChecks` | string[] |  | grader 的 failed 列表（便于归因） |
| `notes` | string |  | 失败归因 / 异常（一句话） |

示例行：

```json
{"roundId":"20261106-0200","harnessId":"baseline-v1-skeleton","evalVersion":"v1","task":"E1","draw":1,"model":"deepseek-flash","startedAt":"2026-11-06T02:10:00+08:00","wallClockS":42.3,"turns":6,"toolCalls":11,"budgetHit":false,"retryOf":null,"graderExit":0,"passed":true,"failedChecks":[],"notes":""}
```

一轮汇总校验（跑完必须成立）：

- `count(ledger) == 18`（6 任务 × 3 draw，重试另加行）；
- 所有行 `model` 一致且等于 baseline 声明；
- `sum(wallClockS) <= 5760`；超了 → `budgetHit` 必须是 true 并且本轮不算提升证据；
- 每行都有对应的 `grade.json`。

---

## 4. 判定口径（与 `eval/v1/index.json#scoring` 一致）

- 单任务单 draw：该任务全部 checks 通过 → pass。
- `taskPassRate` = 通过 draw 数 / 3。
- `roundScore` = 6 个 taskPassRate 的均值（0–1）。
- **采用候选 harness 的条件**：
  1. 任一任务 taskPassRate 不低于 baseline；
  2. 至少 2 个任务较 baseline 提升 ≥ 1 个 draw；
  3. ledger 闭合（无超预算、无换模型不记录、无未登记重试）。
- **单次 6/6 不算证明**；看 k=3 的中位数与最差项。
- 连续 2 轮无提升或预算耗尽 → 冻结当前 harness，在本文件追加「未采纳原因」。

### baseline 记录表（待跑后回填）

| 任务 | k=3 结果 | taskPassRate | 最常失败 checks | 备注 |
|---|---|---|---|---|
| E1 | 未跑 | — | — | — |
| E2 | 未跑 | — | — | — |
| E3 | 未跑 | — | — | — |
| E4 | 未跑 | — | — | — |
| E5 | 未跑 | — | — | — |
| E6 | 未跑 | — | — | — |
| **roundScore** | — | — | — | — |

---

## 5. 跑完后要写什么

1. `runs/<stamp>/` 保留：`draw-*/grade.json`、`ledger.jsonl`、各任务失败输出的**原文件**（不要改，便于复查）。
2. 本文件追加一节「实测结果」：命令、数字、失败归因、是否触达预算。
3. `experience.md` 追加 1–3 条 cue（一条只写一个可迁移规律，必须带这次 run 的证据）。
4. 如果结果是「没有提升」：也写进本文件 `## 未采纳原因`，不许只留成功记录。

---

## 6. 未验证 / 已知缺口

| # | 项 | 影响 |
|---|---|---|
| 1 | 未真跑模型 | 所有 grader 只在正/反例上自测过，真实模型的失败分布未知 |
| 2 | rollout 执行器未接 | v1 用手工 DSH 会话；S3 可复用 `harness2-dsh/h2d` 的 `dsh.py`/`adapter.py`（需 `dsh ≥ 0.1.5-rc.2`，本机 0.2.1-rc.5 满足） |
| 3 | E5 只回放 6 个确定性码 | 语义级质检（爽点无围观、揭秘无后果等）不在 v1；S3 用 E5 v2 + 模型评审补齐 |
| 4 | k=3 的统计力有限 | 3 次抽样只能看中位数/最差项，不能声称效应量 |
| 5 | 规则包冲突 RPC-1…RPC-5 | 见 `manifest.yaml#knownRulePackConflicts`，需 Lead 裁定唯一权威 |
