# 墨戏生花规则包 v2

> `project.json.rulesPack = "rules/v2"`；机器可读索引见 [`manifest.json`](manifest.json)，节点编排见 [`pipeline.json`](pipeline.json)。

## 这是什么

短剧创作的规则真源：**96 个文件**（94 篇 Markdown + `pipeline.json` / `pipeline.toml` 两个清单；`manifest.json` 为索引，不计入）。
v2 内容迁移自作者本地生产规则包，只调整目录位置与路径引用，不改规则语义、数字、评分线与阈值。

## 目录结构

```text
rules/v2/
├── README.md / manifest.json / pipeline.json / pipeline.toml
├── system.md / rhythm.md / hooks.md      # 全局提示词与片段
├── source-README.md                      # 源规则包 README 归档
├── core/            # 5 篇核心规则（格式 / 钩子 / 关系 / 节奏 / 写作逻辑）
├── core-rules/      # 36 篇赛道、受众、合规、节奏、样板赛道等规则
├── steps/           # 17 个步骤模板（概念 → 角色 → 集纲 → 节拍 → 分场 → 剧本 → 质检 → 合规）
├── agents/          # 12 个 Agent 提示词（Planner / Executor / Reviewer / 合规审查）
├── knowledge/       # 15 篇知识库（含 rag_cards 4 篇）
└── templates/       # 4 个可复用模板
```

## 怎么用

- 运行时：`moxi-core` 扫描本目录的 `*.md` 构建规则索引，并读 `pipeline.json` 做节点编排；
  `pipeline.toml` 只作旧引擎兼容 / 溯源。
- 规则名 = 文件 stem；规则名与路径映射、路由别名见 `manifest.json` 的 `rules` / `ruleAliases`。

## 校验

```bash
python3 scripts/rules_lint.py     # 五项确定性检查（manifest 同步 / H1 / pipeline 引用 / 交叉引用 / 重名），exit 0 为通过
```

## 说明

- 本包为作者整理与创作的短剧创作规则，不包含第三方剧本文本；早期归档的第三方知识库清单（`dify-rag/`）**未随本仓库分发**。
- 若正文引用了他人的方法论或课程资料，已在对应文档中标注来源；权利人如认为存在不当引用，请通过 Issue 联系删除或改写。
