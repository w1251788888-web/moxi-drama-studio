# Harness² 经验库（v1）

> 规则：**一条只写一个可迁移 cue**；必须带来源与反例；空话不收。
> 状态词表：`seed`（来自外部/历史经验，本项目未验证）→ `verified`（本机 run 复现过，附 run id）→ `rejected`（复现失败，写清反例）。

## 0. 格式

```
## CUE-NNN · <一句话 cue>
- 状态：seed | verified | rejected
- 来源：<run id / 文档 / 旧项目实测>
- 适用 surface：c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8（可多选）
- cue：<可迁移的一句话规律>
- 证据：<数字/现象/失败项，可复跑的命令>
- 反例/边界：<什么时候不成立>
- 验证方式：<怎么在本项目复核>
```

写入纪律：

- 一条 cue 只描述**一个**可迁移规律；不要把「怎么跑 eval」和「模型偏好」写进同一条。
- 只写「本次 run 真的观察到」的东西；没跑过的一律 `seed`，不许冒充 `verified`。
- 被推翻的 cue **不删**，改 `rejected` 并写反例——这比新增一条更有价值。

---

## 1. 种子 cue（来自旧项目 harness2-dsh 的实测摩擦，本项目未验证）

## CUE-001 · DSH 会话会把自身 profile 泄漏给子进程
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #1（2026-11-01 本机实测）
- 适用 surface：c5 / c8
- cue：从 DSH 会话里 `subprocess` 起新的 `dsh` 时，必须显式换掉继承来的 `DSH_PROFILE`（Web 会话里是 `web`），否则会 boot 错应用并报 `error: too many arguments`。
- 证据：h2d substrate 用独立 env 名 pin profile，并 scrub 除 `DSH_HOME` 外的所有 `DSH_*`。
- 反例/边界：在普通 shell 里手动起 `dsh --profile moxi` 不受影响。
- 验证方式：S3 接 rollout 执行器时，子进程 env 里断言 `DSH_PROFILE` 不是父会话值。

## CUE-002 · 会话目录会跨 boot 复用，快照父目录会漏 run
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #2
- 适用 surface：c7
- cue：`~/.dsh/sessions/<encoded-cwd>/` 是复用目录，真正每次新的是其下的 `<session-id>/` 子目录；快照/采集必须点对点取子目录。
- 证据：h2d 第一版快照父目录时，从第二次 run 起全部漏采。
- 反例/边界：无。
- 验证方式：跑一轮 3 draw 后，统计采集到的 session 目录数量应 = 18（+ 重试）。

## CUE-003 · 用户全局 AGENTS.md 与用户 skills 会混进每次 run
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #3
- 适用 surface：c1 / c3 / c6
- cue：测「harness 的效果」时必须 pin `agent-instructions.dshHome` 与 `skill-filesystem.customSkillDirs`，否则测的是这台机器，不是 harness。
- 证据：h2d 不 pin 时每轮都带上用户全局 AGENTS.md + 12 个用户 skill。
- 反例/边界：如果目标就是「桌面用户真实环境」，则不要 pin，但要记录环境版本。
- 验证方式：S3 跑 baseline 前，dump-config 里核对这两个 row 的来源目录。

## CUE-004 · patch 是整行替换，不 merge；未知 id 会被静默丢弃
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #4
- 适用 surface：c1 / c2 / c8
- cue：`dsh --patch` 替换整行 `config` 而非合并；复制基础行再改一个 key 是必须的；未知 id 不一定报错。
- 证据：h2d 的 `dsh.validate_patch` 要求显式 known-id 检查，`--dump-config` 退出码 0 不代表 patch 生效。
- 反例/边界：无。
- 验证方式：`dsh --patch <file> --dump-config` 后，grep 目标 id 与关键字段，而不只看 exit code。

## CUE-005 · 脆弱的 grader 会静默反转结论
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） 「caution from building this」（history: 71% vs 86% → 反转）
- 适用 surface：c7
- cue：grader 的第一版几乎一定会「为了过题而写」，必须先用正例（必须过）+ 反例（必须不过）自测，再看它给出的是不是人想要的结论。
- 证据：h2d 第一版 checker 把所有 markdown 表格行合并统计，导致被采纳的 harness 看起来比 base 更差；改成按表格块解析后结论反转。
- 反例/边界：无——这是 grader 设计的基本纪律，不是可选项。
- 验证方式：本项目 `grade.py --selftest`（6 任务正/反例 + E5 fixture 口径断言）；新增任务必须同时加正例和反例。

## CUE-006 · DSH 不提供按会话美元成本
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #8 + 内部模型链路记录
- 适用 surface：c5 / c7
- cue：ledger 必须用 `wallClock / turns / toolCalls / model` 计量，禁止编造 `usd` 字段。
- 证据：h2d 明确写「No cost accounting」；本项目 `manifest.yaml#budget.usd = null`。
- 反例/边界：若未来接入了按 token 计费的 provider 且能拿到账单，再新增 `usd` 字段并标明来源。
- 验证方式：ledger 校验脚本断言每行没有 `usd` 字段。

