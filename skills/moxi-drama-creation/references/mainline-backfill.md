# 主链路回灌方案

> **项目根（v2）**：规则包在 `<仓库>/rules/v2/`，脚本在 `<仓库>/scripts/`；项目数据由 moxi 工具管理（`~/Documents/Moxi/projects/<projectId>/`），**不要直接写项目数据文件**。


Skill 层已闭环的部分不需要动主链路。本方案只处理**必须在主链路修**的问题。

## 前置原则

1. **只加不改**：每步先新增一个字段/分支，**不删除、不替换**原有逻辑。观察期过后再切。
2. **每步可独立回滚**：任何一步出问题，只回退该步，不影响其他。
3. **先有验证再改**：回灌前先跑 `evals/scenarios.md` 场景 1 建立基线（当前误放行率），改完再跑一次对比。
4. **灰度顺序**：修 bug → 加观测 → 加软提示 → 最后才切硬门。

## 前置：建立基线

```bash
cd 01-system-core
python scripts/score_candidate_v2j.py --text-file <某集>.txt --drama 《剧名》 --ep N \
  --mode existing --output /tmp/baseline.json
```

用人评 ground truth（`data/benchmark/human_scoring/`）算出当前的**误放行率**（人评 B/C 类被判 pass 的比例）与**误杀率**（人评 A 类被判 fail 的比例）。后续每一步改完都重跑，对比这两个数。

没有基线就不要改阈值——否则无法判断改动是变好还是变坏。

---

## 第 0 步：修 NameError（阻塞性，必须最先做）

**问题**：`app/routers/short_drama/step_routes.py` 的 `:816`、`:834`、`:960` 引用了四个常量，但它们定义在 `app/routers/short_drama_writing.py:172-179`，而 step_routes 只导入了 `app.schemas.short_drama_writing`（`:96`）。两个是不同文件。

**后果**：`step_id == "market_check"` 或 `"concept"` 时抛 `NameError` → 500。

**为什么必须先做**：这两个步骤在流程最前面。它们跑不了，后面所有回灌的效果都无法观测。

**修复**（推荐方案，避免循环导入）：

新建 `app/services/short_drama_gate_constants.py`，把四个常量搬过去：

```python
MARKET_CHECK_REJECT_VERDICT = "reject"
MARKET_CHECK_WARN_VERDICT = "warn"
MARKET_CHECK_WARN_DISABLED = True
CONCEPT_COMMERCIAL_SCORE_WARN_THRESHOLD = -1
QUALITY_PASS_MIN_TOTAL_ORIGINAL = 42   # 见第 4 步，暂留
QUALITY_PASS_MIN_TOTAL_NOVEL = 49
```

然后两边都从新模块导入：
- `app/routers/short_drama_writing.py:172-183` → 改为 `from app.services.short_drama_gate_constants import ...`
- `app/routers/short_drama/step_routes.py` → 在 import 段加同一行

**不要**直接 `from app.routers.short_drama_writing import ...`——`short_drama_writing.py:711` 反向导入了 step_routes，会形成循环导入（虽然因为 711 是后置导入大概率能跑通，但脆弱）。

**验证**：`market_check` 与 `concept` 两个步骤能正常返回（不再 500）。

**风险**：低。纯常量搬迁，无行为变化。

---

## 第 1 步：判定权回灌（核心）

**问题**：`short_drama_quality_helpers.py:68` 读 verdict、`:92` 只判 `verdict == "pass"` 字符串，代码从不算分。模型判宽，门就形同虚设。

**改法**：在 `derive_quality_step_guidance()` 内新增代码侧复算，**不覆盖**模型自填的 verdict。

```python
def recompute_verdict(report: dict) -> tuple[str, dict]:
    """按 quality-gate.md 的权威口径复算，返回 (verdict, trace)。"""
    aligned = report.get("human_aligned_scores") or {}
    bench = int(aligned.get("benchmark_total") or 0)
    cont = int(aligned.get("continuity_total") or 0)
    codes = str(aligned.get("hard_reject_codes") or "").strip()
    hook_ok = bool((report.get("advanced_diagnostics") or {})
                   .get("hook_diversity", {}).get("hook_diversity_pass", True))
    passed = bench >= 75 and cont >= 70 and not codes and hook_ok
    trace = {
        "judged_on": "raw",
        "raw": {"benchmark": bench, "continuity": cont},
        "threshold": {"benchmark": 75, "continuity": 70},
        "hard_reject_codes": codes,
        "hook_diversity_pass": hook_ok,
    }
    return ("pass" if passed else "reject"), trace
```

在 `build_step_result_extras` 的返回里新增两个字段：

```python
"verdict_computed": computed,
"verdict_conflict": computed != verdict,   # 模型与代码不一致
```

**第一阶段只写 `verdict_conflict`，不拦截。** 观察一段时间，统计冲突率。

**第二阶段**（确认代码侧更准后）才把 `verdict` 切换为 `computed`。

**验证**：对比 `verdict_conflict=True` 的样本，人工看是模型错还是代码错。若代码侧判对的比例显著更高，再切。

**风险**：中。切换后会显著抬高打回率。必须灰度。

---

## 第 2 步：85 与 75 对齐（需决策）

**问题**：集级质检用 75/70（prompt），scene 深审用 85/85（硬编码在 `short_drama_deep_audit.py:100,122`、`benchmark_assessment.py:274,306`、`seam_continuity.py:159`）。同一量纲两套通过线。

