# 已知架构风险全景

> **项目根（v2）**：规则包在 `<仓库>/rules/v2/`，脚本在 `<仓库>/scripts/`；项目数据由 moxi 工具管理（`~/Documents/Moxi/projects/<projectId>/`），**不要直接写项目数据文件**。


封装 Skill 时不需要改主链路，但**必须知道门在哪里是开着的**——否则会误以为有拦截，实际没有。

## 目录

- 软门的直接物证
- autofix 期间质量门被关闭
- 字数放行后门与两套容差
- 三处"看起来有门、实际开路"
- 稳定的假警报源
- 死常量清单
- 活阈值清单
- 正面样板
- 其他

---

## 软门的直接物证

`short_drama_scene_generation.py:983-989`——所有尝试都没过软审段时，代码强制放行：

```python
if best_candidate and not best_candidate.get("blocking_issues"):
    soft_msgs = [f"审段提醒：{item}" for item in (best_candidate.get("quality_issues") or [])]
    best_candidate["warnings"] = ...
    best_candidate["quality_passed"] = True      # ← 强制置 True
    return best_candidate
```

**LLM 审段（`review_testing_scene_quality`）在任何情况下都不会阻断放行。**

## autofix 期间质量门被关闭

`short_drama_autofix.py:491-505` 与 `short_drama_evaluate_scene.py:424-433`：

```python
validation_req = req.model_copy(update={"autofix_lightweight_validation": True})
...
if not validation_req.autofix_lightweight_validation:   # ← 恒为 False，永不执行
    evaluation = apply_scene_level_gate(...)
```

autofix 内部恒定跳过：深审网关（`apply_scene_level_gate`）、LLM 审段、structured_updates 提取。

**后果**：autofix 的唯一放行标准是"blocking_issues 为空"，即只剩本地 marker 规则一层。85/70 在这段完全不生效。主链路在 autofix 结束后会补跑一次完整门（`scene_generation.py:940-943`），所以最终仍会被拦一道，但 autofix 自身的产出不受质量约束。

## 字数放行后门与两套容差

`short_drama_scene_generation.py:136-180`：

```python
def _word_count_issue_is_minor(req, candidate):
    tolerance = max(80, int(min_count * 0.2))
    return min_count - current_count <= tolerance
```

命中后 `_release_minor_word_count_issue` 直接把 `blocking_issues` 清空并置 `quality_passed = True`。

而 `short_drama_evaluation_pipeline.py:104-117` 对**同一个问题**用了另一套容差：

```python
tolerance = max(80, int(configured_max * 0.20)) if is_segment else max(120, int(configured_max * 0.12))
```

**比例实际是三档**：`evaluation_pipeline.py:105` 的 20%（segment 分支）、`:107` 的 12%（非 segment 超限）、`:114` 的 10%（非 segment 不足）。`scene_generation` 的 20% 用在"字数不足"，与之对应的正是 evaluation_pipeline 的 **10%** 而非 12%。下限兜底值也不同（80 / 120 / 100）。

## 三处"看起来有门、实际开路"

| 位置 | 状态 |
|---|---|
| `step_routes.py:816` market_check 硬阻断 | `MARKET_CHECK_WARN_DISABLED = True` → 分支恒假 |
| `step_routes.py:834` market_check 软警告 | 同上 |
| `step_routes.py:960` 商业性警告 | `CONCEPT_COMMERCIAL_SCORE_WARN_THRESHOLD = -1` → 永不触发 |

### ⚠️ 已确认的缺陷：这些引用会抛 NameError

`step_routes.py` 的 import 段**只有一处**引用 `short_drama_writing` 模块名——`:96` `from app.schemas.short_drama_writing import (RunStepRequest, SaveStepRequest, StepResult)`。

注意这是 **`app.schemas.short_drama_writing`**，而四个常量定义在 **`app/routers/short_drama_writing.py:172-179`**。两个是不同文件。

`step_routes.py` 全文件从未导入 `app.routers.short_drama_writing`，因此 L816/834/960 引用的四个名字**在 step_routes 模块命名空间中不存在** → 运行时 `NameError`。

**触发条件与影响**：

| 行 | 触发条件 | 后果 |
|---|---|---|
| `:816` | `step_id == "market_check"` | NameError → 500 |
| `:834` | 同上，且 verdict 为 warn | NameError → 500 |
| `:960` | `step_id == "concept"` | NameError → 500 |

