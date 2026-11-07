# 创作规则真源说明

`02-creation-rules/` 是墨戏生花所有创作规则、步骤定义、Agent 提示词、知识库与模板的唯一真源。

目录职责：

- `core-rules/`：跨项目通用写作规则与赛道规则
- `step-definitions/`：工作流各步骤 prompt
- `agent-definitions/`：Planner / Executor / Reviewer 等角色提示词
- `knowledge-base/`：案例提炼、规则索引、方法论文档
- `templates/`：可复用提示词模板

注意：

- 运行时代码通常从 `01-system-core/prompts/` 读取规则。
- `01-system-core/prompts/` 当前是兼容入口，内部通过符号链接指向本目录。
- 规则正文请只在 `02-creation-rules/` 下维护，避免人为造成“看起来有两套规则”的认知漂移。
