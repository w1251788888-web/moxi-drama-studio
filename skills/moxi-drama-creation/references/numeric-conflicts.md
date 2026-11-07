# 数值口径裁决表

> **项目根（v2）**：规则包在 `<仓库>/rules/v2/`，脚本在 `<仓库>/scripts/`；项目数据由 moxi 工具管理（`~/Documents/Moxi/projects/<projectId>/`），**不要直接写项目数据文件**。


## 目录

- 字数区间
- 场数上限
- 爽感密度
- 付费墙节点
- ⚠️ 85 与 75 双轨
- 时长档换算

---

## 字数区间

项目内**四套口径并存**，此前 Skill 只采纳了第一套，是错的。

| 口径 | 出处 | 90 秒值 |
|---|---|---|
| ① 1000-1550（中心 1200） | `duration_char_count.md:7,18`、`pipeline.toml:120-121`、`07_quality_check.md:103`、`reviewer-quality-score.md:31` | 1000-1550 |
| ② 1150-1250 | `03_beat_sheet.md:87`、`05_script_draft.md:295`（:314 `<1150` 补字、:317 `>1250` 删字） | 1150-1250 |
| ③ 1100-1300 | `core-rules/core/drama-format.md:62`，被 `commercial_viability.md:150,193` 指定为权威 | 1100-1300 |
| ④ 60/120 秒档 | `duration_char_count.md:17-18` vs `commercial_viability.md:150` | 两档对不上 |

**裁决**：

| 范围 | 判定 |
|---|---|
| < 1000 或 > 1550 | **硬失败** |
| 1000-1150 或 1250-1550 | **告警**（生成端要求 1150-1250） |
| 1150-1250 | 通过（写作目标） |

理由：②是**实际写剧本的那一步**的要求，写 1050 字虽然能过验收带，但生成端会判"必须补字"；写 1500 字生成端会要求删到 1250。①是验收宽容带，②③都落在①内，取①为硬边界、②为目标区间可同时满足。

## 场数上限

| 出处 | 漫剧 | 真人 |
|---|---|---|
| `reviewer-quality-score.md:157` | ≤ 12 | ≤ 8 |
| `04_scene_list.md:100,103,104` | **严格 5-7 场，最优 6 场；<5 或 >7 判废** | ≤3 分钟 4-6 场；3-5 分钟 6-9 场 |
| `05_script_draft.md:309-311` | **严格 5-7 场，禁止 8 场以上** | — |

**裁决**：

- 漫剧：**5-7 场**（硬失败）。≤12 的口径会放过 8-12 场，而这正被生成端明令判废。
- 真人 3-5 分钟：**6-8 场**（硬失败），取"6-9"与"≤8"的交集。
- 真人 ≤3 分钟：**4-6 场**。

## 爽感密度

四套数值：

| 出处 | 要求 |
|---|---|
| `reviewer-quality-score.md:39` | 漫剧 ≥2；真人 3 分钟 ≥2；5 分钟 ≥3 |
| `reviewer-quality-score.md:89/99/159`、`commercial_viability.md:132` | 付费墙节点前后 **4-5 个/集** |
| `pipeline.toml:148` `bridge_density = 2` | 节点 A-B 过渡期最低 2 |
| `long_series.md:14-17` 分段表 | 蓄势 1 / 爬升 2 / 风暴 3 / 高潮 4+ |

冲突点：`long_series` 把付费墙 A 放在爬升段（15%-45%），而爬升段密度是 **2**，与"节点前后 4-5"直接矛盾一个数量级。

**裁决**：

- 基础密度：漫剧 ≥2；真人 3 分钟 ≥2、5 分钟 ≥3
- 付费墙节点前后 2 集：**4-5 个/集**（商业硬指标优先于分段表）
- 节点 A-B 过渡段：≥2 为下限
- 分段表仅作趋势参考，遇到付费墙要求时让位

术语统一为**爽感密度**（`commercial_viability.md` 里的"情绪密度"是同一概念的别称）。

## 付费墙节点

