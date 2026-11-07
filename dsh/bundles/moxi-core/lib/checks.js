/**
 * moxi-core · 确定性检查（脚本先于模型）
 *
 * 只做能用规则判定的部分；创作质量评审交给技能/模型。
 * 每条 finding：{ code, severity: 'error'|'warning'|'info', message, nodeId, line, evidence }
 */

const SCENE_HEADER_BRACKET = /^【场\s*(\d+)\s*[-－]\s*(\d+)\s*[：:]\s*([^】]*)】\s*$/
const SCENE_HEADER_PLAIN = /^(\d+)\s*[-－]\s*(\d+)\s+(\S.*)$/

/** 净字数：CJK 字符按 1，连续拉丁词按 1，去标点空白 */
export function netWordCount(text) {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const latin = (text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []).length
  const digits = (text.match(/\d+/g) || []).length
  return cjk + latin + digits
}

export function parseScenes(text, style = 'bracket') {
  const lines = String(text || '').split('\n')
  const re = style === 'plain' ? SCENE_HEADER_PLAIN : SCENE_HEADER_BRACKET
  const scenes = []
  let cur = null
  lines.forEach((line, idx) => {
    const m = re.exec(line.trim())
    if (m) {
      if (cur) scenes.push(cur)
      cur = {
        no: `${Number(m[1])}-${Number(m[2])}`,
        epNo: Number(m[1]), sceneNo: Number(m[2]),
        header: line.trim(), line: idx + 1, body: [],
      }
    } else if (cur) {
      cur.body.push(line)
    }
  })
  if (cur) scenes.push(cur)
  for (const s of scenes) s.text = s.body.join('\n')
  return scenes
}

/**
 * 对单个剧本/正文节点跑检查。
 * @param {{project:object, canvas:object, node:object, text:string}} input
 * @returns {{findings:Array, summary:object}}
 */
export function checkNode({ project, canvas, node, text }) {
  const findings = []
  const add = (f) => findings.push({ nodeId: node.id, line: null, evidence: '', ...f })

  if (!text || !text.trim()) {
    add({ code: 'C000', severity: 'error', message: '正文为空，未生成内容' })
    return { findings, summary: summarize(findings) }
  }

  const style = project.sceneHeaderStyle || 'bracket'
  const scenes = parseScenes(text, style)
  if (scenes.length === 0) {
    add({
      code: 'C001', severity: 'error',
      message: `未识别到场景头（要求 ${style === 'plain' ? '「1-1  夜 内 书房」' : '「【场1-1：夜  内  书房】」'} 格式）`,
      evidence: text.split('\n').slice(0, 3).join(' / '),
    })
  } else {
    // 场次编号连续性
    for (let i = 1; i < scenes.length; i += 1) {
      const [a] = scenes[i - 1].no.split('-').map(Number)
      const [b] = scenes[i].no.split('-').map(Number)
      if (b !== a && b !== a + 1) {
        add({ code: 'C003', severity: 'warning', message: `场次编号不连续：${scenes[i - 1].no} → ${scenes[i].no}`, line: scenes[i].line })
      }
    }
    // 集号必须与节点一致
    const wantEp = Number(node.ref && node.ref.episode)
    if (Number.isFinite(wantEp)) {
      const wrong = scenes.filter((sc) => sc.epNo !== wantEp)
      if (wrong.length) {
        add({ code: 'C009', severity: 'error', message: `场次头的集号与节点不一致：节点第 ${wantEp} 集，但出现 ${[...new Set(wrong.map((w) => w.epNo))].join('/')} 集会头`, line: wrong[0].line })
      }
    }
    // 同一集内场号必须从 1 连续递增
    for (let i = 0; i < scenes.length - 1; i += 1) {
      if (scenes[i].sceneNo + 1 !== scenes[i + 1].sceneNo && scenes[i].sceneNo !== scenes[i + 1].sceneNo) {
        add({ code: 'C010', severity: 'warning', message: `场号不连续：${scenes[i].no} → ${scenes[i + 1].no}`, line: scenes[i + 1].line })
      }
    }
    // 空场
    for (const s of scenes) {
      if (netWordCount(s.text) < 50) {
        add({ code: 'C006', severity: 'error', message: `场 ${s.no} 正文过短（${netWordCount(s.text)} 字 < 50）`, line: s.line })
      }
    }
  }

  // 字数区间
  const words = netWordCount(text)
  const range = project.wordRange || { min: 1000, max: 1550 }
  if (range && (words < range.min || words > range.max)) {
    add({
      code: 'C002', severity: 'warning',
      message: `净字数 ${words} 不在目标区间 ${range.min}–${range.max}`,
    })
  }

  // 集末钩子（弱规则：最后一段非空且 ≥ 20 字）
  const paragraphs = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const last = paragraphs[paragraphs.length - 1] || ''
  if (paragraphs.length && netWordCount(last) < 20) {
    add({ code: 'C004', severity: 'warning', message: '集末最后一段过短，可能缺少钩子', evidence: last.slice(0, 60) })
  }

  // 重复段落
  const seen = new Set()
  for (const p of paragraphs) {
    const key = p.replace(/\s+/g, '')
    if (key.length >= 20 && seen.has(key)) {
      add({ code: 'C007', severity: 'error', message: '出现完全重复段落', evidence: p.slice(0, 60) })
      break
    }
    seen.add(key)
  }

  // 未知角色名（与资产节点名单比对）
  const knownNames = new Set()
  for (const n of canvas.nodes) {
    if (n.type !== 'asset') continue
    const m = /角色\s*[·:：]\s*(.+)$/.exec(n.title || '')
    if (m) knownNames.add(m[1].trim())
  }
  if (knownNames.size) {
    const used = new Set()
    for (const name of knownNames) if (text.includes(name)) used.add(name)
    if (used.size === 0) {
      add({ code: 'C005', severity: 'warning', message: '正文未出现任何已登记角色名（可能是别名/未同步资产）' })
    }
  }

  return { findings, summary: summarize(findings) }
}