**这不是技术 bug，是标准未定，必须先决策**。两个选项：

| 选项 | 做法 | 后果 |
|---|---|---|
| A（推荐） | 深审降到 75/70，与集级统一 | 全链路一把尺子；打回率下降 |
| B | 显式声明"场景级 85 / 集级 75"是两个层级 | 保持现状，但必须在代码注释和文档里写明，不再默不对齐 |

**建议选 A**。理由：75/70 由 75 个（模型, 人评）配对标定，有 ground truth；85 是配合"硬伤封顶 70-80"机制的产物，逻辑上等价于"无硬伤"，不是独立质量线。

**改法**（选 A 时）：把三处 85 抽成常量 `DEEP_AUDIT_PASS_MIN = 75`（放第 0 步新建的常量模块），先只改一处观察，再全改。

**风险**：中高。会改变 scene 生成的通过率。需配合第 1 步的基线对比。

---

## 第 3 步：接通打回反馈链路

**问题**：reviewer 的 `feedback_record` 被写进 `metadata["issue_feedback"]["feedback_history"]`（列表，`step_routes.py:1046` 附近），而注入下集 prompt 的 `${issue_feedback_summary}` 读的是 `issue_feedback["summary"]`（字符串，`short_drama_template_vars.py:106`），后者由 `issue_feedback_service.py:325` 从 `stable_records` 独立生成。两条路径不相通。

**改法**：在 `short_drama_template_vars.py:106` 加回退——`summary` 为空时，从 `feedback_history` 尾部取最近 N 条拼成摘要：

```python
summary = str(issue_feedback.get("summary") or "").strip()
if not summary:
    hist = issue_feedback.get("feedback_history") or []
    recent = [h for h in hist[-5:] if isinstance(h, dict)]
    summary = "；".join(
        f"第{h.get('episode')}集 {h.get('dimension','')}: {h.get('issue_summary','')}"
        for h in recent
    ) or "当前项目暂无历史问题反馈。"
```

**风险**：低。只影响 summary 为空的情况，原有逻辑优先。

**验证**：连续打回两次同一集，看第三次生成时 prompt 里是否带上了前两次的问题。

---

## 第 4 步：清理死配置与文档对齐（低风险，可随时做）

| 项 | 处理 |
|---|---|
| `QUALITY_PASS_MIN_TOTAL_ORIGINAL=42` / `=49`（`short_drama_writing.py:182-183`） | 零引用。要么删除，要么接到第 1 步的 `recompute_verdict` 里。**不要留着不动**——它会让人误以为门是接好的 |
| `pipeline.toml` 的 `quality_gate_min_score=35`、`[state]`、`[batch]`、`gate_field`、`inject_knowledge`、`[premium_mode]`、`[comic_mode]` | 零消费。要么实现，要么从 pipeline.toml 删除并注明"未实现"，避免误读 |
| `reviewer-quality-score.md:156` 坏引用 `core/drama-format.md` | 改为 `core-rules/core/drama-format.md` |
| `reviewer-quality-score.md:150` 自创 H1-H11 | 删除或标注"已作废，以 hook-patterns.md 附录 v1.1 为准" |
| `reviewer-quality-score.md` 的 42/49 打回表 | 标注"已作废，现行口径为 benchmark≥75 / continuity≥70" |
| 样本数 82 vs 75 | 统一为 75 |
| `MARKET_CHECK_WARN_DISABLED=True` | 明确这是临时开关（修复32），加 TODO 说明何时启用 |

**风险**：低。纯清理。但**改文档前先确认没有代码依赖**。

---

## 第 5 步：字数后门与容差统一（可选）

**问题**：
- `short_drama_scene_generation.py:136-180` 的 `_word_count_issue_is_minor` 用 20% 容差，命中后清空 blocking 并强制 `quality_passed=True`
- `short_drama_evaluation_pipeline.py:105,107,114` 对同一问题用了三档（20% / 12% / 10%）

**改法**：把容差抽成常量并统一（建议统一为 10%，与最严的一档对齐；或直接对齐 `numeric-conflicts.md` 裁决的字数区间）。

**风险**：中。会让"字数差一点"的稿子不再被自动放行，打回率上升。

**建议**：放在最后做，且先只观测容差命中率。

---

## 不要动的部分

- **`short_drama_scene_generation.py:983-989`**（强制 `quality_passed=True`）：这是"所有尝试都失败时的兜底"，删掉会导致无稿可交。第 1 步的判定权回灌生效后，这个兜底的影响自然被约束。
- **`autofix_lightweight_validation`**（autofix 期间跳过深审）：这是有意为之的性能取舍，autofix 结束后会补跑完整门（`scene_generation.py:940-943`）。保持现状。
- **前端**：`webui/src` 零独立判定，完全镜像后端，不需要改。

---

## 回灌检查清单

每一步做完后逐项确认：

- [ ] 该步改动已跑通，无 500
- [ ] 重跑 `evals/scenarios.md` 场景 1，误放行率/误杀率与基线对比有记录
- [ ] 该步可独立回滚（git 单 commit）
- [ ] 文档中对应描述已同步更新（含本 Skill 的 `known-issues.md`）
- [ ] 下一步的前置条件已满足

**顺序不可打乱**：0 → 1 → 2 → 3 → 4 → 5。第 0 步不做，后面全部无法验证。
