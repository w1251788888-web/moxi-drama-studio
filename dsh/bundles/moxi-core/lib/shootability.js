/**
 * moxi-core · 可拍性报告（Shootability）
 *
 * 目标：把「剧本写完了」推进到「剧本能不能拍」。全部是确定性推算，可复跑、可解释：
 *   1. 时长：按对白字数与动作行数估算每场秒数，累加成集时长，与目标时长对比。
 *   2. 人物：对白说话人 vs 设定集角色表，找出"没出场/叫不出名字"的人；统计出场集分布与断档。
 *   3. 钩子：集末是否有钩子（悬念/反转/危机），给出最后一句原文供人复核。
 *   4. 签收：逐集人工签收记录（签收绑定 script contentVersion，改稿后自动标记 stale）。
 *
 * 说明：这是"辅助判断"，不是自动放行依据；最终仍由人工放行（release）。
 */

const DIALOGUE_RE = /^\s*([^：:（()）]{1,16})[：:]\s*(.+)$/
const ACTION_RE = /^\s*[（(].*[）)]\s*$|^\s*（.*）\s*$/
const HOOK_RE = /[？?！!…]|——|突然|就在这时|却|竟|竟然|没想到|原来|门开|电话响|响起|亮起|黑屏|定格/
const NARRATOR = new Set(['旁白', '画外音', '字幕', '系统', '广播', '内心', '闪回', '众人', '群杂', '电话', '手机'])

/** 说话人合法性：滤掉被误判成对白的叙述行（如「屏幕是一段录像：…」） */
const NARRATION_WORDS = /(屏幕|画面|镜头|手机|短信|字幕|闪回|回忆|画外|旁白|视频|录像|照片|文档|字条|纸|门|窗|灯|风|脚步|声音|消息|通知|弹窗|显示|备注)/
const VERB_CHARS = /[是在有被从对向把给让叫看听说走跑站坐掏拿推拉抬转身笑哭喊问盯]/
function normalizeSpeaker(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/[（(]\s*(OS|os|画外音)\s*[)）]/g, '').replace(/\s*(OS|os)$/, '')
  if (s.length > 10) return ''
  if (/[，。！？、；：""''（）()]/.test(s)) return ''
  if (NARRATION_WORDS.test(s)) return ''
  if (VERB_CHARS.test(s)) return ''
  if (!/^[\u4e00-\u9fa5A-Za-z·]{1,10}$/.test(s)) return ''
  return s
}

/** 可调参数：默认按"中文短剧"节奏（每秒 ~4.6 字，动作行 ~1.6 秒） */
export function pacingModel(overrides = {}) {
  return {
    // 与项目口径一致：90s ↔ 1000–1550 净字，即约 11–17 字/秒（短剧快节奏）
    charsPerSecond: 14,
    dialogueGapSeconds: 0.12,
    actionBaseSeconds: 0.35,
    actionCharSeconds: 0.01,
    sceneHeadSeconds: 0.5,
    tolerance: 0.25,
    ...overrides,
  }
}

