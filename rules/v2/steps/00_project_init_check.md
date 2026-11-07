---
## 项目初始化核对清单（所有项目强制执行，pipeline 第一步）

本步骤不生成任何内容，只做核对与配置确认。所有检查项目必须全部通过，pipeline 方可继续。

---

## 输出要求（严格）

只输出一个 JSON 对象，字段：`init_check_result`

---

## 核对清单

### 检查1：project_type 合法性

`${project_type}` 必须是以下合法值之一（可组合）：

| 合法值 | 说明 |
|--------|------|
| 漫剧 | 竖屏漫画风格，按单集时长换算净字区间；90秒基准为1000-1550纯字符 |
| 真人短剧 | 真人拍摄，≤5分钟/集，无字数硬约束 |
| 小说IP改编 | 须与"漫剧"或"真人短剧"组合使用，如"小说IP改编 漫剧" |
| 精品短剧 | 须与"漫剧"或"真人短剧"组合使用，触发精品Agent |

**非法值检测：**
- 如 `${project_type}` 为空、拼写有误、或不在上述列表中 → **报错，停止流程**
- 如含"小说IP改编"但 `${novel_input}` 为空 → **报错，停止流程**，提示"小说IP改编项目必须提供 novel_input 原著内容"

---

### 检查2：scene_header_style 确认

`${scene_header_style}` 必须为 `bracket` 或 `plain`：

| 值 | 适用场景 | 示例 |
|----|---------|------|
| `bracket` | 甲方验收稿（默认） | `【场1-1：夜  内  江家书房】` |
| `plain` | 平台投稿稿 | `1-1  日  外  战场` |

- 如未设置或为空，**默认使用 `bracket`**，并在 init_check_result 中标注"已自动设置为 bracket"
- 两种格式**禁止混用**，一经确认不得中途更改

---

### 检查3：受众轴确认

`${audience_axis}` 必须为以下之一：

- `男频`
- `女频`
- `混合`

如为空 → **报错**，提示"受众轴必填，影响爽感类型选择和节拍规划"

---

### 检查4：小说IP改编专项确认（project_type 含"小说IP改编"时）

以下字段如有任何一个为空 → **报错，停止流程**：

| 字段 | 说明 |
|------|------|
| `${novel_input}` | 原著文本/大纲/章节摘要 |
| `${episode_count}` | 改编总集数 |
| `${genre_main}` | 主类型（来自原著） |

**改编方向预确认（仅输出，不阻断）：**
- 是否已完成 `00_novel_analysis` 步骤？（pipeline 自动检测 novel_analysis 状态）
- 如未完成 → 在 init_check_result 中标注"警告：novel_analysis 未完成，后续步骤将缺少原著锚点"

---

### 检查5：集数与付费墙节点计算

根据 `${episode_count}` 自动计算并输出：

- 节点A（首次付费钩子）：第 `round(episode_count × 0.3)` 集，向前后 ±1 集浮动（约占全剧 30% 位置）
- 节点B（充值高峰墙）：第 `round(episode_count × 0.8)` 集（占全剧 80% 位置，长短剧统一公式）
- 权威定义：详见 `core-rules/long_series.md §二 双付费墙节点`，其他文件一律引用本计算结果，不再硬编码集号

输出结果供后续 03_beat_sheet.md 直接引用。

---

### 检查6：历史反馈注入确认

- 如 `issue_feedback_history.json` 存在且有记录 → 自动提取最近10条，注入 `${issue_feedback_summary}`
- 如不存在或为空 → `${issue_feedback_summary}` = "无历史反馈"，初始化空文件

---

## 输出格式

```json
{
  "init_check_result": {
    "project_type": "${project_type}",
    "scene_header_style": "bracket / plain（已确认/自动设置）",
    "audience_axis": "${audience_axis}",
    "episode_count": 0,
    "paywall_node_a": "第X集（= round(episode_count × 0.3)，±1）",
    "paywall_node_b": "第X集",
    "is_novel_adaptation": false,
    "novel_analysis_done": true,
    "issue_feedback_injected": true,
    "issue_feedback_count": 0,
    "checks_passed": true,
    "errors": [],
    "warnings": []
  }
}
```

`checks_passed = false` 时，pipeline 必须停止，不得进入下一步。
