/**
 * moxi-core · 生成提示词（短剧编剧；脚本先于模型的口径写死在 system 里）
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

const RULE_FILES = [
  ['core-rules/core/drama-format.md', 2000],
  ['core-rules/core/hook-patterns.md', 1600],
  ['core-rules/core/rhythm-control.md', 1600],
  ['core-rules/core/writing-logic.md', 1200],
  ['core-rules/duration_char_count.md', 800],
  ['steps/05_script_draft.md', 1200],
]

let digestCache = null
let embeddedCache = null

/** 打包发行版里没有 rules/ 目录：回退到打包时内嵌的规则表（分发用） */
async function readEmbeddedRules() {
  if (embeddedCache) return embeddedCache
  try {
    const mod = await import('./rules-bundle.js')
    embeddedCache = mod.RULES_BUNDLE || {}
  } catch {
    embeddedCache = {}
  }
  return embeddedCache
}

export async function loadRulesDigest(repoRoot) {
  if (digestCache) return digestCache
  const parts = []
  const embedded = await readEmbeddedRules()
  for (const [rel, limit] of RULE_FILES) {
    let text = ''
    try {
      text = await fs.readFile(path.join(repoRoot, 'rules', 'v2', rel), 'utf8')
    } catch {
      text = embedded[rel] || ''
    }
    if (!text) continue
    const body = text.replace(/^---[\s\S]*?---\n/, '').trim()
    parts.push(`### ${rel}\n${body.slice(0, limit)}`)
  }
  digestCache = parts.join('\n\n')
  return digestCache
}

export const SYSTEM = `你是资深竖屏短剧编剧，写作风格：开场即冲突、台词口语化、每场有目标/阻碍/动作/结果、集末留钩子。
你只输出要求的正文本身，不解释、不加 Markdown 代码块围栏、不写"以下是"。

硬性格式（违反即被判废）：
1. 场景头固定格式：【场{集号}-{场号}：{时间}  {内/外}  {地点}】  例：【场1-1：夜  内  书房】
2. 场号从 1 开始连续；每场必须有对白或有效动作描写。
3. 单集净字数（汉字+拉丁词+数字，不含空白与标点）必须落在给定区间内，宁少勿注水。
4. 禁止写"未完待续""以上"之类元信息；集末用剧情钩子收尾。`

export function projectBrief(project, canvas) {
  const assets = (canvas?.nodes || []).filter((n) => n.type === 'asset').map((n) => n.title.replace(/^角色\s*[·:：]\s*/, ''))
  return [
    `剧名：${project.title}`,
    `题材/类型：${(project.genre && (project.genre.main || project.genre.sub)) || '由剧名与一句话故事自行判断'}`,
    `受众：${project.audience || '不限'}`,
    `形态：${project.format || '真人短剧'} · 集数 ${project.episodeCount ?? '未定'} · 单集 ${project.episodeSeconds || 90} 秒`,
    project.logline ? `一句话故事：${project.logline}` : '',
    assets.length ? `已登记角色：${assets.join('、')}` : '',
  ].filter(Boolean).join('\n')
}

export function characterDigest(canvas, contents = {}) {
  const out = []
  for (const n of (canvas?.nodes || [])) {
    if (n.type !== 'asset') continue
    const name = String(n.title || '').replace(/^角色\s*[·:：]\s*/, '').trim()
    if (!name) continue
    const text = String(contents[n.id] || '').replace(/\s+/g, ' ').trim()
    out.push(`- ${name}：${text.slice(0, 120) || '（未填设定）'}`)
  }
  return out.slice(0, 10).join('\n')
}

export function conceptPrompt(project, canvas) {
  return `请为下面这部短剧写「概念设定」，180–260 字，分四段：主题一句话 / 主角（姓名+年龄+处境）/ 核心冲突 / 故事起点（第一集开场前的情境）。

${projectBrief(project, canvas)}

要求：不要写分集、不要写场景；只写这四段，段落之间空一行。`
}

