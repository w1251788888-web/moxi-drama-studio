项目类型：${project_type}
集数：${episode_count}
单集时长（分钟）：${episode_minutes}
受众轴：${audience_axis}
主类型：${genre_main}
副类型：${genre_sub}
规则画像：${rule_profile}
约束与禁忌：${constraints}

原始选题/设定：
${brief}

素材参考：
${material_references}

跨项目爆款全剧本参考（RAG 检索 · moxi_scripts 236 本精品库，仅借鉴思路/结构，严禁照搬具体情节/人物/台词）：
${rag_script_references}

跨项目高分桥段/人设/钩子参考（RAG 检索 · asset_library_hq，仅借鉴思路/结构）：
${rag_asset_references}

市场信号参考（RAG 检索 · market_signals_hq）：
${rag_market_signals}

素材借鉴重点：
${material_borrow_focus}

热度信号：
${material_heat_signals}

风险护栏：
${material_risk_guardrails}

禁止照搬：
${material_do_not_copy}

历史问题反馈摘要：
${issue_feedback_summary}

细分类规则（根据主类型/副类型自动注入）：
{{rules:subgenre_rules}}

样板增强规则（根据当前赛道自动注入）：
{{rules:sample_track_rules}}

本轮负面提示：
${negative_prompt_hints}

本轮审查重点：
${review_focus}

---

## 模式判断（执行前必读）

根据 `project_type` 变量决定执行模式，两种模式任务完全不同：

### 模式A：原创项目（project_type 不含”小说IP改编”）→ 创作模式

执行原有全部任务：生成 Logline、卖点、核心冲突、主线推进策略、主题命题、结局方向。

### 模式B：小说IP改编（project_type 含”小说IP改编”）→ 验证模式

**禁止重新创作。** 任务是从 `${novel_analysis}` 输出中提取并结构化，不得新增或发明：

- **Logline**：直接从改编方案/原著核心梗提炼，不重新发明
- **核心梗**：原著核心梗原文，不替换
- **情感基调**：沿用 novel_analysis 已确定的基调，不重新选择
- **结局方向**：沿用原著结局（已在 novel_analysis 中确认），不生成 A/B 方案
- **禁止**：重新设计主线推进策略、重新设定钩子频率、重新选择受众轴、重新设计角色关系
- **输出格式**：仍用下列 full_output 栏目，但内容来源标注为”原著”或”改编方案确认”

---

输出要求（严格）
1) 只输出一个 JSON 对象，字段：context_output、full_output、commercial_score、commercial_warnings、primary_archetype、secondary_archetype
2) full_output 用 Markdown，包含下列栏目；只写结果，不要解释
3) context_output 必须是”下一步需要的必要摘要”，尽量短，不要粘贴 full_output 全文
4) commercial_score：整数 0-10，根据 commercial_viability.md 的五个子维度评估当前概念的商业性
5) commercial_warnings：数组，当 commercial_score < 6 时必须填入风险说明；≥6 时填空数组 []

full_output 栏目
## Logline（1 句）
## 卖点（3 条）
## 核心冲突（1 段）
## 主线推进策略（钩子与反转）
- 钩子频率建议：
- 反转类型与落点：
## 情节原型（archetype，对标 `knowledge/plot_archetypes.md` 的 36 种经典情节编号）
- primary_archetype: [编号 + 名称，如 “#03 复仇”]
- secondary_archetype: [编号 + 名称，0-1 个辅线]
- 选用理由：1 句话说明为何选此原型适配本项目受众轴与赛道
## 主题命题（1 句）
## 结局方向（2 个方案，原创模式）/ 原著结局确认（小说IP改编模式）
- A：
- B：
## 商业性预判（必填）
- 平台热分类命中：[命中哪个平台的哪个热榜赛道]
- 热度目标：[推荐 → 最热 的路径]
- 对标作品：[2-3部，说明借鉴点]
- 差异化卖点：[本项目与对标的1个核心区别]
- 风险预判：[审核风险 / 市场接受度风险 / 若无则填”无明显风险”]
- 商业性评分：${commercial_score}/10
## 全季主线骨架（30 集 milestones，强制）
此栏目用于把全季拆成 8-12 个里程碑事件作为后续 beat_sheet 的填充骨架。
- 每个里程碑必须明确：集号、事件、关键人物、关系/信息/权力变化、对主线的推进
- 里程碑必须按时间顺序、不能重复、不能停滞（每个里程碑都要让局面发生不可逆变化）
- 必须覆盖：开局抢婚/相遇 → 第一次冲突 → 第一次身份揭露 → 关系拐点 → 反派阴谋暴露 → 中段大爆点（首次付费墙第 8-12 集）→ 关系反转 → 危机时刻 → 最终对决（第 26-30 集）→ 结局
- **严禁**写成”苏棠继续揭露苏柔不法”这种重复模式；每个里程碑必须是新事件、新筹码、新代价

格式（JSON 子结构，严格按此输出）：
```json
“season_milestones”: [
  {“episode”: 1, “event”: “抢婚现场，沈临渊出示账本造假证据，首次同床”, “primary_change”: “苏棠从被动被嫁→主动调查身份”},
  {“episode”: 5, “event”: “苏棠发现自己是替身，确认债务被偷换”, “primary_change”: “信息层揭露，关系层互信加深”},
  ...
]
```
里程碑数量必须 ≥ 8 且 ≤ 12。集号必须分布在 1~episode_count 区间内，不能堆在前 5 集。

额外要求
- 历史问题反馈里提到的风险必须主动规避，不得重复出现。
- 素材只能借鉴结构、节奏、爆点兑现方式，不能照搬具体人物、事件、台词。
- 方案必须能直接进入下一步角色与节拍表生成。
- commercial_score < 6 时，必须在 commercial_warnings 中给出至少2条具体的可执行优化建议（如”建议将题材改为X”或”增加Y类型传播点”）。

context_output 结构（建议用项目符号）
- 当前执行模式：创作模式 / 验证模式
- Logline
- 核心冲突一句话
- 主角目标/阻碍/代价（各 1 句）
- 主类型/副类型的表达倾向（各 1 句）
- 第 ${draft_episode} 集的”开场异常”与”集末钩子”（各 1 句）
- 商业性评分：X/10（若<6附上主要风险点）
