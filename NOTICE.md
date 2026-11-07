# NOTICE · 第三方与历史来源说明

本项目采用 **PolyForm Noncommercial License 1.0.0** 分发（个人非商业使用免费；商业使用需作者书面授权，见 [`LICENSE`](LICENSE) 与 `docs/使用说明.md`）。以下为需要保留的署名与来源说明。

## 早期版本与上游

- 墨戏生花 v1（FastAPI + Vue3 Web 单体）基于 [OpenMOSS](https://github.com/uluckyXH/OpenMOSS)（MIT License，
  Copyright (c) 2026 小黄、动动枪）定制；本项目当前的 v2 面向 DeepSeek Harness 重写，
  但规则包与创作技能的早期素材可能源自作者在 v1 时期的整理，故在此保留上述版权声明与 MIT 许可署名（该部分历史内容仍遵循 MIT）。

## 运行时与依赖

- 本项目不包含 DeepSeek Harness（DSH）本体；DSH 及其依赖遵循其各自的许可证。
- 客户端插件的构建依赖 `esbuild`（MIT License），仅作为 `tooling/package.json` 的 devDependency，
  不随仓库分发其 `node_modules`。
- 仓库中的界面截图、图标（`dsh/launcher/`）、规则包与技能文本由本项目作者制作或整理，
  若引用了第三方资料，已在对应文档内标注来源；发布或再分发前请自行核对相关内容的使用授权。

## 商业使用

商业用途不包含在免费许可内，需取得作者书面授权；申请方式见 [README 第 13 节](README.md#13-许可使用说明与友链) 或 [`docs/使用说明.md`](docs/使用说明.md)。

## 内容声明

- 规则包 `rules/v2/` 与技能 `skills/moxi-drama-creation/` 中的行业知识、方法论与案例，部分为作者个人学习与
  实践整理，可能参考过公开资料或课程材料。若相关权利人认为存在不当引用，请通过 Issue 联系，
  我们会删除或改写相应内容。
