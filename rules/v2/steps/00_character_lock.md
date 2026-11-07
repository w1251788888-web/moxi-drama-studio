---
## 角色表人工确认锁定（小说IP改编强制执行）

本步骤在 novel_analysis 完成后执行。
任务：从 novel_analysis 输出中提取角色信息，供人工确认后写入 locked_characters.json，后续所有步骤只读不改。

---

## 输出要求（严格）

只输出一个 JSON 对象，字段：`character_lock_result`

---

## 输入数据

novel_analysis 输出摘要：
${novel_analysis}

项目信息：
- 项目类型：${project_type}
- 总集数：${episode_count}
- 主类型：${genre_main}

---

## 锁定规则

1. **角色名唯一写法**：同一角色在全文只允许一种写法（禁止"秦昊"/"秦总"/"总裁大人"混用同一角色）
2. **首次出场集数**：根据 novel_analysis 的集-章节对照表确定，不得随意更改
3. **合并/拆分决策**：
   - 原著两个功能相近的配角可合并为一个（须在 notes 中说明）
   - 原著一个多面角色可拆分（须说明拆分依据，且不得影响核心冲突）
4. **角色功能定位**（必填）：
   - 主角 / 女主 / 男主
   - 反派（小/中/大）
   - 盟友 / 导师 / 工具人
5. **锁定后不可变更**：锁定后任何步骤不得新增、删除、重命名角色

---

## 输出格式

```json
{
  "character_lock_result": {
    "locked_characters": [
      {
        "canonical_name": "角色唯一写法",
        "aliases_from_novel": ["原著中的其他叫法"],
        "role_type": "主角 / 反派(大) / 盟友 等",
        "first_appearance_episode": 1,
        "last_appearance_episode": 60,
        "merge_from": [],
        "split_reason": "",
        "notes": "",
        "locked": true,
        "永久特征": "外貌/身份/能力/性格基底（这些 30 集禁改）",
        "禁用别名": ["禁止 LLM 在剧本中使用的其他写法（如 苏小姐、临渊哥、苏总）"]
      }
    ],
    "total_characters": 0,
    "checks_passed": true,
    "errors": [],
    "warnings": []
  }
}
```

`checks_passed = false` 时，pipeline 停止，等待人工确认修正后重新执行本步骤。
