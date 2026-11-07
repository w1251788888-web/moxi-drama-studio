# E5 质检回放 · 确定性检查口径（v1）

> 本文件是 E5 的 ground truth 口径。**只检查 `v1DetectorScope` 里的 6 个码**；codebook 里标了“v1 不检查”的码即使命中也不要报（报了算误报）。
> 机器可读版本：`E5-config.json`；项目中的实现目标：`dsh/bundles/moxi-core/lib/checks.js`（S3 需按本表校准阈值）。

## 0. 净字数口径（与 moxi-core `netWordCount` 一致）

- CJK 字符（U+4E00–U+9FFF）：每个计 1
- 连续拉丁词（如 `OK`、`Nina`）：每个计 1
- 连续数字（如 `300`）：每个计 1
- 标点、空白、符号：不计

## 1. v1 六个检查码

| code | severity | 判定规则 |
|---|---|---|
| `C002` | warning | 全文净字数不在 1000–1550 内 |
| `C006` | error | 任一场次净字数 < 150（碎片化场次） |
| `Q_SCENE_HEADER_MIXED` | error | 项目是 bracket 格式，但正文出现 plain 场次标头（如 `1-3  夜  内  潮汐民宿厨房`） |
| `Q_HOOK_ABSTRACT` | error | 集末最后一段命中禁用抽象短语：故事继续 / 故事还在继续 / 真相未明 / 真相还未揭晓 / 期待下集 / 下集见分晓 / 危机来临 / 敬请期待 / 未完待续 |
| `Q_OS_FORMAT` | warning | 出现非标准内心独白标记：`（内心）`、`（心里）`、`画外音：`（应写成 `角色名OS：` 或 `角色名（情绪）OS：`） |
| `Q_NAME_VARIANT` | error | 出现姓名变体：林小曼 / 林晓满 / 周曼曼 / 周漫漫 / 陈彦 / 陈砚之 / 林奶奶 / 林婆婆 |

**场次切分**：bracket 标头按 `【场N-M：…】` 切；plain 标头按 `N-M  时间  内/外  地点` 切。两种都要能切出来（否则 C006 无法按场计算）。

**“集末最后一段”**：全文按空行切段，取最后一个非空段落。

## 2. 输出格式（quality_report.json）

```json
{
  "schemaVersion": 1,
  "evalTask": "E5",
  "episode": 1,
  "verdict": "fail",
  "mustFix": [
    {"code": "C006", "severity": "error", "evidence": "逐字出现在剧本里的原文片段（≥6 字）", "message": "问题说明"}
  ],
  "shouldFix": [],
  "summary": "一句话结论"
}
```

- `verdict` 只能是 `pass` / `warn` / `fail`；本样例必须打回，所以必须是 `fail`。
- 每个命中码都要给一条 finding；`evidence` 必须是剧本原文的**逐字片段**（≥6 字），不允许编造。
- `severity` 必须与上表一致。
- **误报上限：≤1 条**。报 `v1DetectorScope` 之外的码、或把实际没命中的码报上来，都算误报。
- 命中的码可以放在 `mustFix` 或 `shouldFix` 里（错误严重度放 mustFix 更合理），判分只看两处合并后的 code 集合。
