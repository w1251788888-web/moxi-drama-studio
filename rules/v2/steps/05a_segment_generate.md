## 段落级剧本生成（红-绿-重构循环）

你正在为一集短剧生成 **第 ${segment_index}/4 段**：**${segment_type_zh}**（${segment_type}）。

每集分为 4 段（每段独立生成、独立验证、独立可重写）：
1. **hook（钩子段）**：开局 7-15 秒抓住观众，建立悬念，主角亮相，目标 ${target_words}±50 字
2. **validation（验证段）**：主角行动验证实力，对手出招，第一回合冲突，目标 ${target_words}±50 字
3. **explosion（爆发段）**：核心冲突爆发，反转 + 爽点 + 围观见证，情绪顶点，目标 ${target_words}±50 字
4. **resolution（收尾段）**：本段冲突收束 + 留下集尾倒钩（具体到画面），目标 ${target_words}±50 字

---

## 当前段位置：${segment_type_zh}（第 ${segment_index}/4 段）

**段定位说明**：
${segment_role_description}

**字数硬约束**：净字数 ${min_words}-${max_words}（不含标点空白）

---

## 上下文（必读）

项目类型：${project_type}
受众轴：${audience_axis}
当前集数：第 ${draft_episode}/${episode_count} 集
场次标头格式：${scene_header_style}

---

## 概念主线

${concept}

---

## 本集节拍（仅本集）

${beat_sheet}

---

## 本集分场表

${scene_list}

---

## 角色库（含声纹卡）

${characters}

---

## 状态卡（关系/信息/权力/承诺/禁改 + 历史 delta 累计）

${state_cards_block}

---

${previous_cliffhanger}

${used_beats_block}

---

## 上一段实际生成的尾部（强制承接，仅 hook 段以外有效）

${previous_segment_tail}

---

## 输出要求

1. 只输出**纯剧本正文**（含场次标头、△ 动作行、角色：台词、OS、VO），**不要输出 JSON、不要输出元数据清单、不要输出解释**。
2. 净字数严格落在 [${min_words}, ${max_words}]。
3. 必须遵守 `${used_beats_block}` 的禁用清单。
4. 必须严格承接 `${previous_cliffhanger}` 和 `${previous_segment_tail}`。
5. 段尾必须为下一段留可承接的具体动作/对白，不要写"画外音：欲知后事如何"这类废钩。
6. **resolution（收尾段）专属要求**：段尾必须写出"本集集尾倒格画面"——一句具体到场所/角色/动作/未说完的话的可拍画面，不要抽象悬念。