- `pipeline.toml:145-147`：`node_a = [8,12]`、`node_b = [26,30]`，注释写明**不随集数变化**；`node_b_short_series_ratio = 0.8` 仅在**集数 < 30** 时启用
- `reviewer-quality-score.md:99`、`commercial_viability.md:132`：节点 A ≈ 30%、节点 B ≈ 80%
- `core-rules/long_series.md:28,36`（被 `commercial_viability.md:132` 指为权威）：A = `round(episode_count × 0.3)` ±1；B = `round(episode_count × 0.8)`
- `commercial_viability.md:191`：首次付费钩子在第 **6-10** 集
- `long_series.md:127`：付费墙 A 区间为第 **4-8** 集

**30 集验算**：节点 A 30% = 第 9 集 ∈ [8,12] ✅；节点 B 80% = **第 24 集 ∉ [26,30]** ❌ 差 2-6 集。60 集时差距更大（节点 A 差 6-10 集）。

**裁决**：

- **以比例法为准**：A = `round(episode_count × 0.3)` ±1，B = `round(episode_count × 0.8)`
- 具体集号以 `init_check_result.paywall_node_a/b` 为准（`reviewer-quality-score.md:99` 自己也是这么写的）
- pipeline 的固定区间仅对 30 集左右的项目近似成立，长剧会系统性偏移
- 首次付费钩子：取 6-10 与 4-8 的交集 → **第 6-8 集**

---

## ⚠️ 85 与 75 双轨

这是**最严重的未对齐项**，此前完全遗漏。同一个 0-100 量纲，主链路有两条判定路径用了不同通过线：

| 路径 | 阈值 | 出处 | 状态 |
|---|---|---|---|
| `quality_check` 步骤（集级，LLM 自评） | benchmark ≥ **75**、continuity ≥ **70** | `07_quality_check.md:71` | prompt 文本 |
| scene 生成深审（场景级，代码执行） | benchmark ≥ **85**、continuity ≥ **85** | `short_drama_deep_audit.py:100,122`（硬编码） | **活的** |
| fallback 分支 | `score >= 85` | `short_drama_benchmark_assessment.py:274,306` | 活的 |
| seam 连续性 | `score >= 85` | `short_drama_seam_continuity.py:159` | 活的 |
| deep_audit 自带 prompt | "85 分以上才算通过" | `short_drama_deep_audit.py:201` | 活的 |

另有 `human_projection_passed = calibrated >= 70`（`deep_audit.py:95,117`）——**只写字段，不参与放行**。

**裁决**：

- **Skill 与集级质检用 75/70**。理由：这个值由 75 个（模型, 人评）配对标定的，有 ground truth；且 `07_quality_check.md:71` 明确解释了"模型历史均值 65 / 人评 49"的由来。
- **85 属主链路未对齐项**。它服务于场景级深审，且配合 `benchmark_caps`（硬伤封顶 70-80，见 `short_drama_benchmark_assessment.py:242-268`）使用——逻辑是"有硬伤 → 封顶到 70-80 → 必然 <85 → 不通过"，所以 85 实际是"无硬伤"的标志，而非独立的质量线。
- **回灌主链路时必须决策**：要么把 deep_audit 的 85 降到 75/70 对齐集级，要么显式声明"场景级 85 / 集级 75"是两个不同层级的标准并存。二者不能继续默不对齐。

注意：`scoring_service.py:187` 与 `material_library_service.py:19` 的 `>= 75.0` 是**素材入库阈值**（`APPROVAL_THRESHOLD`），与剧本质量无关，不要混为一谈。

## 时长档换算

| 时长 | `duration_char_count.md` | `commercial_viability.md:150` |
|---|---|---|
| 60 秒 | 670-1030 | 450-550 |
| 90 秒 | 1000-1550 | — |
| 120 秒 | 1330-2070 | 1100-1300 |

两档都对不上。**裁决**：若项目未显式声明时长档，默认按 90 秒 / 1000-1550 处理；用户显式配置 `word_count_min/max/target` 时以用户值为最高优先级（`07_quality_check.md:103`）。
