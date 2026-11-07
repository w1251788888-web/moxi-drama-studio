# 质量门权威口径

> **项目根（v2）**：规则包在 `<仓库>/rules/v2/`，脚本在 `<仓库>/scripts/`；项目数据由 moxi 工具管理（`~/Documents/Moxi/projects/<projectId>/`），**不要直接写项目数据文件**。


## 目录

- 放行判定（唯一标准）
- 人评对齐分（打分量纲）
- 七维评分（诊断用）
- 集末钩子子标签（唯一定义）
- 钩子多样性窗口
- verdict 取值域
- 每集必填字段
- ⚠️ 校准系数的真相
- 冲突溯源
- 已知架构风险

---

## 放行判定（唯一标准）

一集放行必须**同时**满足：

1. `benchmark_total ≥ 75`（= hook + density + emotion）
2. `continuity_total ≥ 70`（= char_consist + seed_payoff + fact_consist）
3. `hard_reject_codes` 为空
4. `hook_diversity_pass = true`

任一不满足即打回。宁可多打回，不放行。

⚠️ 主链路 scene 深审另有 **85/85** 硬编码通过线，与本口径不对齐。完整裁决见 `numeric-conflicts.md` 的"85 与 75 双轨"。**Skill 与集级质检一律用 75/70。**

## 人评对齐分（打分量纲）

| 字段 | 范围 | 含义 |
|---|---|---|
| `hook` | 0-40 | 开场 100 字内能否抓住人 |
| `density` | 0-30 | 每 200-300 字至少 1 个新情节点 |
| `emotion` | 0-30 | ≥1 个情绪临界点（哭/怒/反转/告白） |
| `benchmark_total` | 0-100 | 前三项之和 |
| `char_consist` | 0-40 | 人设一致 |
| `seed_payoff` | 0-30 | 伏笔与回收 |
| `fact_consist` | 0-30 | 事实无矛盾 |
| `continuity_total` | 0-100 | 后三项之和 |
| `hard_reject_codes` | 字符串 | ①重复 ②违锁 ③死人复活 ④动机崩 ⑤无推进，可叠加 |

**按看到的尺度正常打分，不要主动下调。** 系统后处理按实测偏差统一校正（benchmark −16.5 / continuity −13.6）。主动下调会被叠加扣分。

校准准则：

- 除非真接近高分锚点，否则 `benchmark` 不给 >80
- 出现"整集无推进 / 重复前集 / 动机崩塌"，`benchmark` 不高于 50，并填 `hard_reject_codes`
- 理由必须可执行（写"伏笔太多后续难解决"，不要写"建议优化情节"）

## 七维评分（诊断用，不用于放行）

节奏 / 爽感密度 / 对白 / 格式 / 连贯性 / 商业性 / 原著保真度（仅改编），每维 0-10，原创满分 60、改编满分 70。

定位是**定位问题、生成修改指令**，不是卡放行。原文档"总分 < 42 打回"**已作废**。

## 集末钩子子标签（唯一定义）

以 `core-rules/core/hook-patterns.md` 附录 v1.1 为准：

| 标签 | 名称 | 归属主类 |
|---|---|---|
| H1 | 预示冲突 | 升级型 |
| H2 | 秘密 | 悬念型 |
| H3 | 重要决定或誓言 | 升级型 |
| H4 | 宣布震惊事件 | 代价型 |
| H5 | 激烈情绪 | 关系型 |
| H6 | 颠覆性突转 | 反转型 |
| H7 | 新想法 | 升级型 |
| H8 | 未回答的问题 | 悬念型 |
| H9 | 神秘对白 | 悬念型 |
| H10 | 预言/异象 | 悬念型 |
| H11 | 转折点 | 代价型 |

`reviewer-quality-score.md:150` 处有一套**同名不同义**的 H1-H11（危机/信息揭穿/身份反转…），**已作废**。

选型偏好：漫剧优先 H1、H4、H6、H11；真人优先 H2、H5、H8、H9；H3、H7 慎用于女频情感线；H10 限古装/玄幻/悬疑。

## 钩子多样性窗口

- 检测窗口：最近 5 集
- 与最近 2 集完全相同 → `hook_diversity_pass = false`，强制打回
- 5 集滑窗内同一子标签 ≥3 次 → 同样 `false`
- 打回时换用近 5 集未使用过的子标签，优先同主类的其他子标签

## verdict 取值域

统一输出 **`"pass"` 或 `"reject"`**，不要输出 `"fail"`。

下游只判 `verdict == "pass"`。但"打回原因沉淀"的触发条件写的是 `verdict == "reject"`——输出 `fail` 会导致打回原因无法进入历史反馈池。

## 每集必填字段

缺失任一字段，下集承接断裂，整轮判废：

- `state_card_delta`：relationship / info_chain / power_shift / open_promise / no_change
- `cliffhanger_concrete`：freeze_scene / freeze_characters / freeze_prop / freeze_action（可拍画面，禁止"真相未明""下集见分晓"）
- `used_beats`：≥2 项，每项含场景/动作/目标/类型（下集禁用清单）
- `hook_diversity`：hook_subtag / hook_recent_window / hook_diversity_pass

### ⚠️ 字段填满 ≠ 合规

一版集纲可以做到四个必填字段全填、单集检查全绿、钩子脚本通过，**但剧已经没了**。

判例：《我的父母没素质》1-10 集 —— 主角父亲连续 5 集零出场、剧名的主语被反派线挤空、`subgoal_for_protagonist` 填的是状态描述而非目标，而当时 11 个字段一个不缺。

补两条字段级口径：

**`subgoal_for_protagonist` 必须是"目标"，不是"状态描述"。**

