项目类型：${project_type}
集数：${episode_count}
单集时长（分钟）：${episode_minutes}
受众轴：${audience_axis}
主类型：${genre_main}
副类型：${genre_sub}
规则画像：${rule_profile}
约束与禁忌：${constraints}

受众规则（由 pipeline 根据 audience_axis 自动注入 male_core/female_core/hybrid_genre）：
{{rules:audience_rules}}

细分类规则（根据主类型/副类型自动注入）：
{{rules:subgenre_rules}}

分类规则（根据头部样板类型自动注入）：
{{rules:sample_track_rules}}

通用短剧规则（所有项目）：
{{rules:short_drama_core}}
{{rules:duration_char_count}}
{{rules:manga_production_2026}}
{{rules:conflict_design}}

长剧规则（episode_count ≥ 30 或 project_type 含"长剧"时注入）：
{{rules:long_series}}

前置设定-角色库：
${characters}

前置设定-世界观规则：
${world_rules}

前置设定-关系护栏：
${relationship_guardrails}

前置设定-状态卡：
${state_cards_block}

前置设定-金手指规则：
${golden_finger_rules}

前置设定-冲突规划：
${conflict_plan}

素材参考：
${material_references}

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

本轮负面提示：
${negative_prompt_hints}

本轮审查重点：
${review_focus}

概念与主线：
${concept}

${current_episode_outline}

分集节拍：
${beat_sheet}

---

## 集纲对齐（强制，最高优先级）

上方 `${current_episode_outline}` 是本集已经确定的集纲。**本集的所有分场都必须严格围绕集纲的 main_event / main_conflict / cliffhanger 展开**：
- 第一场必须承接集纲里的 callbacks（前集承接）
- 主冲突场必须落在集纲指定的"地点 + 对手 + 目的"
- 最后一场必须收束到集纲里的 cliffhanger（具体场所/角色/动作）
- 不得发明集纲没有的关键事件或转折

若 `${current_episode_outline}` 为空，按节拍表 `${beat_sheet}` 兜底。

输出要求（严格）
1) 只输出一个 JSON 对象，字段：context_output、full_output
2) full_output 用 Markdown，按下列格式输出；只写结果，不要解释
3) context_output 只保留“第 ${draft_episode} 集”的分场表（用于下一步写剧本），不要带全季全部内容

full_output：分场表（全季/全集）

要求

**【场数硬约束 — 修复52/66，最高优先级】根据项目类型反推场数：**
- **漫剧（project_type 含"漫剧"，单集 90 秒 1200 字）**：**严格 5-7 场，最优 6 场**。少于 5 场判废；超过 7 场也判废（修复66：禁止"多场短场"模式，8 场以上会让单场短到 < 150 字）
- **每场必须有充足容量**：分场表中每场的"目的+冲突+转折+场末钩子+可视化动作"必须详细写出（≥4 行描述），让 script_draft 阶段有足够素材展开 200-240 字
- 禁止把单一冲突拆成多个 100 字短场（这是 LLM 偷懒模式）
- **真人短剧 ≤3 分钟**：每集 4-6 场。
- **真人短剧 3-5 分钟**：每集 6-9 场。
- 全剧分场表也按上述每集场数规划，漫剧 30 集应有 150-210 场。

**核对清单**：
- [ ] 当前 `${draft_episode}` 集 context_output 中场数 ≥ 5（漫剧）/≥4（真人短剧）
- [ ] 每场预估字数 = 目标总字数 / 场数（漫剧大约 1200/6 ≈ 200 字/场）
- [ ] 不允许"凑场"——每场必须有独立的转折（关系/信息/权力）

- 对于 ${episode_minutes} 分钟的单集，context_output 中当前集至少输出 **5-7 场（漫剧）或 4-6 场（真人短剧）**
- 每集表格前先写：主关系线 / 主信息链 / 主权力线 / 未完成承诺
- 每场必须写清：地点、人物、目的、阻碍/冲突、转折、场末钩子
- 每场一句“可视化动作”，避免抽象叙述
- 每场的“转折”必须明确落在以下三者之一：关系变化 / 信息差变化 / 权力变化；最好两项叠加
- 场景地点必须带平台热分类识别度：都市看公司 / 豪宅 / 医院 / 酒会 / 商场，校园看教室 / 榜单 / 广播 / 操场 / 考场，古代看府邸 / 朝堂 / 宫廷 / 牢狱等高识别空间
- 女频场次优先让关系温度发生变化：靠近、疏远、误会加深、偏爱缺席、反击开始露头
- 男频场次优先让局势变化可见：亮牌、公开证明、资源夺回、成绩翻盘、身份揭露、系统结算
- 混合题材场次必须让悬念推进和现实后果并行，不能只有信息没有代价
- 每集至少安排一个“围观场”或“关系翻面场”，让爆点被看见，不只主角自己知道
- 不允许连续三场都只是同类争吵或同类误会；如果重复，必须升级为更大的信息差、权力变化或现实代价
- 如果节拍命中了平台最热设定，分场时要把该设定拆成具体动作和具体空间，不能停留在标签层
- 历史问题反馈涉及的常见失败点，必须在分场阶段提前规避

输出格式

## 第 1 集分场表
主关系线：
主信息链：
主权力线：
未完成承诺：
| 场次 | 场景地点 | 出场人物 | 目的 | 冲突/阻碍 | 转折 | 场末钩子 | 可视化动作 |
|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  |

## 第 2 集分场表
（同上，直到第 ${episode_count} 集）

context_output：第 ${draft_episode} 集分场表（只要这一集）
- 同样用表格输出
- 必须保证：场景地点具体、冲突清楚、场末钩子有落点、可视化动作可拍
- 必须能看出本集主关系线 / 主信息链 / 主权力线 / 未完成承诺
- 必须能看出该集命中的平台热分类和爆点落在什么场次
