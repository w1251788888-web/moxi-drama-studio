---
name: moxi-drama-creation
description: 创作与质检短剧剧本，覆盖概念、角色、分集大纲、节拍表、分场表、剧本初稿、放行判定与合规审查。当用户要写短剧剧本、生成分集大纲、质检已有剧本或判断某集能否放行时使用。不用于长篇小说、非短剧体裁或纯格式转换。
agent_created: true
---

# 墨戏生花 · 短剧创作

**分工原则**：智能体负责"写"，本 Skill 负责"判"。写作不代劳，判定口径必须唯一。

> **资产根（v2）**：本 Skill 位于 `<仓库>/skills/moxi-drama-creation/`；规则包在 `<仓库>/rules/v2/`；确定性脚本在 `<仓库>/scripts/`。
> 本 Skill 目录内的相对路径（`references/xxx.md`、`scripts/check_episode.py`）保持相对；**仓库级资源一律用绝对路径或经 moxi 工具**。
> 作者本地可能保留旧系统只读参考（`legacy-data/`、`legacy-code/`），它们**不随本仓库分发**，也不是运行期依赖。

## v2 运行方式（先读这段）

本版本运行在「DSH 底座 + 无限画布」上。**项目数据只能通过 moxi 工具读写**，不要直接改工作区文件。

| 你要做的事 | 用哪个工具 |
|---|---|
| 看有哪些项目 | `moxi_project_list` |
| 新建项目（铺 9 类节点骨架） | `moxi_project_create` |
| 打开项目、看节点 id/状态 | `moxi_project_open` |
| 建节点（设定集/资产/节拍/分场/场次/质检/合规/导出） | `moxi_node_create` |
| 写/改节点正文（Markdown） | `moxi_node_write` |
| 状态迁移（draft→generating→review→approved/rejected） | `moxi_node_transition` |
| 连线（dependency 参与阻塞传播） | `moxi_edge_create` |
| 跑确定性检查（场景头/字数/场次/重复/合规粗筛） | `moxi_check_run` |
| 导出 md/txt/docx | `moxi_export` |

**节点 ↔ 创作步骤映射**：概念→`settings`；角色/场景/道具→`asset`；分集节拍→`beat_sheet`；
分场表→`scene_list`；剧本场次→`script_scene`；质检→`quality`；合规→`compliance`；分镜/成片/导出→`delivery`。

**硬规则**：
1. 先 `moxi_project_open` 拿节点 id，再写；不要凭标题猜 id。
2. 写作前先看 `rules/v2/steps/*.md` 与 `rules/v2/core-rules/` 的对应规则（路由见 `references/workflow.md`）。
3. 判定口径以本 Skill 的 `references/quality-gate.md` + `scripts/check_episode.py` 为准；**模型只给分与证据，verdict 由脚本算**。
4. 状态机不可跳步：不合法的迁移会报 `E_TRANSITION` 并给出允许集合；按提示重试。
5. 质检/合规 `rejected` 会自动阻塞下游节点；下游被阻塞时不要硬写，先修上游。

## 放行判定（最常用，先记这个）

一集放行必须**同时**满足，任一不满足即打回：

1. `benchmark_total ≥ 75`
2. `continuity_total ≥ 70`
3. `hard_reject_codes` 为空
4. `hook_diversity_pass = true`

宁可多打回，不放行。判定**锁定模型原始分**（不要先减偏差再比 75——那会过度打回）。

模型只输出分数与证据，**不输出 verdict**；verdict 由脚本按上述阈值算出。

## 使用边界

**用于**：写短剧剧本、生成分集大纲、质检已有剧本、判断某集能否放行、处理用户对字数/结构/内容的实时修改。

**不用于**：长篇小说、非短剧体裁、纯格式转换、影视分镜生成。

## 工作流

- 读 `references/workflow.md` 获取三套流程（原创 / 小说改编 / 长剧）、步骤清单、规则路由表、角色与模型分工。

流程选择：`project_type` 决定用 `ordered_original`、`ordered_novel_adaptation` 还是 `ordered_long_series`。`market_check` 是唯一硬门控（≤1/4 通过即阻断）。

## 质量门

- 读 `references/quality-gate.md` 获取完整口径：打分量纲、H1-H11 唯一定义、每集必填字段、四套冲突的裁决依据。

要点：

- 模型按所见尺度正常打分，**不要主动下调**（系统后处理会统一减偏，主动下调会被叠加扣分）
- 每个分数必须附**具体场次引文**，否则该维度判无效
- 集末钩子子标签以 `<仓库>/rules/v2/core-rules/core/hook-patterns.md` 附录 v1.1 为准；`reviewer-quality-score.md:150` 那套同名不同义的**已作废**
- `verdict` 输出 `pass` 或 `reject`，**不要输出 `fail`**（会导致打回原因无法沉淀）