| 反例（判废） | 正例 |
|---|---|
| 只想把黑板擦完 | 要在合影里保住爸妈的位置 |
| 想把话问明白 | 要问出那个阿姨为什么一直看她 |
| 希望有人来接她 | 要自己把签到表签完带回家 |

判定标准：主角**发起**的、有对象的、可失败的动作。命中 `只想 / 只是 / 被 / 希望有人 / 想被 / 想弄明白` 等被动标记的一律转人工确认。

**`subgoal_for_antagonist` 允许填"无"。**

现实主义 / 家庭温情类项目以 `sample_track_d_realistic_family.md` 为准，**不要为了填满这一格去编一个对手**——那会把矛盾外置、把主角挤成受害者。详见 `known-issues.md` 冲突 1 与冲突 7。

---

## ⚠️ 校准系数的真相

`legacy-data/benchmark/human_scoring/calibration_coefficients.json`（75 个配对样本）实测：

| 维度 | 人评均值 | 模型均值 | 偏差 | **相关性 r** |
|---|---|---|---|---|
| hook | 19.13 | 26.05 | 6.92 | **0.375** |
| density | 15.67 | 19.91 | 4.24 | **0.207** |
| emotion | 14.27 | 19.63 | 5.36 | **0.09** |
| benchmark_total | 49.07 | 65.59 | 16.52 | **0.285** |
| continuity_total | 61.13 | 74.73 | 13.6 | **0.125** |

**样本数口径有四个，别混用**：104（总集数）/ 86（锚点声明数 27+10+49）/ 82（`reviewer-quality-score.md:329,347,353` 与 `step_routes.py:1043` 所写）/ **75（`calibration_coefficients.json` 实际样本数）**。引用以 75 为准。

另注：`calibration_anchors.md` 声明"27 高分 + 10 中分 + 49 低分"，但正文实际只收录 **16 条**（6/4/6）。做评估时按 16 条取用。

**这解释了为什么质量门必须靠证据而非直觉。** `emotion` 相关性 0.09、`density` 0.207——模型在这两个维度上的判断与人评**几乎不相关**。校准只能做均值平移，无法修复排序错误：模型给 A 集 emotion 打 25、B 集打 15，人评眼里可能正好相反。

因此：

- 不要信任单点分数的绝对值，要看它是否附带可核查的证据
- `emotion` 与 `density` 的分数**必须附具体场次引文**，否则视为无效
- 想真正收紧这两项，只能靠确定性统计（如：情绪临界点出现次数、每 200-300 字新情节点计数），而不是让模型再打一次分

这也意味着七维评分里"爽感密度""节奏"两项，用脚本统计会比模型打分更可靠。

## 冲突溯源

**放行阈值三套**
- 42/60、49/70（`reviewer-quality-score.md`，七维制）— 已作废
- `benchmark≥75 且 continuity≥70`（`step-definitions/07_quality_check.md`）— **采纳**
- `quality_gate_min_score=35`（`pipeline.toml`，满分 50）— 从未被代码消费，死配置

裁决依据：后者写在 user prompt 且明确"本轮起按上述硬阈值判定"，属后加的严判规则。

**H1-H11 两套语义**
- `core-rules/core/hook-patterns.md` 附录 v1.1 — **采纳**
- `reviewer-quality-score.md:150` 自创一套 — 已作废

决定性证据：`07_quality_check.md:85` 明确要求"禁止在此复述定义"（指向附录），reviewer 复述即违反该禁令。

**多样性窗口三套**
- 附录：前 3 集，重复扣 1 分
- reviewer：近 2 集相同→不通过（`:174` 明写强制打回）；5 集内 ≥3 次→高风险（**仅**此项不强制打回）
- 07_quality_check：近 2 集相同→false；5 集滑窗 ≥3 次→false — **采纳**

**verdict 取值域**：reject vs fail — 统一为 `pass / reject`

## 已知架构风险（未裁决，需上游修复）

1. **质量门是纯模型自裁的软门**。代码在 `short_drama_quality_helpers.py:68` 读取 verdict，`:92` 只做 `verdict == "pass"` 字符串判断，从不自行计算任何分数。模型判宽，门就形同虚设。最硬的证据是 `short_drama_writing.py:182-183` 定义了 `QUALITY_PASS_MIN_TOTAL_ORIGINAL = 42` / `QUALITY_PASS_MIN_TOTAL_NOVEL = 49`，**全仓库零引用**——文档写了通过线，代码根本没实现。
2. **校准不参与放行**。`apply_calibration`（`step_routes.py:1046`）在 verdict 产出**之后**改写 `human_aligned_scores`，verdict 不受影响，校准分仅供审计。
3. **打回反馈链路疑似断裂**。写入 `metadata["issue_feedback"]["feedback_history"]`（列表），而注入下集 prompt 的 `${issue_feedback_summary}` 读 `issue_feedback["summary"]`（字符串，由 `issue_feedback_service.py:325` 从 `stable_records` 独立生成），非同一路径。
4. **`pipeline.toml` 大量字段是死声明**。`gate_field`、`inject_knowledge`、`[state]`、`[batch]`、`[premium_mode]`、`[comic_mode]` 零代码消费，真值硬编码在 `step_routes.py:809-889`。
5. **坏引用**：`reviewer-quality-score.md:156` 指向 `core/drama-format.md`，该文件不存在，真实路径 `core-rules/core/drama-format.md`。
6. **样本数不一致**：文件称"82 集人评配对"，`calibration_coefficients.json` 实际为 75 个样本。
7. **85 与 75 双轨**：主链路 scene 深审用 85/85 硬编码，集级质检用 75/70，同一量纲两套通过线。详见 `numeric-conflicts.md`。

完整风险清单（含软门的直接物证、autofix 期间门被关闭、假警报源等）见 `known-issues.md`。