**step_routes 是活的**：`app/routers/short_drama_writing.py:711-720` 执行 `from app.routers.short_drama import step_routes as _step_routes` + `router.include_router(_step_routes.router)`，而 `main.py:325` 注册了 `short_drama_writing.router`。文件头注释（`:1`）写明 step_routes 是"从 short_drama_writing.py 抽出"——**这是重构拆分时漏带 import**。

修复方式见 `mainline-backfill.md` 第 0 步。

（补充：`STRUCTURED_ONLY_STEPS`、`REQUIRED_CLIFF_FIELDS`、`EMPTY_PHRASES` 三个名字虽然也在 step_routes 中出现，但都是**函数内局部赋值后使用**，不存在此问题。）

## 稳定的假警报源

`acceptance_criteria_service.py` 的 `run_acceptance_checks` 用 `overall_passed = all(...)` 求值，而 `_dependency_missing_result` 在依赖缺失时返回 `passed: False`。

cnsenti / funnlp 若未安装，`emotion_variance` 与 `emotion_pattern` 必然 `passed=False` → 每次都产出"验收依赖缺失"警告。但 `overall_passed` 只变成 `gate_warning` 字符串，**从不阻断**。

## 死常量清单

| 常量 | 位置 | 状态 |
|---|---|---|
| `QUALITY_PASS_MIN_TOTAL_ORIGINAL = 42` | `short_drama_writing.py:182` | 全仓库零引用 |
| `QUALITY_PASS_MIN_TOTAL_NOVEL = 49` | `short_drama_writing.py:183` | 全仓库零引用 |
| `quality_gate_min_score = 35` | `pipeline.toml:138` | 零消费 |
| `max_retries_per_episode = 2` | `pipeline.toml:139` | 零消费 |
| `CONCEPT_COMMERCIAL_SCORE_WARN_THRESHOLD = -1` | `short_drama_writing.py:177` | 永不触发 |
| `QUALITY_THRESHOLDS`（0.8/0.2/0.75） | `generation_with_optimization.py:363-367` | 定义后从未读取 |
| `EPISODE_REWRITE_CONFIG`（92/40/98） | `scoring_service.py:81-115` | score 与 passed 脱钩 |
| `SCRIPT_ALIGNMENT_CONFIG`（100/40/98） | `scoring_service.py:27-75` | `passed = defect_count <= 1`，与 score 无关 |

`scoring_service.py` 的两个剧本类函数 —— `calculate_script_alignment_score`（`:63` `passed = defect_count <= 1`）与 `calculate_episode_rewrite_score`（`:103` `passed = defect_count == 0`）——**判定与 score 完全脱钩，分数是摆设**。

而 `calculate_material_selection_score`（`:132-188`）判定完全基于分数：`:187` `"passed": final_score >= 75.0,  # APPROVAL_THRESHOLD`。`material_library_service.py:19` 的 `>= 75.0` 是同一阈值的另一处。

**这两个 75 是素材入库阈值，不是剧本质量分，不要与放行门的 75 混为一谈。**

## 活阈值清单（在执行路径上，改前先确认）

| 阈值 | 位置 | 说明 |
|---|---|---|
| **85** | `short_drama_deep_audit.py:100,122` | benchmark/continuity 原始分通过线 |
| **85** | `short_drama_benchmark_assessment.py:274,306` | fallback 通过线 |
| **85** | `short_drama_seam_continuity.py:159` | seam 连续性 |
| 70 | `short_drama_evaluation_pipeline.py:275` | 软连续性降级地板 |
| 70/72/74/75/76/78/80 | `short_drama_benchmark_assessment.py:242-268` | 局部硬伤封顶 |
| 40 | `short_drama_seam_continuity.py:126` | seam 断裂封顶 |
| 0.08 | `seam_continuity.py:108` **与** `project_final_polish_service.py:349` | **同一阈值两份拷贝** |
| 0.78 | `short_drama_narrative_drift.py:133` | 重复开局相似度 |
| 0.55 | `short_drama_format_repairs.py:157` | 段首重写判定 |
| 0.7 | `models/episode_segment.py:269` | StepGate min_score（可人工 bypass） |
| 75.0 | `scoring_service.py:187` | 素材入库，非剧本 |

## 正面样板

