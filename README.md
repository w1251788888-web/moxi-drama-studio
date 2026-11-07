# 墨戏生花 · Moxi

> **跑在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的开源短剧创作工作台：在无限画布上，把一部短剧从一句话故事写到可导出 docx，再判断它到底能不能拍。**
>
> 底座：DeepSeek Harness（DSH）· 界面：无限画布 + 管理后台 · 数据：本机项目工作区文件 · 许可：MIT

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.5%2B-4f7cff.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-v0.1.0--exp.5-orange.svg)](CHANGELOG.md)
[![Status](https://img.shields.io/badge/status-experimental-red.svg)](#12-状态与路线)

![首页 · 墨稿创作台](assets/screenshot-home.png)

---

> 🆕 **2026-11-07 起完整开源**：本仓库现在是完整源码仓库——DSH 三个插件、规则包、技能、确定性脚本与评测集全部入库；此前实验版以安装包形式分发。许可：MIT。

## 1. 这是什么

墨戏生花（Moxi）是一个跑在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的短剧创作插件。DSH 是 DeepSeek 的本地 Agent 运行时（「一切皆插件」），墨戏生花以三个插件的形式接入它。它把「写短剧」拆成一条可复跑的流水线，全部跑在你自己的电脑上：

```
新建剧作 → 概念设定 → 角色资产 → 分集节拍 → 分场表 → 剧本
        → 确定性检查（场景头 / 字数 / 场次 / 场号 / 集号）→ 合规红线 → 质检
        → 可拍性报告（时长 / 角色 / 钩子）→ 逐集签收 → 人工放行 → 导出 docx
```

它想解决的不是「让 AI 写完一集」，而是**一部长剧怎么稳定写完、写完怎么判断能不能拍**。所以分工是：

- **写**交给模型：概念、节拍、分场、剧本、质检打分；
- **判**尽量交给确定性脚本：字数、场次、场景头格式、重复段落、合规红线、时长估算、钩子检测；
- **放行**留给人：逐集签收，加一道可配置的放行闸门。

**适合**：短剧编剧与小型工作室（批量出稿 + 质量门）、想把创作规则沉淀成资产的个人创作者、想照着写 DSH 插件的开发者。
**不覆盖**：长篇小说、非短剧体裁、纯格式转换——规则包与技能都只服务短剧。

拆到代码里是四层：

| 层 | 是什么 | 在哪里 |
|---|---|---|
| 业务内核 | `moxi-core` Host 插件：项目 / 节点 / 正文 / 检查 / 导出 / 可拍性 / 放行的唯一读写入口 | `dsh/bundles/moxi-core/` |
| 两个界面 | `moxi-canvas` 无限画布、`moxi-admin` 管理后台 | `dsh/bundles/moxi-canvas/`、`dsh/bundles/moxi-admin/` |
| 领域资产 | 规则包、创作技能、确定性检查脚本、评测集 | `rules/v2/`、`skills/`、`scripts/`、`harness/` |
| 数据 | 本机项目工作区：Markdown / JSON / JSONL，无数据库服务 | `~/Documents/Moxi/projects/` |

## 2. 功能亮点

- **无限画布**：一张画布就是一部剧。节点分 9 类（项目根 / 设定集 / 资产 / 分集节拍 / 分场表 / 剧本场次 / 质检 / 合规 / 分镜·导出），支持拖拽、缩放、连线、双击改名、撤销重做、视口持久化。
- **1–30 集一键直出**：选起止集，按「节拍 → 分场 → 剧本 → 确定性检查 → 质检 / 合规」流水线生成；进度抽屉实时显示，可取消、可续跑、断点恢复。单任务上限 30 集。
- **生成前快照**：启动生成前自动拍快照，不满意可一键「回退到生成前」（回退本身也可撤销）。
- **确定性检查**：场景头格式、净字数、场次连续、空场、重复段落、合规红线粗筛；findings 写回节点，状态机自动流转。模型只负责写与评，判定由脚本算。
- **可拍性报告**：逐集给出估算时长（对白字数 + 动作行，±25% 容差）、场次、角色对白、集末钩子、是否落在设定集内、角色出场分布；每集可人工签收，签收绑定稿件版本，改稿自动失效。
- **放行闸门**：未签收 / 签收失效 / 缺集末钩子都不放行；确需跳过必须填理由，并写入审计。
- **管理后台 5 页**：工作台 KPI、项目、规则与技能、模型与用量（含链路探针）、日志与按范围导出。
- **墨稿皮肤**：宣纸 `#F4F0E7` / 墨 `#252A2B` / 朱砂 `#A44736`，明暗两套跟随系统明暗；也可以一键切回宿主外观。
- **本机数据 + 审计**：写操作只追加进 `history/events.jsonl`；写事务走 WAL，可回滚；删除是软删，进 `.trash/` 可找回。
- **对话 / 画布双入口**：可以直接在 DSH 对话里说需求，让 Agent 调用工具；也可以在画布上手动操作。两条通道共用同一个 `moxi-core`，改的是同一份数据。

## 3. 界面截图

| 首页 · 墨稿创作台 | 无限画布 |
|---|---|
| ![首页 · 墨稿创作台](assets/screenshot-home.png) | ![无限画布](assets/screenshot-canvas.png) |
| 项目卡片、待放行 / 已放行标记；可一键切回宿主外观 | 9 类节点、节点间连线、工位条与底部状态栏 |

| 可拍性报告（逐集签收） | 放行闸门（未签收 / 缺钩子拦截） |
|---|---|
| ![可拍性报告](assets/screenshot-shootability.png) | ![放行闸门](assets/screenshot-gate.png) |
| 逐集看估算时长、场次、角色、集末钩子，并逐集签收 | 被闸门拦下时给出计数卡与具体集号，可去签收或填理由强制放行 |

![管理后台 · 工作台 KPI](assets/screenshot-admin.png)

> 截图来自实验版 v0.1.0-exp.5 的实际界面（演示项目）。

## 4. 架构

```
用户 ──对话──▶ DSH Agent ──工具（moxi_*）──▶ moxi-core ──▶ 本机项目工作区（MD / JSON / JSONL）
  └──操作──▶ 墨戏画布 / 墨戏后台 ──/api/moxi/*──▶ moxi-core
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DeepSeek Harness：会话 / Agent / 工具 / 技能 / 存储 / Web UI                │
│ 独立 profile：moxi（不动 desktop profile，不影响现有 DSH 界面）             │
├─────────────────────────┬─────────────────────────┬─────────────────────────┤
│ moxi-core（Host 插件）  │ moxi-canvas（客户端）   │ moxi-admin（客户端）    │
│ 业务唯一入口：          │ 无限画布工作台：        │ 管理后台 5 页：         │
│ 项目 / 节点 / 正文      │ 节点 / 连线 / 正文      │ KPI / 项目              │
│ 检查 / 导出 / 可拍性    │ 生成 / 可拍性           │ 规则与技能              │
│ 放行 / 审计             │ 签收 / 放行 / 导出      │ 模型与用量              │
│ 15 个 Agent 工具        │                         │ 日志与导出              │
│ 36 条同源 HTTP 路由     │                         │                         │
├─────────────────────────┴─────────────────────────┴─────────────────────────┤
│ 领域内核：rules/v2（规则包）· skills/moxi-drama-creation（技能）            │
│ scripts/（确定性检查 / 构建 / 迁移）· harness/（评测）                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 数据：本机项目工作区文件（Markdown / JSON / JSONL）                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

三个包的分工：

| 包 | 形态 | 职责 |
|---|---|---|
| `moxi-core` | Host 插件（无 UI） | 项目 / 节点 / 连线的唯一读写入口；状态机、审计、确定性检查、导出、可拍性报告、放行闸门；对 Agent 暴露 15 个工具，对前端提供 36 条 `/api/moxi/*` 同源路由。 |
| `moxi-canvas` | Host 半（薄路由）+ Client 半 | 无限画布 UI：项目列表、画布、节点正文、生成进度、可拍性、逐集签收、人工放行、导出。 |
| `moxi-admin` | Host 半（薄路由）+ Client 半 | 管理后台 5 页。 |

几条设计约定：

- 客户端只依赖 DTO（`/api/moxi/*` 的 JSON），不 import Host 代码。
- 阈值与判定口径放在 `rules/`、`skills/`，不写死在插件代码里。
- 每次写操作都进审计事件流；状态机不可跳步，非法迁移返回 `E_TRANSITION`。
- 颜色与文案走「工位 / 创作记录 / 待放行 / 人工放行」的产品语，界面不暴露节点、任务这类工程术语。

## 5. 目录结构

```text
moxi-drama-studio/
├── README.md
├── LICENSE                          # MIT
├── CHANGELOG.md                     # 版本变更记录
├── assets/                          # 界面截图
├── dsh/
│   ├── profile/
│   │   ├── install.sh               # 源码安装 / 卸载（profile: moxi）
│   │   ├── install-desktop.sh       # 可选：装成本地应用（macOS）
│   │   └── cordis.patch.yml         # profile 覆盖层示例（改 projectsRoot 等）
│   ├── launcher/                    # 本地应用外壳资源（图标 / 启动脚本）
│   └── bundles/
│       ├── moxi-core/               # Host 插件：index.js + lib/（store / checks / export / generate / shootability …）
│       ├── moxi-canvas/             # 客户端插件：src/*.jsx + 构建产物 client.js
│       └── moxi-admin/              # 客户端插件：src/*.jsx + 构建产物 client.js
├── rules/v2/                        # 规则包 v2：94 篇 Markdown + 清单/配置（96 个文件 + manifest.json）
├── skills/moxi-drama-creation/      # 创作技能 v2（SKILL.md + references/ + scripts/check_episode.py）
├── scripts/                         # 客户端构建 / 规则包校验 / 辅助脚本
├── harness/                         # Harness² eval v1：6 个合成任务 + 确定性 grader
├── docs/
│   ├── adr/                         # 架构决策记录
│   ├── 设计/                        # 数据契约、后台信息架构、前端接口契约
│   ├── 选型/                        # 画布集成面勘察（DSH 客户端插件实测）
│   └── 部署与回滚.md
└── tooling/
    └── package.json                 # 构建依赖（esbuild），供 scripts/build-client.mjs 使用
```

值得先读的文档：

| 文档 | 内容 |
|---|---|
| [`docs/adr/001-目标架构.md`](docs/adr/001-目标架构.md) | 五平面、数据契约、Host API、工具契约与取舍 |
| [`docs/设计/数据契约-v1.md`](docs/设计/数据契约-v1.md) | 目录 / JSON / 状态机 / 事件 / 错误码 / 事务与崩溃恢复 |
| [`docs/设计/后台信息架构.md`](docs/设计/后台信息架构.md) | 后台 5 页 IA 与视觉规范 |
| [`docs/设计/前端接口契约.md`](docs/设计/前端接口契约.md) | 画布 / 后台与 Host 的接口约定 |
| [`docs/选型/画布-集成面勘察.md`](docs/选型/画布-集成面勘察.md) | DSH 客户端插件集成方式与实测结论 |
| [`docs/部署与回滚.md`](docs/部署与回滚.md) | 安装、升级、回滚、故障排查 |
| [`rules/v2/README.md`](rules/v2/README.md) | 规则包结构、目录分类与校验方式 |
| [`skills/moxi-drama-creation/SKILL.md`](skills/moxi-drama-creation/SKILL.md) | 技能入口：分工原则、判定口径、工作流 |
| [`harness/README.md`](harness/README.md) | Harness² 评测框架与跑法 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本变更记录 |

## 6. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| DeepSeek Harness | **≥ `0.2.1-rc.5`** | 三个 bundle 的 `dsh.compatibility` 均声明 `0.2.1-rc.5+`；先确认 `dsh --version` 可用 |
| Node.js | `^22.19.0 \|\| >=24.0.0` | DSH CLI 与源码构建使用；安装前用 `node --version` 检查 |
| Python | 3（可选） | 仅导出 `docx` 需要 `python-docx`；缺失时自动降级为 md，并在结果里写明原因 |
| 操作系统 | macOS / Linux / Windows 10/11 | 源码安装脚本是 bash（Windows 可用 Git Bash / WSL，或直接用预编译包） |
| 模型 | DeepSeek API Key（或已在 DSH 里登录账户） | 生成走 DSH 的 llm 服务，provider / model 可在 profile 里配置 |

## 7. 安装

两种方式二选一：**源码安装**（可改代码、可看规则，推荐）或**预编译包**（省去构建步骤）。

### 7.1 源码安装（macOS / Linux）

```bash
git clone https://github.com/w1251788888-web/moxi-drama-studio.git
cd moxi-drama-studio

# 1) 安装：创建独立 profile「moxi」，挂载三个 bundle
bash dsh/profile/install.sh

# 2) 可选：同时安装技能（默认不会覆盖 ~/.dsh/skills 里已有的技能）
MOXI_INSTALL_SKILL=1 bash dsh/profile/install.sh

# 3) 启动
dsh --profile moxi
```

`install.sh` 做了四件事：

1. 若 `~/.dsh/profiles/moxi` 不存在，用 DSH 自带的 `web` 模板创建；
2. 用 `dsh plugin add` 本地挂载 `moxi-core` / `moxi-canvas` / `moxi-admin` 三个 bundle；
3. 按需安装技能（`MOXI_INSTALL_SKILL=1`）：会先备份已有的技能目录（包括符号链接指向的真实内容），默认跳过；
4. 校验三个 bundle 都已挂载。

安装**不会动** `desktop` profile，你现有的 DSH 界面不受影响。想换 profile 名：`MOXI_PROFILE=my-moxi bash dsh/profile/install.sh`。

启动后终端会打印一个带 token 的地址（形如 `http://127.0.0.1:<port>/?token=...`），浏览器打开它；左侧栏会出现「墨戏画布」与「墨戏后台」两个入口。

> Windows：源码安装需要 bash 环境（Git Bash 或 WSL）。不想配 bash 的话，用下面的预编译包。

### 7.2 预编译发行包（不想自己构建时）

最新预编译版：**v0.1.0-exp.5**（实验版，prerelease），发布页：<https://github.com/w1251788888-web/moxi-drama-studio/releases/tag/v0.1.0-exp.5>

| 平台 | 下载直链 | 说明 |
|---|---|---|
| Windows 10/11 | [moxi-studio-exp-0.1.0-exp.5.zip](https://github.com/w1251788888-web/moxi-drama-studio/releases/download/v0.1.0-exp.5/moxi-studio-exp-0.1.0-exp.5.zip) | 推荐，系统自带解压 |
| macOS（Intel / Apple Silicon） | [moxi-studio-exp-0.1.0-exp.5.tar.gz](https://github.com/w1251788888-web/moxi-drama-studio/releases/download/v0.1.0-exp.5/moxi-studio-exp-0.1.0-exp.5.tar.gz) | 也可用 zip，内容一致 |
| Linux | 同上 tar.gz | 未正式验证，逻辑与 macOS 一致 |

**Windows**

1. 解压 zip；
2. 双击 `install-exp.cmd`；若 PowerShell 执行策略拦截，用
   `powershell -ExecutionPolicy Bypass -File .\install-exp.ps1`；
3. 之后双击桌面的「墨戏生花」快捷方式，或命令行 `dsh --profile moxi-exp`。

**macOS / Linux**

```bash
tar xzf moxi-studio-exp-0.1.0-exp.5.tar.gz
cd moxi-studio-exp-0.1.0-exp.5
bash install-exp.sh
dsh --profile moxi-exp
```

预编译包默认使用 profile `moxi-exp`，与源码安装的 `moxi` 可以并存、互不影响。预编译包只是「已经构建好的版本」——想改代码、读规则，请用源码安装。

### 7.3 卸载与升级

卸载（**都不会删除项目数据**，数据仍在 `~/Documents/Moxi/projects`）：

```bash
# 源码安装
bash dsh/profile/install.sh --uninstall

# 预编译包
dsh plugin --profile moxi-exp remove moxi-core-bundle moxi-canvas-bundle moxi-admin-bundle
```

升级（源码安装）：

```bash
git pull
npm install --prefix tooling      # 仅在构建依赖有变化时需要
node scripts/build-client.mjs     # 客户端源码有变化时
bash dsh/profile/install.sh
# 然后重启 dsh --profile moxi
```

预编译包升级：下载新 Release 后重跑安装脚本即可。数据文件带 `schemaVersion` 字段；跨版本升级前建议先备份项目目录。

### 7.4 可选：装成本地应用（macOS）

不想每次开终端、开浏览器的话，可以再装一个本地应用外壳：

```bash
bash dsh/profile/install.sh            # 先装插件
bash dsh/profile/install-desktop.sh    # 再装本地应用
```

装好后双击 `~/Applications/墨戏生花.app`：它会自动拉起本地服务（`127.0.0.1:59911`），并用应用窗口打开（无地址栏 / 标签页）。`install-desktop.sh --check` 做依赖自检，`--uninstall` 卸载（项目数据不动）。依赖：本机有 Chrome（`install-desktop.sh` 也会探测 ego lite）、python3、node、dsh。

## 8. 使用

### 8.1 快速上手

1. 侧栏 →「墨戏画布」→ **「+ 新开一部剧」**：填剧名、集数、受众（男频 / 女频 / 混合）、题材、一句话故事；
2. 工具栏 → **「生成」**：选起止集（单任务上限 30 集，建议先跑 3 集试试）。进度抽屉会实时显示每集的阶段，可取消，失败集可续跑；
3. 生成完成 → 工具栏 **「可拍性」**：逐集看估算时长、场次、角色、集末钩子、是否在设定集内，然后**逐集签收**；
4. 点 **「人工放行」**：没签收 / 签收失效 / 缺钩子会被拦下，弹窗给出具体集号；
5. 点 **「导出」**：拿到 docx（或 md / txt）。

> 也可以完全对话驱动：在 DSH 对话里直接说「新建一部 30 集女频甜宠，女主叫苏璃，一句话故事是……」，Agent 会调用 `moxi_*` 工具完成同样的操作。画布与对话共用同一个 `moxi-core`，改的是同一份数据。

### 8.2 可拍性报告与逐集签收

工具栏「可拍性」打开报告，逐集给出：

| 字段 | 含义 |
|---|---|
| 估算时长 | 对白字数 + 动作行，按项目口径折算（±25% 容差）。是估算，不是秒表 |
| 场次 | 该集场次数 |
| 角色 | 有对白的角色；「陌生角色」指说话人不在设定集角色表里 |
| 集末钩子 | 文本特征检测（悬念 / 反转 / 危机收尾），并给出最后一句原文供人复核 |
| 是否在设定集内 | 对白人物与设定集角色表的比对结果 |
| 签收 | 未签收 / 已签收 / 已签收（改稿失效） |

签收规则：

- 签收**绑定当前稿件版本**；签收之后再改稿，旧签收自动标记为失效（stale），需要重新签收；
- 支持撤回签收；
- 报告可「下载 md」；Agent 也可以调 `moxi_shootability` 生成同样的报告。

> 可拍性是**辅助判断**：时长是估算，钩子是文本特征检测，不能替代真人对白计时、场地与演员可行性的判断。

### 8.3 放行闸门（实验版默认开启）

| 拦截条件 | 说明 |
|---|---|
| 未签收 | 每集都要人工签收 |
| 签收失效 | 签收后改过稿，自动失效 |
| 缺集末钩子 | 检测不到悬念 / 反转 / 危机收尾 |

被拦下时接口返回 `E_RELEASE_GATE`，`details` 里带未签收 / 签收失效 / 缺钩子的**集号列表**；画布会弹出明细（三张计数卡 + 集号），你可以：

- **去可拍性页签收**：补齐签名后再放行；或
- **强制放行（需理由）**：理由必填（≤300 字），会写入审计事件 `project.release.forced`，并在项目里落盘 `releaseForced` 记录。

闸门开关在 profile 的 `moxi-core` 配置里：

- `releaseGateRequireSignoff`：是否要求每集已签收（默认 `true`）；
- `releaseGateRequireHook`：是否要求每集有集末钩子（默认 `true`）。

写法参考 [`dsh/profile/cordis.patch.yml`](dsh/profile/cordis.patch.yml)：给 `moxi-core` 加一段 `config` 即可。

### 8.4 导出

- 格式：`md` / `txt` / `docx`；`docx` 需要 Python 3 + `python-docx`，缺依赖时自动降级为 md，并在结果里写明原因；
- 后台「日志与导出」页可按项目 + 集范围导出（from / to 留空 = 整部项目）；
- 导出完成弹窗：在系统中定位文件 / 下载副本 / 复制路径（定位仅限项目 `exports/` 目录内的文件）；
- 若还有失败集，先续跑或修复，再导出。

### 8.5 管理后台

| 页 | 内容 |
|---|---|
| 工作台 | KPI（项目数 / 节点数 / 已生成集数 / 总字数 / 待审 / 已批准 / 阻塞 / 草稿）+ 最近生成任务；数字同源 `/stats` |
| 项目 | 项目表（含统计列）+ 打开画布 + 导出 docx + 删除项目 |
| 规则与技能 | 扫描 `rules/v2/`：文件数、分类与重新扫描 |
| 模型与用量 | 当前默认模型、可选模型列表、链路探针（实测延迟）、最近任务模型 |
| 日志与导出 | 审计日志（按 op 过滤）、按范围导出、生成任务表（可取消） |

### 8.6 遇到问题

| 现象 | 原因 / 处置 |
|---|---|
| 侧栏没有「墨戏画布」 | bundle 未挂载：`dsh --profile moxi --dump-config \| grep moxi` 检查，重跑 `bash dsh/profile/install.sh` |
| 面板空白 + 控制台 `slot entry crashed` | 客户端产物损坏：`node scripts/build-client.mjs` 后刷新页面 |
| `/api/moxi/*` 返回 not found | Host 半未加载：看启动日志里 `moxi-core ... failed to import`；确认 bundle 语法 |
| 面板显示「项目列表读取失败」 | `moxi-core` 的项目根不可写：检查目录权限或 `MOXI_PROJECTS_ROOT` |
| 导出 docx 变成 md | 本机缺 `python-docx`：`pip install python-docx` |
| 端口被占用 | 换端口：`dsh --profile moxi --no-open --port 59912` |
| Windows 弹 `MOXI — Windows cannot find 'MOXI'` | 不要在 Win+R 运行框里输产品名；双击桌面「墨戏生花」快捷方式，或命令行 `dsh --profile moxi-exp` |
| 装完没有快捷方式 | 双击安装目录里的 `start-moxi.cmd`，或命令行 `dsh --profile moxi-exp` |
| 其它问题 | 双击安装目录里的 `DIAGNOSE.bat`（Windows），把桌面生成的 `moxi-diagnose.txt` 贴到 Issue |

## 9. 数据与隐私

### 9.1 数据在哪

默认根目录：`~/Documents/Moxi/projects/`。单个项目工作区长这样：

```text
~/Documents/Moxi/projects/
├── <projectId>/
│   ├── project.json          # 项目元数据（schema v1）
│   ├── canvas.json           # 画布：nodes[] + edges[] + viewport + rev
│   ├── content/<nodeId>.md   # 节点正文（Markdown）
│   ├── assets/               # 角色 / 场景 / 道具等附件
│   ├── history/events.jsonl  # 追加式审计事件流（唯一变更日志）
│   ├── versions/<nodeId>/    # 版本快照
│   └── exports/              # 导出产物（docx / md / txt）
└── .trash/                   # 软删的项目（带时间戳，可搬回）
```

- 换目录：设置环境变量 `MOXI_PROJECTS_ROOT`，或在 profile 里给 `moxi-core` 配 `projectsRoot`（留空 = 先取环境变量，再回落到默认值）；
- 备份：直接复制整个 `projects` 目录即可；
- 误删找回：删除是软删，项目被移到 `.trash/<projectId>.<时间戳>/`，搬回来就行；
- 崩溃恢复：写事务走 WAL，打开项目时会自动 recover（回滚或前滚）。

### 9.2 隐私

- **没有云端后端、没有数据库服务、没有遥测**：除调用你配置的模型外，数据不出本机；
- 模型调用复用 DSH 的 llm 服务：密钥由 DSH profile 管理，插件不保存密钥、不直接发 HTTP；
- 生成时，稿件内容会发送给你选择的模型 provider——敏感项目请自行评估；
- 导出文件、审计日志都在本机项目目录内，可随时查看或删除；
- 生成内容由大模型产出，发布前请自行完成内容审核与合规审查。

## 10. 规则包与技能

### 10.1 规则包 `rules/v2/`

短剧创作的规则真源：**96 个文件**（94 篇 Markdown + `pipeline.json` / `pipeline.toml`），另有 `manifest.json` 作为机器可读索引。

| 目录 | 内容 |
|---|---|
| `core/` | 5 篇核心规则：格式、钩子、关系、节奏、写作逻辑 |
| `core-rules/` | 36 篇：赛道、受众、合规、节奏、样板赛道等规则 |
| `steps/` | 17 个步骤模板（概念 → 角色 → 集纲 → 节拍 → 分场 → 剧本 → 质检 → 合规） |
| `agents/` | 12 个 Agent 提示词（Planner / Executor / Reviewer / 合规审查） |
| `knowledge/` | 15 篇知识库：公式库、词典、矩阵、RAG 卡片 |
| `templates/` | 4 个可复用模板 |

规则可以按需修改，改完跑一次确定性校验：

```bash
python3 scripts/rules_lint.py     # 五项检查全部通过时 exit 0
```

### 10.2 技能 `skills/moxi-drama-creation/`

分工原则：**Agent 负责「写」，技能负责「判」**。

- `SKILL.md`：入口，含工作流、硬规则、放行判定口径；
- `references/`：7 篇——`workflow` / `quality-gate` / `numeric-conflicts` / `checks` / `canon-overrides` / `known-issues` / `mainline-backfill`；
- `scripts/check_episode.py`：纯标准库、零依赖的逐集检查脚本。

一集放行必须**同时**满足（任一不满足即打回）：

1. `benchmark_total ≥ 75`
2. `continuity_total ≥ 70`
3. `hard_reject_codes` 为空
4. `hook_diversity_pass = true`

模型只输出分数与证据，**verdict 由脚本算**。

安装技能（源码安装时）：

```bash
MOXI_INSTALL_SKILL=1 bash dsh/profile/install.sh
# 或手动复制
cp -R skills/moxi-drama-creation ~/.dsh/skills/
```

`install.sh` 在技能目录已存在时会先备份（普通目录备份成 `*.bak.<时间戳>`；符号链接则先备份链接目标的真实内容），默认不覆盖。

手动跑逐集检查：

```bash
python3 skills/moxi-drama-creation/scripts/check_episode.py \
  --file "/abs/path/第01集.md" \
  --protagonists "陆时,苏芮"
# 退出码 1 = 有硬失败，必须修完再提交
```

### 10.3 评测集 `harness/`

`harness/` 是 Harness² 的本地评测集：6 个合成任务（E1–E6）+ 74 项确定性检查的 grader，纯标准库、离线、不调用模型。

```bash
python3 harness/graders/grade.py --selftest   # 正例必须 PASS、反例必须 FAIL
```

完整的跑法与预算模板见 [`harness/README.md`](harness/README.md)。

## 11. 二次开发与构建

### 11.1 三个包怎么改

- **Host 插件** `moxi-core`：`index.js` + `lib/*.js` 是运行时代码，改完重启实例生效；可用 `node --check dsh/bundles/moxi-core/index.js` 做语法检查。
- **客户端插件** `moxi-canvas` / `moxi-admin`：`src/*.jsx` 是源码，`client.js` 是构建产物（DSH ModuleLoader 形态），改完必须重新构建。

### 11.2 构建客户端

```bash
npm install --prefix tooling          # 一次性：安装 esbuild（版本见 tooling/package.json）
node scripts/build-client.mjs         # 构建全部客户端 bundle
node scripts/build-client.mjs moxi-canvas   # 只构建指定 bundle
bash dsh/profile/install.sh           # bundle 元信息有变化时重新 link
```

开发模式（不自动打开浏览器、固定端口）：

```bash
dsh --profile moxi --no-open --port 59911
# 改客户端 → 刷新页面；改 Host → 重启实例
```

### 11.3 自测命令

```bash
python3 scripts/rules_lint.py                  # 规则包五项确定性检查
python3 harness/graders/grade.py --selftest    # eval grader 正 / 反例自测
node --check dsh/bundles/moxi-core/index.js    # Host 插件语法检查
```

### 11.4 贡献约定

- 客户端只依赖 DTO（`/api/moxi/*` 的 JSON），不要 import Host 代码；
- 阈值与判定口径放 `rules/`、`skills/`，不要写死在插件代码里；
- 改规则包后跑 `scripts/rules_lint.py`；改技能判定后跑 `check_episode.py`；
- 提 PR 前请重新构建客户端产物（`node scripts/build-client.mjs`），并确认自测命令通过。

## 12. 状态与路线

**当前是实验版（experimental）。** 功能可用，但不保证稳定：接口、数据格式与界面都可能调整，升级前请先备份项目数据。

| 项 | 值 |
|---|---|
| 最新预编译版 | `v0.1.0-exp.5`（prerelease） |
| `moxi-core` bundle | `0.2.0` |
| `moxi-admin` bundle | `0.2.0` |
| `moxi-canvas` bundle | `0.1.0-spike`（画布仍是 spike 形态，接口可能调整） |
| 许可 | MIT |

开发过程中在开发机上做过这些验收：30 集一键直出（30/30，0 失败）、跨题材 30 集验收、四轮交叉审查、数值一致性核对（0 偏差）。这些是实验版的能力边界，**不是生产级保证**。

已知限制（如实登记）：

| # | 限制 | 影响 |
|---|---|---|
| 1 | 只在干净 profile 上验证过安装，未在干净操作系统上完整复验 | 新机器首装可能需要自己补 Node / Python 依赖 |
| 2 | 撤销 / 重做覆盖画布操作，不覆盖生成任务整体 | 整批回退请用「回退到生成前」快照 |
| 3 | 100 集量级未压测（30 集、157 个节点的项目验证流畅） | 超长项目可能卡顿 |
| 4 | 技能默认不安装，也不改动你已有的 `~/.dsh/skills` | 想用技能需手动开启 `MOXI_INSTALL_SKILL=1` 或复制 |
| 5 | 可拍性时长与钩子都是估算 / 文本特征检测 | 不能替代真人计时与场地、演员可行性判断 |
| 6 | AI 合规评审是建议级，不参与放行闸门 | 红线由确定性规则表判，非红线高风险需人工确认 |
| 7 | Windows 安装脚本与路径做了兼容处理，但未在真实 Windows 机器上完整实测 | 遇到问题请开 Issue，附 `moxi-diagnose.txt` |

后续方向（按优先级）：

1. 干净操作系统上的安装复验；
2. 撤销 / 重做覆盖生成任务整体；
3. 100 集量级压测与性能优化；
4. Harness² baseline 实跑，把评测结果沉淀成演化基线；
5. 技能与 DSH 技能服务的正式集成流程。

版本变更见 [`CHANGELOG.md`](CHANGELOG.md)。

## 13. 许可与友链

本项目以 **MIT License** 开源，完整条款见 [`LICENSE`](LICENSE)：

```text
Copyright (c) 2026 龙樆 / 墨戏生花 (Moxi) contributors
```

- 本仓库不包含 DeepSeek Harness 本体；DSH 及其依赖遵循其各自的许可证；
- 构建依赖 `esbuild` 仅用于开发时打包客户端，遵循其自身许可证；
- 第三方与历史来源（含早期版本 OpenMOSS 署名）说明见 [`NOTICE.md`](NOTICE.md)；
- 生成内容由大模型产出，发布前请自行完成内容审核与版权、合规核查。

**友链**

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：一个「一切皆插件」的 Agent 底座，墨戏生花就跑在它上面；
- [LINUX DO](https://linux.do)：真诚、友善、团结、专业的开发者社区——项目在这里和佬友交流、收集反馈。

**反馈与参与**

欢迎开 [Issue](https://github.com/w1251788888-web/moxi-drama-studio/issues) 和 PR。报 Bug 请附：系统版本、`dsh --version`、复现步骤；Windows 用户可附 `moxi-diagnose.txt`。请勿在 Issue 里附带真实项目文稿或任何敏感数据。

本项目是个人开源项目：没有站点，不设群组，不接收打赏。