## CUE-007 · 单次满分不构成证明
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） repeat 实验结果（base 19/21，adopted 21/21）
- 适用 surface：c5 / c7
- cue：k=1 的 7/7 是噪声；至少 k=3，改看**中位数与最差项**，并且区分「新增能力」还是「一致性提升」。
- 证据：h2d 的 base 三轮 7/7、6/7、6/7，单次看不出差异。
- 反例/边界：k=3 也不是统计显著，只够判断方向。
- 验证方式：`runs/v1-baseline.md` 的 k=3 记录表。

## CUE-008 · 模型默认「只回复不落盘」
- 状态：seed
- 来源：Harness² 早期实践笔记（未随仓库分发） frictions #6
- 适用 surface：c1 / c4
- cue：要求 Agent 改文件时，prompt 必须显式说「就地写文件，不要贴内容」；否则会话可能只回一段文本，评估器会把它记成 no-op。
- 证据：h2d 的 improver 两个 probe 都编辑了文件，但 reply-only session 会静默记录 `kept_base`。
- 反例/边界：无。
- 验证方式：本项目 6 个 eval 的 prompt 都写死了 output.path（如 E1→`project.json`），grader 找不到文件直接 fail。

## 2. 本项目结构产生的 cue（seed，待首轮 baseline 验证）

## CUE-009 · 付费墙节点存在两套口径，eval 必须站一边
- 状态：seed
- 来源：`moxi-drama-creation/02-creation-rules/step-definitions/00_project_init_check.md` §检查5 vs `03_beat_sheet.md` 双付费墙段；本项目 `manifest.yaml#RPC-2`
- 适用 surface：c3 / c6 / c7
- cue：同一业务规则在多份规则文件里给出不同公式时，eval 必须显式选一个权威口径并写进题面，否则 grader 的判定不可复现。
- 证据：00 检查用 `round(episode_count×0.3)`；03 用固定「第 8–12 集」+ `round(ep×0.8)`（<30 集压缩）。12 集制下两者对节点 A 给出 3–5 集 vs 8–12 集。
- 反例/边界：如果 S3 裁定 00 为唯一权威，则 E3 的 paywall 校验需整体换口径并 bump evalVersion。
- 验证方式：E3 的 `E3.paywall` / `E3.paywall_flags` 两个 check；Lead 裁定后改 `E3_beat_sheet.json#expected.paywall`。

## CUE-010 · 两套钩子分类不能互证
- 状态：seed
- 来源：`step-definitions/03_beat_sheet.md`（5 种钩子公式）vs `core-rules/core/hook-patterns.md`（5 主类 + H1–H11）；本项目 `manifest.yaml#RPC-3`
- 适用 surface：c3 / c6
- cue：两个分类体系并存时，eval 要分字段分别校验，禁止做「H4 = 危机钩子」这种映射，那是发明规则。
- 证据：03 的 5 类是 悬念/反转/情感/信息/危机；hook-patterns 的 5 主类是 悬念/关系/代价/升级/反转，且 H4 归属「代价型」。
- 反例/边界：若 S3 统一为单一分类，删除其中一个字段并 bump evalVersion。
- 验证方式：E3 分别校验 `hooks.type`（5 公式）与 `hooks.subtag`（H1–H11），不做交叉断言。

## CUE-011 · 确定性检查阈值会与创作规则漂移
- 状态：seed
- 来源：`moxi/dsh/bundles/moxi-core/lib/checks.js`（C006 单场 <50）vs `step-definitions/05_script_draft.md`（单场 <150 判废）；本项目 `manifest.yaml#RPC-4`
- 适用 surface：c4 / c7
- cue：生产侧检查器与规则包的阈值必须由同一个 eval 口径兜住；否则「确定性检查通过」不等于「规则合格」。
- 证据：E5 按规则包 150 字判 C006；moxi-core 实现目前是 50。
- 反例/边界：阈值属于产品口径，需要 Lead 裁定；eval 不能单方面改生产实现。
- 验证方式：S3 校准时同时跑 `moxi_core checkNode` 与 `grade.py --task E5`，对同一批 fixture 输出对齐。

## CUE-012 · 隔离验收项目是 eval 的一等公民
- 状态：seed
- 来源：方法论 §3.4「任务集与验收项目隔离」；本项目 `grade.py --audit-isolation`
- 适用 surface：c7
- cue：防止过拟合验收项目的唯一可靠办法是机器审计，不是口头纪律。
- 证据：本 eval 首版夹具的 E1 brief 里写了验收项目名作免责声明，被 `--audit-isolation` 当场抓出（已改为「与验收项目完全隔离」）。
- 反例/边界：isolation 元数据（manifest/index）允许出现验收项目名用于声明，审计只扫题面/夹具/样例全文。
- 验证方式：`python3 harness/graders/grade.py --audit-isolation`，退出码 0。

---

## 3. 待办

- [ ] S3 baseline 跑完后，把 CUE-001…CUE-008 逐条验证，能复现的升 `verified`，不能的改 `rejected` 并写反例。
- [ ] 首轮 baseline 的失败分布写进 `runs/v1-baseline.md#baseline 记录表`。
- [ ] 若 Lead 裁定 RPC-1…RPC-5，更新 `manifest.yaml` + 相关 task JSON 并 bump evalVersion。
