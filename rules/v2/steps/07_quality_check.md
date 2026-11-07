项目类型：${project_type}
受众轴：${audience_axis}
当前集数：${draft_episode}

${current_episode_outline}

待质检剧本正文（script_draft）：
${script_draft}

---

分类规则（根据头部样板类型自动注入）：
{{rules:sample_track_rules}}

2026 生产与时长规则：
{{rules:duration_char_count}}
{{rules:manga_production_2026}}
{{rules:satisfaction_taxonomy}}

细分类规则（根据主类型/副类型自动注入）：
{{rules:subgenre_rules}}

上游参考（供连贯性核查用）：

角色库（含声纹卡）：
${characters}

状态卡（关系 / 信息 / 权力 / 未完成承诺 / 禁改事实）：
${state_cards_block}

本集节拍设计：
${beat_sheet}

本集分场表：
${scene_list}

历史问题反馈摘要：
${issue_feedback_summary}

本集原著锚点（小说IP改编时有值，原创项目为空）：
${episode_novel_anchor}

同赛道同位置爆款基线（RAG · moxi_scripts，仅作评审参照用，不改写）：
${rag_review_references}

---

请严格按照质检评分规则对上方剧本进行全量评分，输出 JSON 格式质检报告。

额外要求：
- 在现有评分维度之外，必须补充本集的关系推进、信息链连续、权力翻转可见、未完成承诺、模板重复风险诊断。
- 若剧本只发生了事件，但关系、信息、权力三层都没有明显推进，必须在修改指令中明确指出。
- 若存在“揭秘了但没有后果”“爽点发生了但没人看见”“集末只有空悬念没有未完成承诺”，必须判为缺陷。

**强制输出 state_card_delta 字段（用于跨集状态滚动）：**
在最终 JSON 顶层输出一个 `state_card_delta` 对象，包含本集相对上集的具体变化，五个轴各一句话（无变化填空字符串）：
```json
"state_card_delta": {
  "relationship": "本集主角关系发生的具体变化（谁对谁立场/态度/距离的明确改变）",
  "info_chain":   "本集新揭露/新承接/新埋的信息线索（点状事实，不是总结）",
  "power_shift":  "本集权力翻转/筹码消长/规则兑现的具体表现",
  "open_promise": "本集集末留下的未完成承诺（必须可被下集接住）",
  "no_change":    "本集明确禁改/已锁定的事实（如确凿身份/已死/已查实）"
}
```
此字段会被自动累计注入下集的 ${state_cards_block}，必须如实填写而非含糊套话。

**【H10 通过阈值（强制，按校准后人评尺度）】**

verdict 仅在以下条件**全部满足**时设为 `"pass"`，任一不满足直接 `"fail"`：
- `benchmark_total ≥ 75`（注意：模型历史均值 65 / 人评 49，模型若仍输出 70 多分，按校准后实际不到 60，**不可放行**）
- `continuity_total ≥ 70`（模型历史均值 75 / 人评 61，同上要求严判）
- `hard_reject_codes` 字段为空（任一 ①②③④⑤ 触发，强制 fail）
- `hook_diversity_pass = true`（连续 3 集禁同子标签）

**校准提醒**：之前 quality_check 的 verdict 普遍偏宽松，导致 B/C 类剧本被放过。本轮起按上述硬阈值判定，宁可多打回也不放行。具体偏差表见 `reviewer-quality-score.md` 末尾"模型偏差自校准"块。

---

**【新增 P4-F/G】钩子子标签 + 多样性诊断（必填，与 reviewer-quality-score.md 诊断项6 对齐）：**

每次质检必须额外输出：
```json
"hook_diversity": {
  "hook_subtag": "H1-H11 之一（参见 core/hook-patterns.md 附录，禁止在此复述定义）",
  "hook_recent_window": ["前 5 集 hook_subtag 列表，从 ${used_beats_block} / 历史输入中提取"],
  "hook_diversity_pass": true
}
```
- 当本集子标签与最近 2 集完全相同 → `hook_diversity_pass: false`，强制打回
- 任意 5 集滑窗内同一子标签出现 ≥3 次 → 同样判 false