export function analyzeEpisodeText({ text, episode, project, pacing }) {
  const p = pacing || pacingModel()
  const lines = String(text || '').split('\n')
  const scenes = []
  let cur = null
  const push = () => { if (cur) scenes.push(cur) }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const header = /^【?\s*场\s*(\d+)\s*[-–]\s*(\d+)/.exec(line) || /^(\d+)\s*[-–]\s*(\d+)\s+\S/.exec(line)
    if (header) {
      push()
      cur = { no: `${header[1]}-${header[2]}`, head: line, dialogue: 0, action: 0, speakerLines: [], seconds: p.sceneHeadSeconds }
      continue
    }
    if (!cur) cur = { no: '?', head: '', dialogue: 0, action: 0, speakerLines: [], seconds: 0 }
    const dm = DIALOGUE_RE.exec(line)
    if (dm && !ACTION_RE.test(line)) {
      const speaker = normalizeSpeaker(dm[1].replace(/^[-*·\s]+/, ''))
      if (!speaker) { // 被误判成对白的叙述行：按动作行计
        const cjk0 = (line.match(/[\u4e00-\u9fff]/g) || []).length
        cur.action += 1
        cur.seconds += p.actionBaseSeconds + cjk0 * p.actionCharSeconds
        continue
      }
      const body = dm[2]
      const cjk = (body.match(/[\u4e00-\u9fff]/g) || []).length + (body.match(/[A-Za-z]+/g) || []).length
      cur.dialogue += cjk
      cur.seconds += cjk / p.charsPerSecond + p.dialogueGapSeconds
      if (cur.speakerLines.length < 40) cur.speakerLines.push(speaker)
    } else {
      const cjk = (line.match(/[\u4e00-\u9fff]/g) || []).length
      cur.action += 1
      cur.seconds += p.actionBaseSeconds + cjk * p.actionCharSeconds
    }
  }
  push()

  const speakers = [...new Set(scenes.flatMap((s) => s.speakerLines))].filter((s) => s && !NARRATOR.has(s))
  const durationSeconds = Math.round(scenes.reduce((a, s) => a + s.seconds, 0))
  const target = Number(project.episodeSeconds) || 90
  const lastLines = lines.map((l) => l.trim()).filter(Boolean).slice(-3)
  const hookLine = lastLines.reverse().find((l) => HOOK_RE.test(l)) || ''
  const bodyChars = scenes.reduce((a, s) => a + s.dialogue, 0)

  const issues = []
  if (!scenes.length) issues.push({ code: 'S001', severity: 'error', message: '没有识别到场次头（无法估算可拍性）' })
  if (durationSeconds < target * (1 - p.tolerance)) {
    issues.push({ code: 'S101', severity: 'warning', message: `估算时长 ${durationSeconds}s 偏短（目标 ${target}s，容差 ±${Math.round(p.tolerance * 100)}%）` })
  }
  if (durationSeconds > target * (1 + p.tolerance)) {
    issues.push({ code: 'S102', severity: 'warning', message: `估算时长 ${durationSeconds}s 偏长（目标 ${target}s，容差 ±${Math.round(p.tolerance * 100)}%）` })
  }
  if (!hookLine) issues.push({ code: 'S201', severity: 'warning', message: '集末未检测到钩子（悬念/反转/危机）' })
  if (speakers.length === 0) issues.push({ code: 'S202', severity: 'error', message: '没有识别到任何角色对白' })

  return {
    episode, scenes: scenes.length,
    durationSeconds, targetSeconds: target, tolerance: p.tolerance,
    bodyChars, dialogueChars: scenes.reduce((a, s) => a + s.dialogue, 0),
    speakers, hook: { has: !!hookLine, line: hookLine.slice(0, 80) },
    issues,
  }
}

/** 从设定集/资产节点解析角色名（title 形如「角色 · 萧砚」，或 meta.fields.name） */
export function charactersFromCanvas(canvas) {
  const names = new Set()
  for (const n of canvas.nodes) {
    if (n.type !== 'asset') continue
    const f = (n.meta && n.meta.fields) || {}
    if (f.name) names.add(String(f.name).trim())
    const t = String(n.title || '')
    const m = /[·・:：]\s*(.+)$/.exec(t)
    if (m && m[1] && m[1].length <= 12) names.add(m[1].trim())
  }
  return names
}

