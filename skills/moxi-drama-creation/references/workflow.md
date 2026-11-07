# 工作流与规则路由

> **项目根（v2）**：规则包在 `<仓库>/rules/v2/`，脚本在 `<仓库>/scripts/`；项目数据由 moxi 工具管理（`~/Documents/Moxi/projects/<projectId>/`），**不要直接写项目数据文件**。


## 目录

- 资产位置
- 三套流程
- 步骤清单
- 规则路由
- 角色分工与模型路由

---

## 资产位置

按需读取，不要一次性全读：

| 用途 | 路径 |
|---|---|
| 流程编排 | `rules/v2/pipeline.json` |
| 通用写作规则 | `rules/v2/core-rules/`（41 个） |
| 步骤模板 | `rules/v2/steps/`（17 个） |
| 角色人格 | `rules/v2/agents/`（11 个创作角色） |
| 方法论知识库 | `rules/v2/knowledge/`（15 个） |
| 人评标尺 | `legacy-data/benchmark/human_scoring/` |

**必须排除的噪声**：

- 原项目里的第三方 Dify 运行目录与创作无关，未随本仓库分发
- `agent-definitions/` 中 `executor-backend.md`、`executor-frontend.md`、`executor-devops.md`、`executor-researcher.md` 是软件开发角色
- `step-definitions/00_page_design.md` 属于页面设计，不在创作链路

## 三套流程

按 `project_type` 选择：

**原创**（`ordered_original`）
```
project_init_check → market_check → concept → characters → beat_sheet
→ scene_list → script_draft → quality_check → compliance_check → storyboard
```

**小说 IP 改编**（`ordered_novel_adaptation`）：在 `market_check` 后插入 `novel_analysis → character_lock`

**长剧系列**（`ordered_long_series`）：去掉改编相关步骤

### ⚠️ market_check 当前实际是关闭的

文档口径上 `market_check` 是唯一硬门控：4 项二元检查，4/4 强推荐、3/4 放行、2/4 软警告、**≤1/4 硬阻断**。

但代码里它被主动禁用了：

```python
# app/routers/short_drama_writing.py:172-179
MARKET_CHECK_REJECT_VERDICT = "reject"
MARKET_CHECK_WARN_VERDICT = "warn"
CONCEPT_COMMERCIAL_SCORE_WARN_THRESHOLD = -1   # 修复32：先禁用商业性判断，设为 -1 永不触发
MARKET_CHECK_WARN_DISABLED = True
```

`step_routes.py:816`（硬阻断）与 `:834`（软警告）两个分支都写在 `and not MARKET_CHECK_WARN_DISABLED` 之后 → **恒为假，永不触发**。`:960` 的商业性警告因阈值为 -1 同样永不触发。

即：三处"看起来有门、实际开路"。若依赖 market_check 拦截不商业的选题，目前拦不住。

### ⚠️ 更糟：这段代码引用了未定义的名字，会抛 NameError

`step_routes.py` 只在 `:96` 导入了 `app.schemas.short_drama_writing`（三个 pydantic 模型），而这四个常量定义在 **`app/routers/short_drama_writing.py:172-179`**——两个是不同文件。step_routes 从未导入后者。

因此 `:816`、`:834`、`:960` 引用的是**本模块不存在的名字** → 运行时 `NameError` → **market_check 与 concept 两个步骤会 500**。

根因是重构拆分遗漏：`step_routes.py:1` 的注释写明它是"从 short_drama_writing.py 抽出"，抽出时没带上这四个常量的 import。step_routes 本身是活的（`short_drama_writing.py:711-720` include 了它，`main.py:325` 注册）。

修复方案见 `mainline-backfill.md` 第 0 步。

## 步骤清单

| 步骤 | 说明 |
|---|---|
| `project_init_check` | 锁定项目类型与格式档案，人工复核 |
| `novel_analysis` | 小说改编前置分析（条件触发） |
| `character_lock` | 角色表人工锁定，阻塞后续直到批准 |
| `market_check` | 商业性硬门控（**代码里实际已禁用**，见上） |
| `concept` | 概念规划 |
| ⛔ **concept 前置门** | **硬门，不通过不许进 `beat_sheet`**，见下 |
| `characters` | 角色卡 + 声纹卡 |
| `beat_sheet` | 分集节拍表 |
| `scene_list` | 分场表 |
| `script_draft` | 剧本初稿 |
| `quality_check` | 质检评分 |
| `compliance_check` | 合规审查 |
| `storyboard` | 分镜提示词（可选） |

### ⛔ concept 前置门（硬门，事故倒逼新增）

代码里没有任何检查阻止在 `concept` 为空时直接生成集纲。后果是**产出必然无主线**。

判例：《我的父母没素质》v1 直接排了 10 集集纲，用户看前三集问"主线是什么"——那时根本没有 concept。

**进 `beat_sheet` 之前，必须能回答这三个问题，答不出就退回去补 concept：**

1. **logline 是什么**（一句话，含主角 + 困境 + 赌注）
2. **milestones 在哪几集**（全剧至少 8-12 个锚点，且集纲必须逐条对齐）
3. **剧名的主语是谁**（命题主语——**不是主角表里的人，更不是反派**）

第 3 条最容易被跳过，也最致命。见 `checks.md`「跨集结构性检查」第 1 项。

## 规则路由

模板里的 `{{rules:xxx}}` 占位符按条件注入：

| 占位符 | 注入条件 |
|---|---|
| `{{rules:audience_rules}}` | 男频 → `male_core`+`male_style`；女频 → `female_core`+`female_style`；混合 → `hybrid_genre` |
| `{{rules:subgenre_rules}}` | 按 `subgenre_track`，或按关键词推断（"打脸/虐渣"→对应女频子赛道） |
| `{{rules:sample_track_rules}}` | 按 `sample_track`，或按关键词推断（豪门/打脸/虐渣 → track_a） |
| `{{rules:duration_char_count}}` | 无条件注入 |
| `{{rules:manga_production_2026}}` | 漫剧项目注入 |

其余 `${var}` 变量由上游产物填充（角色库、集纲、节拍表、分场表、状态卡等）。

## 角色分工与模型路由

借鉴 Story Systems 的 per-role model routing：不同性质的活由不同强度的模型承担，机械性工作交给脚本。

| 角色 | 性质 | 建议 |
|---|---|---|
| 概念 / 结构 / 评审 | 需要强推理 | 用最强模型 |
| 正文写作 | 需要语感与风格 | 用擅长长文本生成的模型 |
| 格式校验 / 字数 / 漂移检测 | 机械确定性 | **用脚本，不要用模型** |

项目已有 `DeepSeek 总导演 / Kimi 写手` 的分离实践，见 `06-docs/CODEX-DeepSeek总导演-Kimi写手用户链路审计-20260531.md`。

**关键原则**：凡是可以写正则表达式或计数器判断的，一律不给模型。模型只承担真正需要语义理解的部分——而这部分（如情绪强度）恰恰是相关性最差的（见 `quality-gate.md` 校准系数真相）。