`c19_178_safe_label_gate.py:124-294` 是全项目**唯一同时满足**"配置驱动 + 抛异常真阻断 + 无魔法数字"三条的门（另有抛异常型硬门见下，但它们是硬编码阻断码，非配置驱动）：

```python
def c19_178_gate_required(project) -> bool:
    gate = (project.get_config() or {}).get("c19_178_external_human_review")
    return bool(gate.get("required")) or status in {...}

def assert_c19_178_runtime_gate(db, *, project, target_path):
    if not decision.allowed:
        raise C19178GateBlocked(decision)
```

**Skill 里的硬门应照抄这个形状**：配置读开关 + `assert_*` 抛异常 + 分支白名单，不要散落魔法数字。

另有一类抛异常型硬门值得参考：`short_drama_generation_source_packet.py:208` 的 `GenerationSourceBlocked`、`short_drama_episode_completion.py:403-453` 的一组阻断码。

## 其他

- **`scripts/` 的 75 是分档标签，不是放行门**。`score_candidate_v2i.py:326-334` 的 `score_band` 只做 A/B/C 分档，脚本明确声明 `industrial_pass: "Not produced by this scorer."`。`run_routed_scorebook_audit_v2g.py` 里有一堆分赛道魔法数字（25/30/35/45/50/55/60/65/70/75/90），与主链路无对应关系。**不要把脚本输出当放行依据**，只能用于研究排序。
- **前端零独立判定**。`webui/src` 全量扫描：没有任何基于分数的通过/打回判定，`ProjectWorkspaceView.vue` 完全镜像后端的 blocking 标志，前端不需要改动。
- **`episode_segment` 链路可人工 bypass**。`episode_segment_router.py:370-375` 提供 `bypass=True` 直接放行，`can_pass()` 的 `min_score=0.7` 形同虚设。这段是老的并行链路，非 scene 主链路。
- **`short_drama_atomic_generation` 不阻断交付**。`quality_passed=False` 只降级为"需用户确认"（`short_drama_atomic_generation.py:240-272`），稿子照样交还用户。

---

# 规则内部冲突（创作侧）

以上各节是**代码链路**的坑。本节是**规则资产自身打架**——这一类更隐蔽，因为它不会报错，只会静默把产出带偏。

### 落地状态（裁决写了不等于堵住了，看这一栏）

| 冲突 | 裁决 | 是否已落地为检查项 |
|---|---|---|
| 1 集纲模板 vs 家庭赛道 | 以 track_d 为准，`subgoal_for_antagonist` 可填"无" | ✅ `quality-gate.md` 每集必填字段 / `checks.md` 跨集第 4 项 |
| 2 `conflict_design` 强制主角弱势 | 改为"处境弱势"且须当场反制 | ⚠️ 仅裁决，**尚无自动检查**（靠人工） |
| 3 缺"观念冲突"类型 | 补第六类 | ⚠️ 仅裁决 |
| 4 合规管不到累积性伤害 | 加跨集主动动作计数 | ✅ `checks.md` 跨集第 2 项 |
| 5 concept 缺失无前置门 | 先补 concept | ✅ `workflow.md` concept 前置门 / `SKILL.md` 硬约束 |
| 6 原型库无家庭温情档 | 按语义另选原型 | ⚠️ 仅裁决 |
| 7 标题命题人物被挤空 | 命题主语在场率 | ✅ `checks.md` 跨集第 1 项 + 脚本 `--protagonists` |
| — 动线可拍性缺失 | 加单集告警 | ✅ `checks.md` 单集检查 |

## 冲突 1：集纲模板 vs 现实主义家庭赛道（最直接，已致事故）

| 出处 | 主张 |
|---|---|
| `step-definitions/02b_episode_outlines.md` | `main_conflict` 强制「地点 + **对手** + 目的」；`subgoal_for_antagonist` **每集必填** → 结构性强制每集都有人施压 |
| `core-rules/sample_track_d_realistic_family.md` | 「关键推进器：**代际失衡**、关系亏欠、时代变化」「**禁止为了短剧节奏硬塞打脸模板**」「explosion 不一定是吵架」 |

**裁决**：现实家庭 / 亲子温情类项目**以 track_d 为准**，`main_conflict` 的"对手"允许填"观念 / 制度 / 自己"，`subgoal_for_antagonist` 可填"无外部施压"。

## 冲突 2：`conflict_design.md` 强制主角处于弱势