export function summarize(findings) {
  const errors = findings.filter((f) => f.severity === 'error').length
  const warnings = findings.filter((f) => f.severity === 'warning').length
  return {
    total: findings.length,
    errors,
    warnings,
    verdict: errors > 0 ? 'reject' : warnings > 0 ? 'conditional' : 'pass',
  }
}

/**
 * 合规（内容安全）确定性检查：只做能枚举、能复跑的硬规则。
 * level: redline（阻塞）/ high_risk（记录）/ warning（提示）
 * AI 评审只作建议，不参与闸门（脚本先于模型）。
 */
export const COMPLIANCE_RULES = [
  // 可操作犯罪手法
  { code: 'X101', level: 'redline', re: /(撬门|撬锁|剪断门链|配钥匙|万能钥匙|破解门禁|避开门禁)/, message: '可操作的闯入/开锁手法' },
  { code: 'X102', level: 'redline', re: /(破坏消防|拆消防|消防斧|灭火器砸|剪断电线)/, message: '破坏公共安全设施的具体手法' },
  { code: 'X103', level: 'redline', re: /(制造炸藥|制作炸弹|配炸药|毒药配方|下毒步骤)/, message: '制造危险品的可操作细节' },
  // 未成年人受害
  { code: 'X201', level: 'redline', re: /(儿童.{0,8}(拐卖|买卖|交易)|婴儿.{0,8}(买卖|交易|照片)|未成年.{0,8}(卖|交易))/, message: '未成年人受害/买卖暗示' },
  { code: 'X202', level: 'high_risk', re: /(小孩|孩子|婴儿).{0,10}(尸体|死了|被害)/, message: '儿童受害描写' },
  // 自伤自杀
  { code: 'X301', level: 'redline', re: /(割腕|割脉|吞药自杀|上吊步骤)/, message: '自伤自杀的具体方式' },
  { code: 'X302', level: 'warning', re: /(自杀|自残|自伤)/, message: '自伤自杀相关意象' },
  // 灵异恐怖（短剧平台对具体鬼怪画面敏感）
  { code: 'X401', level: 'high_risk', re: /(鬼魂|厲鬼|厉鬼|怨灵|附身|招魂|冥婚)/, message: '灵异/鬼怪具体设定' },
  { code: 'X402', level: 'warning', re: /(尸体|血腥|碎尸)/, message: '血腥/尸体意象' },
  // 真实平台/企业影射
  { code: 'X501', level: 'high_risk', re: /(美团|饿了么|顺丰|京东|淘宝|微信支付|支付宝)/, message: '真实平台/企业名直接出现' },
  // 赌博毒品
  { code: 'X601', level: 'redline', re: /(赌博技巧|赌场千术|毒品制作|吸毒步骤)/, message: '赌博/毒品可操作内容' },
  { code: 'X602', level: 'warning', re: /(赌博|赌场|下注|吸毒)/, message: '赌博/毒品相关描写' },
]

export function checkCompliance({ text }) {
  const findings = []
  const raw = String(text || '')
  for (const r of COMPLIANCE_RULES) {
    const hits = raw.match(new RegExp(r.re.source, 'g'))
    if (!hits) continue
    findings.push({
      code: r.code, level: r.level,
      severity: r.level === 'redline' ? 'error' : r.level === 'high_risk' ? 'error' : 'warning',
      message: `${r.message}（命中 ${hits.length} 处）`,
      nodeId: null, line: null, evidence: hits.slice(0, 3).join(','),
      source: 'deterministic',
    })
  }
  const redline = findings.filter((f) => f.level === 'redline').length
  const high = findings.filter((f) => f.level === 'high_risk').length
  const warn = findings.length - redline - high
  return {
    findings,
    summary: {
      total: findings.length,
      redline, highRisk: high, warnings: warn,
      errors: redline,
      verdict: redline ? 'reject' : findings.length ? 'conditional' : 'pass',
    },
  }
}