⚠️ 已知：模型在 `emotion`（r=0.09）、`density`（r=0.207）上与人评几乎不相关。这两项尤其要用脚本计数辅助校验，别信直觉分。

## 检查与反馈循环

- 读 `references/checks.md` 获取全部确定性检查项与可复用的现成纯函数。

执行循环：`写 → 跑检查 → 修 → 再跑`，直到全部硬失败项清零。

**脚本已随 Skill 提供**，纯标准库零依赖，直接跑：

```bash
python3 <skill>/scripts/check_episode.py \
  --file "/abs/细纲.md" \
  --protagonists "陆时,苏芮" \
  --antagonist "姜蔓" \
  --exempt-eps 5
```

退出码 1 = 有硬失败，必须修完再提交。告警不阻断但要看。

必配参数只有两个：`--file` 和 `--protagonists`。**不传 `--protagonists` 就等于放弃"命题主语在场率"这一项检查——而那正是最致命的一项，别省。**

文档格式不同时用 `--ep-pattern` / `--body-pattern` 改正则；字数区间用 `--words-min` / `--words-max`（集纲默认 150-250，剧本用 950-1000）。

项目内可复用的现成纯函数清单见 `checks.md` 末尾。

跨集必跑漂移检查：角色规范名映射、已锁事实一致性、伏笔台账积压。这三项是纯确定性的，不需要模型参与。

## 用户实时覆盖

- 读 `references/canon-overrides.md` 获取优先级栈、落盘结构与冲突检测矩阵。

**作用域判定不允许猜**，判定不了就反问：

| scope | 含义 |
|---|---|
| `episode` | 只管这一集 |
| `project` | 持续生效 |
| `canon_amend` | 正史修订，波及后续所有集 |

最危险的失败模式是把后两种误判成 `episode`。触碰 `no_change` 或已锁事实的要求**一律拒绝**，不接受"先写了再说"。

## 硬约束（不可协商）

- 平台合规与禁词不接受任何覆盖，包括用户明确要求
- 每集必须输出 `state_card_delta`、`cliffhanger_concrete`、`used_beats`、`hook_diversity`，缺一判废
- AI 产出先落 `candidates/`，用户接受后才成为正史
- **没有 concept 不许写集纲**（logline 与 milestones 必须先存在）。跳过 concept 直接排集，产出必然无主线——这是事故，不是风格选择
- **剧名里的主语必须一直在画面里**。写集纲前先从剧名与 logline 提取命题主语（注意：不是主角表里的人，更不是反派），每集检查在场率

## ⚠️ 字段填满 ≠ 合规

最难发现的一类失败：**必填字段全部填了、单集检查全绿、钩子脚本通过，但剧已经没了。**

判例：《我的父母没素质》1-10 集，主角父亲连续 5 集零出场、剧名的主语被反派线挤空，而当时 11 个字段一个不缺。

所以除了单集检查，**必须跑 `checks.md` 的「跨集结构性检查」**——那六项看的全是"这一集里，剧名的主语还在不在"。

**判定顺序不能反**：先问"这一集要证明什么"（命题）→ 再问"需要谁在场"（人物）→ 最后才填字段。**字段填不出来，说明这一集不该存在**，不要为了填满格子去编对手、编目标。

## 导航

| 需要 | 读这个文件 |
|---|---|
| 流程、步骤、规则路由 | `references/workflow.md` |
| 评分量纲、H1-H11、冲突裁决 | `references/quality-gate.md` |
| 字数/场数/密度/付费墙/85双轨的裁决值 | `references/numeric-conflicts.md` |
| 确定性检查项、可复用函数 | `references/checks.md` |
| 检查脚本（已实现，可直接跑） | `scripts/check_episode.py` |
| 覆盖作用域、正史、候选优先 | `references/canon-overrides.md` |
| 全部已知架构风险、死代码、活阈值 | `references/known-issues.md` |
| 回灌主链路的分步方案 | `references/mainline-backfill.md` |
| 评估场景与通过标准 | `evals/scenarios.md` |

规则资产按需读取本机副本中的以下目录（原项目中无关内容未收录）：

- `<仓库>/rules/v2/`（原项目中与规则包同级的第三方 Dify 运行目录未收录）
- `agent-definitions/` 中 4 个软件开发角色文件（`executor-backend/frontend/devops/researcher.md`）不属于创作角色

**写作前建议参考**（作者本地留存，未随本仓库分发）：

- `legacy-data/benchmark/human_scoring/executor_negative_examples.md`（16 例真实失败案例）
- `legacy-data/benchmark/human_scoring/executor_high_score_openings.md`（高分开篇范本，只学结构与节奏，禁止照搬人物名与台词）