三步法第一步原话：「主角处于明显弱势：被羞辱、被误解、被夺走、被当众否定」。

对**未成年主角**或**温情向项目**套此模板，观感会滑向"主角被围攻"——家庭题材下即为虐待儿童红线。

**裁决**：主角为未成年人或赛道为温情向时，第一步改为「主角处于**处境**弱势」而非「被压制弱势」，且当场必须有一个主角发起的反制动作。

## 冲突 3：五大冲突类型没有"观念冲突"

`conflict_design.md` 的五大类型是 关系 / 身份 / 资源 / 秘密 / 规则。**代际差异、育儿观、价值观对撞不属于任何一类**，模型只能拿最接近的替代 → 变成外部施压。

**裁决**：补第六类 **⑥ 观念冲突**（两套价值系统的对撞，兑现方式：被现实检验、一方被迫承认另一种也成立）。

## 冲突 4：合规规则管不到"累积性结构伤害"

`content_compliance.md:11-15` 的 1.1 未成年人保护只覆盖：性暗示 / 早恋 / **暴力虐待的详细过程** / 性张力场景。

管不到"连续 N 集让未成年人承压、且全程无主体性"这种**累积性、结构性**问题——单看每一集都合规，连起来就是虐待观感。

**裁决**：未成年人为主角时，追加一条**跨集**检查——主角主动发起的动作计数（不是被动作出的反应）。连续 3 集主动动作 = 0 即告警。

## 冲突 5：concept 缺失时集纲无前置门

`02b_episode_outlines.md` 依赖 `${concept}`（logline / 核心冲突 / season_milestones），硬约束 10 还要求"里程碑对齐"。但**没有任何检查阻止在 concept 为空时生成集纲** → 产出必然无主线。

**裁决**：写集纲前先确认本项目的 logline 与 season_milestones 存在。不存在就先补 concept，**不要跳过**。

## 冲突 6：原型库与里程碑模板无家庭温情档

- `knowledge-base/plot_archetypes.md` 的「短剧赛道推荐组合」8 行全是打脸 / 甜宠 / 复仇 / 宫斗，**没有家庭日常 / 亲子温情**。
- `01_concept.md` 的 milestones 模板是"开局抢婚 → 反派阴谋暴露 → 最终对决"的打脸骨架。

**裁决**：温情向项目按语义另选原型（如 #2 援救 / #21 为骨肉牺牲自己），milestones 按"关系档位变化"而非"对决"编排。

## 冲突 7：标题命题人物被反派线挤空（已致事故·《我的父母没素质》6-10 集）

事故形态：剧名《我的父母没素质》，但 ep6–ep10 连续五集**爸爸零出场**，其中 ep6/8/9 三集**双亲全部缺席**。观众看到的是姜蔓在查、在捐、在设资助——**剧名的主语被移出了画面**。

**根因仍是冲突 1 的次生灾害**：为满足 `subgoal_for_antagonist` 每集必填，每集都要给反派编一个小目标；一旦反派线是连续动作线、主角线是状态线，**叙事重心会自动倒向有动作的一方**。这不是模型偷懒，是模板的结构偏置。

**规则侧完全无拦截**：`checks.md`、集纲模板、`long_series.md` 里**没有任何一处检查"剧名/命题主语是否在场"**。

**裁决（新增硬指标，写进集纲校验）**：

1. 从剧名与 logline 中提取**命题主语**（本剧 = 陆时 + 苏芮，不是苏念，更不是姜蔓）。
2. 集纲阶段统计每集 A 线正文里命题主语是否出现，输出两张表：
   - **双亲/双主角同场率**
   - **任一命题主语在场率**
3. 判定线：**任一命题主语在场率 < 90% 即打回**；**同一人物连续 3 集零出场即打回**（本事故为连续 5 集）。
4. 唯一豁免：反派视点集（全剧 ≤2 集，且必须在字段里写明 B 线由谁承担、B 线是否进正文）。

**配套**：反派线的推进不得占用命题主语的场次——反派要进画面，就让反派**走进主角的场景**（本剧 ep8 让姜蔓走进学校，同时把陆时苏芮按在最后一排），而不是把主角从场景里挪走。

## 规则侧还缺这一项

**动线可拍性 / 物理合理性**——`checks.md` 的单集检查里没有。模型写出"边下楼边跳绳"这类动作不会有任何检查拦住。建议加入单集检查（告警级）。
