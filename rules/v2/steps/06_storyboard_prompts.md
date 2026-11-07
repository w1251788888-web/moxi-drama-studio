项目类型：${project_type}
单集时长（分钟）：${episode_minutes}
受众轴：${audience_axis}
主类型：${genre_main}
副类型：${genre_sub}
规则画像：${rule_profile}
约束与禁忌：${constraints}

素材参考：
${material_references}

历史问题反馈摘要：
${issue_feedback_summary}

本轮审查重点：
${review_focus}

细分类规则（根据主类型/副类型自动注入）：
{{rules:subgenre_rules}}

样板增强规则（根据当前赛道自动注入）：
{{rules:sample_track_rules}}

分镜执行要求：
${storyboard_requirements}

第 ${draft_episode} 集分场表：
${scene_list}

第 ${draft_episode} 集成品剧本：
${script_draft}

输出要求（严格）
1) 只输出一个 JSON 对象，字段：context_output、full_output
2) 输出的是“分镜执行稿”，不是重写剧本，不得新增剧情。
3) 必须逐场对应 scene_list 与 script_draft，保证拍摄执行可落地。

full_output：第 ${draft_episode} 集分镜规划

每场必须包含：
- 场次
- 画面目标
- 镜头拆分（3-6 个）
- 关键动作/表演提示
- 情绪推进
- 场尾钩子镜头

镜头拆分建议格式：
- 镜头1｜景别｜机位/运动｜画面内容｜对白/音效（如有）
- 镜头2｜景别｜机位/运动｜画面内容｜对白/音效（如有）

额外要求
- 优先保证可拍、可剪、可出爆点切片。
- 公开翻盘、围观反应、关系翻面、身份亮牌等关键爆点必须给到明确镜头。
- 若历史问题反馈提到“场面不够强/过于总结化/围观感不足”，分镜必须主动补足。
- 不要写空泛摄影理论，不要写超出当前低成本短剧执行范围的复杂调度。

context_output 结构（建议）
- 第 ${draft_episode} 集每场一句分镜目标
- 3 个必须拍到的爆点镜头
- 1 句总说明：本集最强传播点是什么
