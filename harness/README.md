# 墨戏生花 Harness² · v1（S2.4 / Track H）

> **结论先行**：Harness 框架已就绪——6 个合成 eval 任务（E1–E6）+ 74 项确定性检查 + 正/反例自测全绿 + 验收项目隔离审计通过。
> **baseline 尚未跑模型**（硬边界：不调用任何付费模型），`runs/v1-baseline.md` 给了「怎么跑一轮」的命令、ledger 模板和判定口径。

---

## 1. 这是什么、不是什么

**借方法，不借部署。** Harness²（Google Research，[repo](https://github.com/google-research/harness2)）的核心主张是：不改模型权重，只把 system prompt / 工具 / 记忆 / 技能 / 编排当作可编辑 surface，用 `propose → probe → compose` 循环在任务集上做 rollout、确定性评分、选择，并把经验写回经验库。

本项目：

| 借 | 不借 |
|---|---|
| eval 任务集 + 确定性 grader + k=3 抽样 | 不训练权重、不微调 |
| 预算 ledger、防作弊口径 | 不跑 Vertex / Docker / gcloud ADC |
| 经验库（一条一个可迁移 cue） | 不重写 `h2d` 核心；v1 不做 improver session（P=0） |
| `dsh --patch --dump-config` 作为免费门禁 | 不把 eval 题集和验收项目混用 |

**只搭框架，不烧额度。** 本任务交付的是 eval 题库、grader、surface 清单和运行手册；真正 rollout 时由 S3 接 DSH 会话执行。

## 2. 与 S0–S5 的关系

| 阶段 | 关系 |
|---|---|
| S0 立基线 | eval 的「基准」概念来自 S0；内部基线审查记录是 manifest 的事实来源 |
| S1 定架构 | eval 的字段口径来自 `docs/设计/数据契约-v1.md`；c1–c8 映射来自 ADR-001 |
| **S2 建骨架** | **本任务**：eval v1 + grader + manifest + baseline 手册 |
| S3 画布/内核 | 把 grader 口径接进 `moxi-core`（`lib/checks.js` 对齐，见 §8 RPC-4）；用 eval 调画布节点的 agent 交互提示 |
| S4 后台 | 用 eval 的 ledger 字段做「模型与用量」页的数据口径 |
| S5 冻结 | 冻结 evalVersion、归档 runs、把采纳/未采纳写进 `experience.md` |

## 3. 目录结构

```
moxi/harness/
├── README.md                  # 本文件
├── manifest.yaml              # c1–c8 surface 清单：当前值路径 + 可编辑性 + 变更门
├── experience.md              # 经验库骨架（cue 格式 + 8 条 seed）
├── eval/v1/
│   ├── index.json             # 版本清单 / 评分口径 / 隔离声明 / 规则来源
│   ├── E1_project_init.json   # 6 个任务：prompt + expected + grader + selftest + budget
│   ├── E2_concept_hard_gate.json
│   ├── E3_beat_sheet.json
│   ├── E4_scene_script.json
│   ├── E5_quality_replay.json
│   ├── E6_continuity_repair.json
│   └── fixtures/              # 15 份输入夹具（合成题材，无验收项目内容）
├── graders/
│   ├── grade.py               # CLI：--task/--all/--selftest/--audit-isolation
│   ├── graders.py             # 6 个 grader 函数 + E5 的 v1 检查器
│   ├── checks.py              # 纯标准库共享工具（净字数/场次解析/剧本行解析）
│   └── tests/                 # 6 任务 × 正例/反例 = 12 份样例
└── runs/
    ├── v1-baseline.md         # 怎么跑一轮 + ledger 模板 + 判定口径
    └── ledger-template.jsonl  # 每 draw 一行的预算台账样板
```

## 4. 六个 eval 任务（与验收项目隔离）

合成题材：**《外婆的民宿谁来接》**（海岛民宿继承，家庭 + 女性成长，女频，12 集 × 90 秒，真人短剧）。

| id | 任务 | 关键判定 | checks |
|---|---|---|---:|
| `E1` | 项目初始化 | `project.json` 15 个字段齐全/值域/无未定义字段；wordRange 按 D-06 公式 = 1000–1550 | 17 |
| `E2` | 概念硬门 | logline（主角+目标+阻碍+代价）、seasonAnchors 8–12 条覆盖首尾、**剧名主语判定** | 11 |
| `E3` | 分集节拍 | 12 集字段完整、6–10 节拍、每集 2 个爽感点（女频一级）、集末钩子具体化、钩子多样性、callbacks 只向后、双付费墙、情绪曲线、概念锚点逐集对齐 | 17 |
| `E4` | 单场剧本 | 1 场、bracket 场标、人物行、台词 ≥5、△ 第三人称无心理描写、OS 格式、净字数 190–230 | 9 |
| `E5` | 质检回放 | 违规样例必须 `verdict=fail`，6 个确定性检查码全命中、证据逐字、误报 ≤1 | 9 |
| `E6` | 连续性 | 按 canon 重写第 3 集，5 条登记矛盾全部修掉、冲突数必须 0、格式/字数达标 | 11 |

**隔离口径**：验收项目《我的父母没素质》只出现在 manifest / index / 任务 `isolation` 元数据里（作为声明），题面、夹具、正反例全文不出现；`grade.py --audit-isolation` 机器校验（扫描 33 份，禁用 token = `我的父母没素质` / `父母没素质`，要求合成题材 token = `海岛民宿继承`）。

## 5. 怎么跑一轮

前置：Python 3（纯标准库，无第三方依赖）；真正 rollout 时需要 `dsh`（本机实测 0.2.1-rc.5）。

```bash
cd moxi

# 0) 一轮目录：k=3 → 3 个 draw-set，每个 draw-set 下 E1–E6
STAMP=$(date +%Y%m%d-%H%M)
RUN=harness/runs/$STAMP
mkdir -p "$RUN/draw-1" "$RUN/draw-2" "$RUN/draw-3"

# 1) 给每个任务铺夹具 + 输出目录（不调用模型）
python3 - "$RUN" <<'PY'
import json, shutil, sys
from pathlib import Path
root = Path("harness"); run = Path(sys.argv[1])
for f in sorted((root / "eval/v1").glob("E*_*.json")):
    t = json.loads(f.read_text(encoding="utf-8"))
    for d in ("draw-1", "draw-2", "draw-3"):
        ws = run / d / t["id"]
        ws.mkdir(parents=True, exist_ok=True)
        for spec in t["input"]["workspaceFiles"]:
            shutil.copy(root / spec["from"], ws / spec["to"])
print("workspace ready:", run)
PY

# 2) 每个设备起一个 DSH 会话：工作目录 = $RUN/draw-N/<E>，
#    把任务 JSON 的 input.prompt 原样下发；模型固定（baseline = deepseek-flash），
#    Agent 落盘 output.path（E1→project.json，…，E6→episode_03_repaired.md）。
#    ⚠️ 每个 draw 独立新会话，禁止复用上下文（否则不是独立抽样）。

# 3) 评分（离线、纯标准库；不跑模型）
for d in draw-1 draw-2 draw-3; do
  python3 harness/graders/grade.py --all --run-dir "$RUN/$d" --json | tee "$RUN/$d/grade.json"
done

# 4) 每个 draw 每个任务写一行 ledger（字段见 runs/ledger-template.jsonl）
# 5) 汇总：taskPassRate = 通过 draw 数 / 3；roundScore = 6 个 taskPassRate 的均值
```

**只想验框架（不跑模型）**：

```bash
python3 harness/graders/grade.py --selftest          # 6 任务 × 正/反例 + E5 fixture 口径
python3 harness/graders/grade.py --audit-isolation   # 验收项目隔离审计
# 用正例伪造一轮完整 run-dir 也能跑通 --all：
#   把 graders/tests/<E>/positive/<output> 拷到 /tmp/fake-run/<E>/ 后
python3 harness/graders/grade.py --all --run-dir /tmp/fake-run --json
```

## 6. 评分口径

- **单任务单 draw**：该任务全部 checks 通过 → `ok=true`；`score=通过项/总项` 只用于排序，不用于放行。
- **一轮**：6 任务 × k=3 draws。`taskPassRate = 通过 draw 数 / 3`；`roundScore = 6 个 taskPassRate 的均值`。
- **采用一个候选 harness 的条件**（全部满足）：
  1. 任一任务的 passRate 不低于 baseline；
  2. 至少 2 个任务较 baseline 提升 ≥ 1 个 draw；
  3. 预算 ledger 闭合（无超预算、无换模型不记录）。
- **单次 6/6 不算证明**：看 k=3 的中位数与最差项。
- **冻结**：连续 2 轮无提升或预算耗尽 → 冻结当前 harness，写「未采纳原因」。
- **版本化**：改题面/阈值/样例必须 bump `evalVersion` 并重跑 baseline；`eval/v1` 只追加不改写。

## 7. 预算口径

- **不编造美元成本**：DSH 按订阅计费、不提供按会话金额，ledger 只记 `model / turns / toolCalls / wallClockS / budgetHit`。
- 每个任务 JSON 都带 `budget`（`k / maxTurns / maxToolCalls / maxWallClockSeconds / usd: null`）；
  一轮上限 = 6 任务 × k=3：**192 turns / 600 tool calls / 96 分钟墙上时间**（见 `manifest.yaml#budget`）。
- **防作弊**：
  - baseline 锁死模型；换模型 = 换 baseline，必须全量重跑并在 ledger 记录；
  - 打满预算的 draw 不计入提升证据；
  - 不许在 rollout 期间改 harness surface 或放宽沙箱来「过题」；
  - 题集与验收项目隔离，防止对验收集过拟合。

## 8. Surface 清单（c1–c8）

完整清单见 [manifest.yaml](manifest.yaml)。一句话版本：

| id | Harness² 组件 | v2 落点 | 当前状态 |
|---|---|---|---|
| c1 | system prompt | `~/.dsh/profiles/moxi/*` + `dsh/bundles/*/cordis.patch.yml` | 未迁移（persona 走 shipped 默认） |
| c2 | guardrails | DSH `approval/permission/sandbox-policy` 行 | dev-only（当前 danger-full-access，非目标态） |
| c3 | memory | 项目工作区 `AGENTS.md` + `canon/` + `rules/v2/manifest.json` | 未迁移（S3） |
| c4 | tool guidance | `dsh/bundles/moxi-core` 的 9 个 `moxi_*` 工具描述 + `lib/checks.js` | 部分 live |
| c5 | 模型路由 | `llm-pi-ai` + `agent-default-model`；实测见内部模型链路记录 | live（eval 未跑） |
| c6 | skills | `moxi/skills/moxi-drama-creation/`（空，S3 建） | 未迁移 |
| c7 | scripts | `moxi/scripts/` + `harness/graders/` | live |
| c8 | plugins | `dsh/bundles/moxi-canvas` + `moxi-core` + profile loader 行 | 部分 live |

任何 surface 变更的变更门统一为：**单变量 patch → `dsh --patch --dump-config` 退出码 0 且已知 id 不丢 → 跑相关 eval 回归 → ledger 闭合 → G2/G3 门**。

## 9. 已知缺口 / 待 Lead 裁定

完整表在 `manifest.yaml#knownRulePackConflicts`（RPC-1…RPC-5），摘要：

1. **RPC-1**：数据契约 §2 的 `format` 枚举没有「漫剧」，pipeline `project_type` 有「漫剧-*」。eval 暂用 `真人短剧`。
2. **RPC-2**：付费墙节点两套口径（`00_project_init_check` 用 `round(ep×0.3)` vs `03_beat_sheet` 固定 8–12 集）。E3 采用 `03_beat_sheet`，E1 不含付费墙字段。
3. **RPC-3**：两套钩子分类（5 种钩子公式 vs 5 主类 + H1–H11）。E3 分别校验、不做跨分类映射。
4. **RPC-4**：`moxi-core` 的 C006 阈值 50 字 vs 规则包「单场 <150 判废」。E5 按 150 判；S3 需校准实现。
5. **RPC-5**：「真人短剧无字数硬约束」vs D-06 公式照常折算 1000–1550。eval 按 D-06 显式执行。

另外：`eval/v1` 的 `concept.seasonAnchors.keyword` 与结构化 `callbacks` 是本 eval 为确定性对齐新增的字段，规则包里没有原样定义（规则包的 callbacks 是字符串数组）——S3 做节点 schema 时需吸收。

## 10. 自测证据（本机实测）

```text
$ python3 harness/graders/grade.py --selftest
  E1 positive 期望 PASS 实际 PASS  OK
  E1 negative 期望 FAIL 实际 FAIL  OK
  …（6 任务 × 2 = 12 项全绿）
  E5 fixture detector=[C002,C006,Q_HOOK_ABSTRACT,Q_NAME_VARIANT,Q_OS_FORMAT,Q_SCENE_HEADER_MIXED]
             planted =[C002,C006,Q_HOOK_ABSTRACT,Q_NAME_VARIANT,Q_OS_FORMAT,Q_SCENE_HEADER_MIXED]  OK
自测通过：6 任务 × 正/反例 + E5 fixture 口径一致。   # exit 0

$ python3 harness/graders/grade.py --audit-isolation
扫描对象：33 份（task input + fixtures + 正反例）
通过：eval 题面/夹具/样例未复用《我的父母没素质》的内容。   # exit 0

$ python3 harness/graders/grade.py --all --run-dir /tmp/fake-run
本轮：6/6 任务通过，roundScore=1.0000              # 用 12 份正例伪造的 run-dir，仅验管道
```

- 74 项 checks 全为纯 Python 标准库实现，不联网、不调用模型。
- E5 的 ground truth 由 grader 内的 v1 检查器现算，`--selftest` 会断言「检查器结果 == 任务声明的 plantedCodes」，防止夹具与口径漂移。

## 11. 维护规则

- 改题：必须 bump `evalVersion`（`eval/v2/` 新目录），不得原地改 `eval/v1`。
- 改 grader：必须过 `--selftest`；新增任务必须同时提供正例 + 反例。
- 跑完一轮：ledger 与 grade.json 一起落在 `runs/<stamp>/`，再写一条 `experience.md`（一条只写一个可迁移 cue）。
- 任何「这次没提升」的结论也要落盘（`runs/` 里写停用原因），不许只留成功记录。