**【新增 P4-G】投稿合规检查（占位框架，平台规格暂留空待后期接入）：**

```json
"compliance_check": {
  "word_count_pass": true,
  "episode_count_pass": true,
  "platform_spec_pass": true,
  "platform_spec_notes": "占位：暂未接入具体平台规格，默认 pass。后续按 commercial_viability.md 附录第五章细化检查项接入。"
}
```
- `word_count_pass`：本集有效字数是否符合 `duration_char_count` 的动态区间；用户显式填写 `word_count_min / word_count_max / word_count_target` 时以用户填写为最高优先级，否则按时长换算，90 秒默认 1000-1550 纯字符。
- `episode_count_pass`：当前集号是否在项目 episode_count 范围内
- `platform_spec_pass`：占位字段，目前固定 true，预留给抖音/快手/红果/腾讯等平台规格化检查

**【修复65】强制输出 cliffhanger_concrete 字段（每集必填，缺一字段判废）：**

LLM 必读：本字段在每集质检时必须输出，**绝对不允许跳过**。即使本集已是最后一集，也必须输出"全剧落幕画面"作为 cliffhanger。

四字段格式（**修复55** 新版字段名，必填）：
```json
"cliffhanger_concrete": {
  "freeze_scene": "具体场所（如：苏家书房，不能是'某处'）",
  "freeze_characters": ["在场角色名列表（必须使用 ${characters} 中已锁定的 canonical_name）"],
  "freeze_prop": "可视道具（账本/U盘/电话/项链/电报/信物等具体物件，不能空，不能写'无'）",
  "freeze_action": "定格动作（'X 拿着 Y 站在 Z 前，话说一半'这种可拍画面，不是'决心要揭开真相'空话）"
}
```

**严禁**：
- 字段值为 null / 空字符串 / "未明" / "待续"
- 写"故事继续/危机来临/真相未明/期待下集/下集见分晓"这类抽象悬念
- freeze_action 写"主角下定决心"这种内心戏（必须是可拍外在动作）

集纲已经在 `${current_episode_outline}` 给出本集 cliffhanger 内容，**直接抄来填四字段**即可，不要自创新钩子。

此字段会被注入下集 script_draft 的 ${previous_cliffhanger}，下集开场第一场必须以此为起点。

**【修复65】强制输出 used_beats 字段（每集必填，至少 2-4 项）：**

```json
"used_beats": [
  {"scene": "苏家婚礼现场", "action": "公开账本造假证据", "target": "苏家账本造假", "type": "信息揭露+围观打脸"},
  {"scene": "新房", "action": "手持电报", "target": "沈临渊死讯", "type": "悬念铺垫"}
]
```
要求：
- 至少列出本集 2-4 个"已用"的核心爆点：每个爆点包含场景/动作/目标/类型四要素
- 即使本集冲突简单也必须填 ≥2 项
- 此列表会被累计注入下集 prompt 的 ${used_beats_block} 作为禁用清单
- 下集若要再用"会议室+摔文件+揭露"组合则必须换目标或换组合，**严禁**重复同一组合超过 1 次

---

## 【修复65】整体输出 JSON 顶层结构（自检清单）

LLM 输出前必须自检以下顶层字段都已填：
- [ ] `quality_report` —— 质检评分主体
- [ ] `state_card_delta` —— 5 字段（relationship/info_chain/power_shift/open_promise/no_change）
- [ ] `cliffhanger_concrete` —— 4 字段（freeze_scene/characters/prop/action）
- [ ] `used_beats` —— ≥2 项数组
- [ ] `hook_diversity` —— 3 字段（hook_subtag / hook_recent_window / hook_diversity_pass）
- [ ] `compliance_check` —— 4 字段（word/episode/platform pass + notes，平台字段当前默认 true）

**任何一项缺失都会导致下集生成时承接断裂，整轮判废。**