/** 汇总整个项目 */
export function buildReport({ project, canvas, contents, signoffs = {}, pacing }) {
  const p = pacing || pacingModel()
  const known = charactersFromCanvas(canvas)
  const episodes = []
  for (const node of canvas.nodes) {
    const ep = Number(node.ref && node.ref.episode)
    if (!ep || node.type !== 'script_scene') continue
    const text = contents instanceof Map ? contents.get(node.id) : contents[node.id]
    const a = analyzeEpisodeText({ text, episode: ep, project, pacing: p })
    const sg = signoffs[String(ep)] || null
    const stale = !!(sg && node.contentVersion != null && sg.contentVersion != null && node.contentVersion > sg.contentVersion)
    const unknownSpeakers = known.size >= 2 ? a.speakers.filter((s) => !known.has(s) && !NARRATOR.has(s)) : []
    if (known.size < 2 && a.speakers.length) {
      a.issues.push({ code: 'S302', severity: 'error', message: '设定集缺少角色资产，无法校验人物一致性' })
    }
    if (unknownSpeakers.length) {
      a.issues.push({ code: 'S301', severity: 'warning', message: `对白角色不在设定集：${unknownSpeakers.slice(0, 5).join('、')}${unknownSpeakers.length > 5 ? ' 等' : ''}` })
    }
    episodes.push({
      ...a,
      nodeId: node.id,
      contentVersion: node.contentVersion,
      unknownSpeakers,
      signoff: sg ? { ...sg, stale } : null,
    })
  }
  episodes.sort((x, y) => x.episode - y.episode)

  // 角色出现分布（用于人工判断"人物断档"）
  const presence = {}
  for (const e of episodes) for (const s of e.speakers) (presence[s] ||= []).push(e.episode)

  const durationAll = episodes.reduce((a, e) => a + e.durationSeconds, 0)
  const signed = episodes.filter((e) => e.signoff && !e.signoff.stale).length
  // 逐集签收状态三分：有效签收 / 改稿失效（stale）/ 从未签收；unsigned 为待签收合计（含失效）
  const staleSignoffs = episodes.filter((e) => e.signoff && e.signoff.stale).length
  const unsignedOnly = episodes.filter((e) => !e.signoff).length
  const needsSignoff = episodes.length - signed
  return {
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id, title: project.title,
      episodeCount: project.episodeCount || episodes.length,
      episodeSeconds: Number(project.episodeSeconds) || 90,
      wordRange: project.wordRange || null,
    },
    pacing: p,
    knownCharacters: [...known],
    presence,
    episodes,
    summary: {
      episodes: episodes.length,
      totalDurationSeconds: durationAll,
      avgDurationSeconds: episodes.length ? Math.round(durationAll / episodes.length) : 0,
      hooksMissing: episodes.filter((e) => !e.hook.has).length,
      unknownSpeakerEpisodes: episodes.filter((e) => e.unknownSpeakers.length).length,
      issueCount: episodes.reduce((a, e) => a + e.issues.length, 0),
      signedOff: signed,
      unsigned: needsSignoff,
      needsSignoff,
      unsignedOnly,
      staleSignoffs,
    },
  }
}

/** 报告转 Markdown（给人工审读/归档） */
export function reportToMarkdown(report) {
  const s = report.summary
  const needsSignoff = s.needsSignoff ?? (s.episodes - s.signedOff)
  const unsignedOnly = s.unsignedOnly ?? Math.max(0, needsSignoff - (s.staleSignoffs || 0))
  const lines = []
  lines.push(`# 可拍性报告 · ${report.project.title}`)
  lines.push('')
  lines.push(`- 生成时间：${report.generatedAt}`)
  lines.push(`- 集数：${s.episodes} ｜ 目标单集时长：${report.project.episodeSeconds}s ｜ 平均估算：${s.avgDurationSeconds}s`)
  lines.push(`- 缺钩子集数：${s.hooksMissing} ｜ 不在设定集的角色集数：${s.unknownSpeakerEpisodes} ｜ 问题项：${s.issueCount}`)
  lines.push(`- 已签收 ${s.signedOff}/${s.episodes} 集；待签收 ${needsSignoff} 集（未签收 ${unsignedOnly} 集、改稿失效 ${s.staleSignoffs || 0} 集）`)
  lines.push('')
  lines.push('## 逐集')
  lines.push('')
  lines.push('| 集 | 场次 | 估算时长 | 角色 | 钩子 | 签收 | 问题 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const e of report.episodes) {
    const sg = e.signoff ? (e.signoff.stale ? '待重签（改稿失效）' : `已签收 ${String(e.signoff.at || '').slice(0, 16)}`) : '未签收'
    const issues = e.issues.length ? e.issues.map((i) => i.message).join('；').slice(0, 120) : '—'
    lines.push(`| ${e.episode} | ${e.scenes} | ${e.durationSeconds}s | ${e.speakers.slice(0, 4).join('、') || '—'} | ${e.hook.has ? '有' : '缺'} | ${sg} | ${issues} |`)
  }
  lines.push('')
  lines.push('## 角色出场分布')
  lines.push('')
  for (const [name, eps] of Object.entries(report.presence)) {
    lines.push(`- ${name}：${eps.join(', ')}`)
  }
  lines.push('')
  lines.push('> 时长/钩子为确定性估算，仅作审读参考；放行仍由人工决定。')
  return lines.join('\n')
}
