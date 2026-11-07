/**
 * moxi-core · 导出（确定性脚本，不进模型）
 * md / txt 原生；docx 用 python-docx（DSH 运行时自带），不可用时降级为 md 并如实报告。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { nowIso } from './util.js'

function stamp() {
  return nowIso().replace(/[:+]/g, '-').slice(0, 19)
}

function run(cmd, args, stdin) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { err += d })
    p.on('error', (e) => resolve({ ok: false, code: -1, out, err: String(e) }))
    p.on('close', (code) => resolve({ ok: code === 0, code, out, err }))
    p.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE */ })
    if (stdin != null) {
      try {
        p.stdin.write(stdin)
        p.stdin.end()
      } catch { /* ignore */ }
    }
  })
}

const DOCX_SCRIPT = `
import sys, json
from docx import Document
from docx.shared import Pt
payload = json.load(sys.stdin)
doc = Document()
for sec in payload['sections']:
    doc.add_heading(sec['title'], level=sec.get('level', 1))
    for para in sec['text'].split('\\n'):
        if para.strip():
            p = doc.add_paragraph(para)
            for run in p.runs:
                run.font.size = Pt(11)
doc.save(payload['out'])
print(json.dumps({'ok': True}))
`

export async function exportProject({ store, projectId, format = 'md', range = null, includeReports = false }) {
  const { project, canvas } = await store.getProject(projectId)
  const dir = store.dir(projectId)
  const sections = []
  // 归一化区间：只给 to 视为 1..to；只给 from 视为 from..from
  const normRange = (() => {
    if (!range) return null
    const hasFrom = range.from != null && range.from !== ''
    const hasTo = range.to != null && range.to !== ''
    if (!hasFrom && !hasTo) return null
    const from = hasFrom ? Number(range.from) : 1
    const to = hasTo ? Number(range.to) : from
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      throw Object.assign(new Error(`导出区间非法: ${JSON.stringify(range)}`), { code: 'E_BAD_REQUEST' })
    }
    return { from, to }
  })()
  const inRange = (n) => {
    if (!normRange) return true
    const ep = Number(n.ref && n.ref.episode)
    if (!Number.isFinite(ep)) return true // 全局节点（项目根/设定集/资产/导出）始终包含
    return ep >= normRange.from && ep <= normRange.to
  }
  const ordered = [...canvas.nodes].sort((a, b) => {
    const ea = Number(a.ref && a.ref.episode) || 0
    const eb = Number(b.ref && b.ref.episode) || 0
    if (ea !== eb) return ea - eb
    const order = { project_root: 0, settings: 1, asset: 2, beat_sheet: 3, scene_list: 4, script_scene: 5, quality: 6, compliance: 7, delivery: 8 }
    return (order[a.type] ?? 9) - (order[b.type] ?? 9)
  })
  const REPORT_TYPES = new Set(['quality', 'compliance', 'delivery'])
  for (const node of ordered) {
    if (!node.contentFile) continue
    if (!inRange(node)) continue
    if (REPORT_TYPES.has(node.type) && !includeReports) continue
    let text = ''
    try {
      text = await fs.readFile(path.join(dir, node.contentFile), 'utf8')
    } catch {
      continue
    }
    if (!text.trim()) continue
    sections.push({ title: node.title, text })
  }
  const exportsDir = path.join(dir, 'exports')
  await fs.mkdir(exportsDir, { recursive: true })

  if (format === 'docx') {
    const out = path.join(exportsDir, `${safeName(project.title)}-${stamp()}.docx`)
    // Windows 常见是 python / py，macOS/Linux 是 python3：按顺序探测，找到能 import docx 的那个
    const candidates = process.env.MOXI_PYTHON
      ? [process.env.MOXI_PYTHON]
      : (process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'])
    let res = { ok: false, err: 'no python' }
    let usedPy = ''
    for (const py of candidates) {
      res = await run(py, ['-c', DOCX_SCRIPT], JSON.stringify({ out, sections }))
      if (res.ok) { usedPy = py; break }
    }
    if (res.ok) {
      const st = await fs.stat(out)
      return { format: 'docx', path: out, bytes: st.size, sections: sections.length, fallback: null, python: usedPy }
    }
    // 降级
    const mdPath = await writeMarkdown(project, sections, exportsDir)
    return {
      format: 'md', path: mdPath, bytes: (await fs.stat(mdPath)).size, sections: sections.length,
      fallback: { from: 'docx', reason: `python-docx 不可用或失败（${res.err.slice(0, 200)}）` },
    }
  }

  if (format === 'txt') {
    const out = path.join(exportsDir, `${safeName(project.title)}-${stamp()}.txt`)
    const body = sections.map((s) => `${s.title}\n\n${s.text}`).join('\n\n\n')
    await fs.writeFile(out, body, 'utf8')
    return { format: 'txt', path: out, bytes: (await fs.stat(out)).size, sections: sections.length, fallback: null }
  }

  const mdPath = await writeMarkdown(project, sections, exportsDir)
  return { format: 'md', path: mdPath, bytes: (await fs.stat(mdPath)).size, sections: sections.length, fallback: null }
}

async function writeMarkdown(project, sections, exportsDir) {
  const out = path.join(exportsDir, `${safeName(project.title)}-${stamp()}.md`)
  const head = `# ${project.title}\n\n> 导出时间：${nowIso()}\n> 集数：${project.episodeCount ?? '未确认'} · 受众：${project.audience || '未设'}\n\n---\n\n`
  const body = sections.map((s) => `## ${s.title}\n\n${s.text}\n`).join('\n---\n\n')
  await fs.writeFile(out, head + body, 'utf8')
  return out
}

function safeName(name) {
  return String(name || 'project').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60)
}