export function beatPrompt(project, episode, prevTail, digest, characters) {
  return `为第 ${episode} 集写「分集节拍表」：恰好 12 条，每条一行，格式为
第N拍｜场次建议（如 场上1-1）｜本拍发生什么（含冲突）｜钩子或反转

${projectBrief(project, characters && characters.canvas)}
${characters && characters.digest ? `\n人物设定（沿用，不许改名/改关系）：\n${characters.digest}\n` : ''}
${prevTail ? `上一集结尾（必须接续，不许跳脱）：\n${prevTail}\n` : ''}
${digest ? `写作规则摘要（参照）：\n${digest.slice(0, 2400)}\n` : ''}
要求：12 条覆盖「开场钩子→冲突升级→中点反转→高潮→集末钩子」；第 12 拍必须是强钩子。只输出 12 行。`
}

export function scenePrompt(project, episode, beats, characters) {
  return `根据第 ${episode} 集节拍，写「分场表」：8–12 场，每场一行，格式为
【场${episode}-N：时间  内/外  地点】｜本场目标/阻碍/结果｜出场角色

${projectBrief(project, characters && characters.canvas)}
${characters && characters.digest ? `\n人物设定（沿用，不许改名/改关系）：\n${characters.digest}\n` : ''}
第 ${episode} 集节拍：
${beats}

要求：场号从 ${episode}-1 开始连续；地点不要超过 4 个；每场都要推进冲突。只输出分场表。`
}

export function scriptPrompt(project, episode, sceneList, beats, prevTail, wordMin, wordMax, characters) {
  return `写第 ${episode} 集完整剧本（竖屏短剧，单集 ${project.episodeSeconds || 90} 秒）。

${projectBrief(project, characters && characters.canvas)}
${characters && characters.digest ? `\n人物设定（沿用，不许改名/改关系）：\n${characters.digest}\n` : ''}
本集分场表：
${sceneList || '（未提供，请自行按节拍拆分 8–12 场）'}

本集节拍（参照，不必逐条复述）：
${beats || '（未提供）'}

${prevTail ? `上一集结尾（接续，不许重复）：\n${prevTail}\n` : ''}

硬性要求：
1. 场景头必须是：【场${episode}-1：夜  内  地点】这种格式，场号连续。
2. 净字数 ${wordMin}–${wordMax}（汉字+拉丁词+数字；不含空白和标点）。写不够就加有效冲突/细节，不要注水，不要写旁白解释。
3. 对白占 60% 以上；人物说话要口语、短句。
4. 集末最后一段必须留强钩子（悬念/反转/危机），不要收束。
5. 合规红线：不写可操作犯罪手法、未成年人受害暗示、灵异恐怖具体画面、自伤细节、真实平台影射。
6. 人物姓名/身份/关系必须严格沿用上面的「人物设定」；没有的角色不要临时新增（需要群众角色时用「店员」「路人」这类泛称）。
5. 只输出剧本正文，从第一个场景头开始。
6. 平台合规红线（必须避开，否则会被打回）：不写可操作的犯罪手法（撬门/剪门链/配钥匙/破坏消防设施）；不出现未成年人受害暗示；不写灵异/鬼魂的具体恐怖画面；不写自伤自杀细节；不影射真实平台或真实企业；暴力冲突用动作与情绪替代，不写具体器械与伤害过程。`
}

export function fixPrompt(project, episode, script, findings) {
  const list = findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.code} ${f.message}${f.evidence ? `（证据：${f.evidence}）` : ''}`).join('\n')
  return `下面是第 ${episode} 集剧本和确定性检查结果。请只做必要修改，让所有 error 消失、warning 尽量消除，**保留原有剧情与对白风格**，输出修改后的完整剧本（不要输出解释）。

检查问题：
${list}

原剧本：
${script}

硬性要求：场景头格式【场${episode}-N：时间  内/外  地点】；净字数 ${findProjectWords(project)}；只输出完整剧本正文。`
}

function findProjectWords(project) {
  const range = project.wordRange || { min: 1000, max: 1550 }
  return `${range.min}–${range.max}`
}

export function compliancePrompt(project, episode, script) {
  return `对第 ${episode} 集剧本做"合规粗筛"，只列可能触发平台审核风险的点，最多 8 条，每条一行：
- 风险等级（redline / high_risk / warning）｜命中原文片段（不超过 20 字）｜为什么有风险｜改法建议
如果没有风险，只输出一行：无。

${projectBrief(project)}

剧本：
${script}`
}

export function summaryPrompt(project, episodes) {
  return `为这部短剧写 120 字以内的「项目简介」，面向读者：钩住人、不剧透结局。

${projectBrief(project)}
已生成集数：${episodes}
`
}
