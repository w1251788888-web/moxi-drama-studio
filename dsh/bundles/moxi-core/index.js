/**
 * moxi-core · Host 插件入口
 *
 * 职责：项目工作区数据的唯一读写入口（HTTP 路由 + Agent 工具），
 *       两条通道共用同一个 Store，保证"唯一业务入口"。
 * 契约：docs/adr/001-目标架构.md §4/§5；docs/设计/数据契约-v1.md
 */
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Store, applyOneOp, NODE_TYPES } from './lib/store.js'
import { checkNode, checkCompliance, summarize } from './lib/checks.js'
import { exportProject } from './lib/export.js'
import { LlmClient } from './lib/llm.js'
import { JobManager, statePath } from './lib/generate.js'
import { Snapshots } from './lib/snapshot.js'
import { buildReport, reportToMarkdown, pacingModel } from './lib/shootability.js'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MoxiError, resolveProjectsRoot, nowIso, exists } from './lib/util.js'

/** 本 bundle 所在仓库根：<repo>/dsh/bundles/moxi-core/index.js → <repo> */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
// 版本号读自身 package.json（开发 0.2.0 / 发行包 0.1.0-exp.N）
const OWN_VERSION = await (async () => {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
    return String(pkg.version || '0.0.0')
  } catch {
    return '0.0.0'
  }
})()

export const name = 'moxi-core'

/**
 * 插件级配置（Standard Schema 形态，cordis 直接消费 Config['~standard'].validate）。
 * 不依赖 @deepseek-ai/schemastery：link 安装的 bundle 解析不到 dsh 内部包。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'moxi',
    validate(value) {
      const v = value && typeof value === 'object' ? value : {}
      const str = (k, d) => (typeof v[k] === 'string' ? v[k] : d)
      const num = (k, d) => (Number.isFinite(Number(v[k])) ? Number(v[k]) : d)
      return {
        value: {
          projectsRoot: str('projectsRoot', ''),
          llmProvider: str('llmProvider', 'deepseek-official'),
          llmModel: str('llmModel', 'deepseek-flash'),
          llmMaxTokens: num('llmMaxTokens', 4096),
          llmTemperature: num('llmTemperature', 0.75),
          llmTimeoutMs: num('llmTimeoutMs', 180000),
          genConcurrency: num('genConcurrency', 1),
          // 可拍性放行闸门（用户要求：未签收 / 缺钩子 不许 release）
          releaseGateRequireSignoff: v.releaseGateRequireSignoff !== false,
          releaseGateRequireHook: v.releaseGateRequireHook !== false,
        },
      }
    },
  },
}
export const inject = ['tools', 'llm']

function envelope(fn) {
  return async (request) => {
    try {
      let payload = {}
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const text = await request.text()
        payload = text ? JSON.parse(text) : {}
      } else {
        const url = new URL(request.url)
        payload = Object.fromEntries(url.searchParams.entries())
      }
      const value = await fn(payload)
      return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
    } catch (err) {
      const code = err && err.code ? err.code : 'E_INTERNAL'
      const message = err && err.message ? err.message : String(err)
      return Response.json(
        { ok: false, error: { code, message, details: err && err.details ? err.details : undefined, traceId: nowIso() } },
        { headers: { 'cache-control': 'no-store' } }
      )
    }
  }
}

export function apply(ctx, config = {}) {
  const cfg = config || {}
  const projectsRoot = resolveProjectsRoot(cfg.projectsRoot)
  const store = new Store({ projectsRoot })
  const getConfig = () => cfg
  const llm = new LlmClient({ ctx, getConfig })
  const snapshots = new Snapshots({ store })
  const jobs = new JobManager({ store, llm, repoRoot: REPO_ROOT, getConfig, snapshots })
  ctx.logger?.info?.(`[moxi-core] projectsRoot = ${projectsRoot} · llm=${cfg.llmProvider || 'deepseek-official'}/${cfg.llmModel || 'deepseek-flash'}`)

  /* ------------------------- HTTP 路由 ------------------------- */
  ctx.inject(['connection'], (inner) => {
    const conn = inner.get('connection')
    const routes = buildRoutes(store, projectsRoot, { jobs, llm, getConfig, snapshots })
    for (const [routePath, handler] of Object.entries(routes)) {
      inner.effect(() => conn.fetch.register({
        path: routePath,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: handler,
      }))
    }
  })

  /* ------------------------- Agent 工具 ------------------------- */
  registerTools(ctx, store, projectsRoot, { jobs, llm })
}

async function buildShootabilityFor(projectId, pacingOverrides) {
  const { store } = shootCtx
  const { project, canvas } = await store.getProject(projectId)
  const contents = {}
  for (const n of canvas.nodes) {
    if (n.type !== 'script_scene' || !n.ref?.episode) continue
    try { contents[n.id] = (await store.getContent(projectId, n.id)).text } catch { contents[n.id] = '' }
  }
  return buildReport({
    project, canvas, contents,
    signoffs: project.signoffs || {},
    pacing: pacingOverrides ? pacingModel(pacingOverrides) : undefined,
  })
}

let shootCtx = {}

function buildRoutes(store, projectsRoot, extra = {}) {
  const { jobs, llm, snapshots, getConfig } = extra
  shootCtx = { store }
  const ctxLlmList = async (client) => {
    try {
      const provider = (extra.getConfig && extra.getConfig().llmProvider) || 'deepseek-official'
      const list = await client.ctx.llm.listModels(provider)
      return list.map((m) => ({ id: m.id, name: m.name }))
    } catch (err) {
      return [{ error: String(err && err.message || err) }]
    }
  }
  return {
    '/api/moxi/hello': envelope(async () => ({
      plugin: 'moxi-core', version: OWN_VERSION, pid: process.pid, cwd: process.cwd(),
      projectsRoot, home: os.homedir(), time: nowIso(), nodeTypes: NODE_TYPES,
    })),

    '/api/moxi/projects/list': envelope(() => store.listProjects()),
    '/api/moxi/projects/create': envelope((p) => store.createProject(p)),
    '/api/moxi/project/get': envelope(async (p) => {
      const { project, canvas } = await store.getProject(p.projectId)
      const recovery = await store.recover(p.projectId)
      return { project, canvas, recovery }
    }),
    '/api/moxi/project/delete': envelope((p) => store.deleteProject(p.projectId)),
    '/api/moxi/canvas/rev': envelope(async (p) => ({
      rev: await store.getRev(p.projectId), updatedAt: nowIso(),
    })),
    '/api/moxi/canvas/get': envelope(async (p) => {
      const { canvas } = await store.getProject(p.projectId)
      await store.recover(p.projectId)
      return { canvas }
    }),
    '/api/moxi/canvas/apply': envelope(async (p) => {
      const r = await store.applyOps(p.projectId, p.ops, {
        actor: p.actor || 'user', baseRev: p.baseRev, idempotencyKey: p.idempotencyKey,
      })
      const changed = (p.ops || []).some((op) => ['node.write', 'node.update', 'node.create', 'node.delete'].includes(op.op))
      if (changed) await store.revokeRelease(p.projectId, 'manual-edit').catch(() => {})
      return r
    }),
    '/api/moxi/node/content': envelope((p) => store.getContent(p.projectId, p.nodeId)),
    '/api/moxi/node/save': envelope(async (p) => {
      const r = await store.applyOps(p.projectId, [
        { op: 'node.write', nodeId: p.nodeId, text: p.text, baseVersion: p.baseVersion },
      ], { actor: p.actor || 'user', idempotencyKey: p.idempotencyKey })
      await store.revokeRelease(p.projectId, 'manual-edit').catch(() => {})
      return r
    }),
    '/api/moxi/check/run': envelope(async (p) => {
      const { project, canvas } = await store.getProject(p.projectId)
      const node = canvas.nodes.find((n) => n.id === p.nodeId)
      if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${p.nodeId}`)
      const { text } = await store.getContent(p.projectId, node.id)
      const result = node.type === 'compliance'
        ? checkCompliance({ text })
        : checkNode({ project, canvas, node, text })
      const meta = { ...(node.meta || {}), findings: result.findings, rubric: result.summary }
      const ops = [{ op: 'node.update', nodeId: node.id, patch: { meta } }]
      const target = result.summary.verdict === 'reject' ? 'rejected' : 'review'
      if (node.status !== target) {
        const path = statePath(node.status, target)
        if (path) for (const to of path) ops.push({ op: 'node.transition', nodeId: node.id, to, reason: 'deterministic-check' })
      }
      const applied = await store.applyOps(p.projectId, ops, { actor: 'system' })
      return { ...result, rev: applied.rev }
    }),
    '/api/moxi/export': envelope((p) => exportProject({ store, projectId: p.projectId, format: p.format || 'md', range: p.range, includeReports: p.includeReports })),

    /* ------------------- 交付闭环 ------------------- */
    '/api/moxi/snapshots/list': envelope((p) => snapshots.list(p.projectId)),
    '/api/moxi/snapshots/create': envelope((p) => snapshots.create(p.projectId, p.reason || 'manual')),
    '/api/moxi/snapshots/restore': envelope((p) => snapshots.restore(p.projectId, p.snapshotId)),
    // 在系统中定位导出文件（macOS: open -R；仅允许项目 exports 目录内）
    '/api/moxi/reveal': envelope(async (p) => {
      const file = p.path
      if (typeof file !== 'string' || file.includes('..')) throw new MoxiError('E_BAD_REQUEST', 'path 非法')
      const st = await fs.stat(file).catch(() => null)
      if (!st || !st.isFile()) throw new MoxiError('E_NOT_FOUND', `文件不存在: ${file}`)
      // 只允许项目 exports 下的文件
      if (!path.resolve(file).includes(`${path.sep}exports${path.sep}`)) {
        throw new MoxiError('E_BAD_REQUEST', '只允许定位导出目录内的文件')
      }
      const win = process.platform === 'win32'
      const cmd = process.platform === 'darwin' ? 'open' : win ? 'explorer' : 'xdg-open'
      // Windows: explorer /select,<file> 会定位并选中文件；macOS: open -R；Linux: 打开目录
      const args = process.platform === 'darwin' ? ['-R', file]
        : win ? [`/select,${file}`]
          : [path.dirname(file)]
      spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
      return { revealed: true, path: file, opener: cmd }
    }),
    // 下载导出文件内容（前端可触发另存为）
    '/api/moxi/file/read': envelope(async (p) => {
      const file = p.path
      if (typeof file !== 'string' || file.includes('..')) throw new MoxiError('E_BAD_REQUEST', 'path 非法')
      if (!path.resolve(file).includes(`${path.sep}exports${path.sep}`)) {
        throw new MoxiError('E_BAD_REQUEST', '只允许读取导出目录内的文件')
      }
      const buf = await fs.readFile(file)
      const st = await fs.stat(file)
      return { path: file, bytes: st.size, base64: buf.toString('base64') }
    }),
    // 补齐概念/角色资产（存量项目修复用）
    '/api/moxi/project/ensure': envelope(async (p) => {
      const what = String(p.what || 'all')
      const { project, canvas } = await store.getProject(p.projectId)
      const before = { assets: canvas.nodes.filter((n) => n.type === 'asset').length }
      const job = await jobs.ensureByApi(p.projectId, what)
      const after = await store.getProject(p.projectId)
      return {
        jobId: job.id,
        before,
        after: { assets: after.canvas.nodes.filter((n) => n.type === 'asset').length },
        title: project.title,
      }
    }),

    /* ------------------- 可拍性（Shootability） ------------------- */
    '/api/moxi/report/shootability': envelope(async (p) => {
      const report = await buildShootabilityFor(p.projectId, p.pacing)
      if (String(p.format || 'json') === 'md') {
        return { format: 'md', markdown: reportToMarkdown(report), summary: report.summary }
      }
      return report
    }),

    // 逐集签收：签收绑定 script contentVersion，改稿后自动 stale
    '/api/moxi/episode/signoff': envelope(async (p) => {
      const ep = Number(p.episode)
      if (!Number.isInteger(ep) || ep < 1) throw new MoxiError('E_BAD_REQUEST', `episode 非法：${p.episode}`)
      const { project, canvas } = await store.getProject(p.projectId)
      const node = canvas.nodes.find((n) => n.type === 'script_scene' && n.ref?.episode === ep)
      if (!node) throw new MoxiError('E_NOT_FOUND', `第 ${ep} 集剧本不存在`)
      const signoffs = { ...(project.signoffs || {}) }
      if (p.action === 'revoke') {
        delete signoffs[String(ep)]
      } else {
        signoffs[String(ep)] = {
          by: String(p.by || '作者').slice(0, 40),
          at: nowIso(),
          notes: String(p.notes || '').slice(0, 500),
          contentVersion: node.contentVersion || 0,
          sceneCount: canvas.nodes.filter((n) => n.type === 'scene_list' && n.ref?.episode === ep).length,
        }
      }
      const next = await store.updateProject(p.projectId, { signoffs })
      await store.appendEvents(p.projectId, [{
        actor: p.by || 'user', op: p.action === 'revoke' ? 'episode.signoff.revoke' : 'episode.signoff',
        nodeId: node.id, data: { episode: ep, notes: p.notes || '' },
      }]).catch(() => {})
      const signed = Object.keys(next.signoffs || {}).length
      return { episode: ep, signedOff: signed, signoffs: next.signoffs || {} }
    }),

    // 人工放行：生成完成 → 作者确认 → 可交付
    '/api/moxi/project/release': envelope(async (p) => {
      const { project: projNow, canvas } = await store.getProject(p.projectId)
      // —— 可拍性放行闸门（默认开启）——
      const cfg = getConfig() || {}
      const requireSignoff = cfg.releaseGateRequireSignoff !== false
      const requireHook = cfg.releaseGateRequireHook !== false
      if (requireSignoff || requireHook) {
        const report = await buildShootabilityFor(p.projectId)
        // 签收三态：有效签收 / 改稿失效（stale）/ 从未签收；unsigned 为待签收合计（含失效）
        const unsigned = report.episodes.filter((e) => !e.signoff || e.signoff.stale).map((e) => e.episode)
        const unsignedOnly = report.episodes.filter((e) => !e.signoff).map((e) => e.episode)
        const stale = report.episodes.filter((e) => e.signoff && e.signoff.stale).map((e) => e.episode)
        const noHook = report.episodes.filter((e) => !e.hook.has).map((e) => e.episode)
        const problems = []
        if (requireSignoff && unsigned.length) problems.push(`${unsigned.length} 集待签收（其中未签收 ${unsignedOnly.length} 集、改稿失效 ${stale.length} 集）：${unsigned.slice(0, 12).join('、')}${unsigned.length > 12 ? ' 等' : ''}`)
        if (requireHook && noHook.length) problems.push(`${noHook.length} 集缺集末钩子：${noHook.slice(0, 12).join('、')}${noHook.length > 12 ? ' 等' : ''}`)
        if (problems.length) {
          const forced = p.force === true
          const reason = String(p.forceReason || '').trim()
          if (!forced || !reason) {
            throw new MoxiError('E_RELEASE_GATE', `可拍性闸门未通过：${problems.join('；')}`, {
              unsigned, needsSignoff: unsigned, unsignedOnly, stale, noHook,
              policy: { requireSignoff, requireHook },
              hint: '在画布「可拍性」里逐集签收、补齐钩子后再放行；如确需跳过，传 force=true + forceReason（会记录审计）。',
            })
          }
          await store.appendEvents(p.projectId, [{
            actor: 'user', op: 'project.release.forced', nodeId: null,
            data: { reason, waived: { unsigned: unsigned.length, unsignedOnly: unsignedOnly.length, stale: stale.length, noHook: noHook.length } },
          }]).catch(() => {})
          projNow.__forceNote = reason
        }
      }
      const delivery = canvas.nodes.find((n) => n.type === 'delivery')
      if (delivery && delivery.status !== 'approved') {
        const pathOps = []
        const pathList = statePath(delivery.status, 'approved') || []
        for (const to of pathList) pathOps.push({ op: 'node.transition', nodeId: delivery.id, to, reason: 'human-release' })
        if (pathOps.length) await store.applyOps(p.projectId, pathOps, { actor: 'user' })
      }
      // 放行绑定稿件版本：记录 rev 与每个正文节点的 contentVersion，改稿即失效
      const releasedScripts = {}
      for (const n of canvas.nodes) {
        if (n.contentVersion != null) releasedScripts[n.id] = n.contentVersion
      }
      const project = await store.updateProject(p.projectId, {
        reviewState: 'released', releasedAt: nowIso(),
        releasedAtRev: canvas.rev, releasedScripts,
        ...(projNow.__forceNote ? { releaseForced: { at: nowIso(), reason: projNow.__forceNote } } : {}),
      })
      await store.appendEvents(p.projectId, [{ actor: 'user', op: 'project.release', nodeId: delivery ? delivery.id : null, data: {} }]).catch(() => {})
      return { project, deliveryStatus: (await store.getProject(p.projectId)).canvas.nodes.find((n) => n.type === 'delivery')?.status }
    }),

    /* ------------------- 生成任务 ------------------- */
    '/api/moxi/jobs/start': envelope((p) => jobs.start({
      projectId: p.projectId, from: p.from, to: p.to, episodes: p.episodes,
      provider: p.provider, model: p.model, temperature: p.temperature, skipConcept: p.skipConcept,
    })),
    '/api/moxi/jobs/list': envelope((p) => jobs.listAll(p.projectId)),
    '/api/moxi/jobs/get': envelope(async (p) => {
      jobs.assertJobId(p.jobId)
      const live = jobs.get(p.jobId)
      if (live) return live
      const saved = await jobs.load(p.jobId, p.projectId).catch(() => null)
      if (!saved) throw new MoxiError('E_NOT_FOUND', `任务不存在：${p.jobId}`)
      return jobs.publicJob(saved)
    }),
    '/api/moxi/jobs/cancel': envelope((p) => jobs.cancel(p.jobId)),
    '/api/moxi/jobs/resume': envelope((p) => jobs.resume({ projectId: p.projectId, jobId: p.jobId })),
    '/api/moxi/jobs/polish': envelope((p) => jobs.startPolish({
      projectId: p.projectId, episodes: p.episodes, provider: p.provider, model: p.model,
    })),
    '/api/moxi/llm/info': envelope(async () => {
      const provider = (extra.getConfig && extra.getConfig().llmProvider) || 'deepseek-official'
      const models = await ctxLlmList(llm)
      return { provider, models }
    }),
    '/api/moxi/llm/probe': envelope(async (p) => {
      const r = await llm.complete({
        system: p.system || '只回复 pong 四个字母。',
        user: p.user || 'ping',
        maxTokens: Number(p.maxTokens) || 16,
        temperature: p.temperature ?? 0,
        reasoningEffort: p.reasoningEffort,
      })
      return {
        ok: true, provider: r.provider, model: r.model, ms: r.ms,
        chars: String(r.text).length, sample: String(r.text).slice(0, 200),
      }
    }),
    '/api/moxi/stats': envelope(() => buildStats(store, jobs)),
    '/api/moxi/events/tail': envelope((p) => store.tailEvents(p.projectId, p.limit || 50)),

    '/api/moxi/admin/overview': envelope(() => store.overview()),
    '/api/moxi/admin/projects': envelope(() => store.listProjects()),
    '/api/moxi/admin/logs': envelope((p) => store.globalEvents(p.limit || 200)),
    '/api/moxi/admin/rules': envelope(() => scanRules()),
    '/api/moxi/admin/models': envelope(() => scanModels()),
  }
}

/* ------------------------- admin 只读扫描 ------------------------- */

async function scanRules() {
  const root = await pickRulesRoot()
  const rules = []
  const walk = async (dir, rel = '') => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      const abs = path.join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(abs, r)
      else if (e.name.endsWith('.md')) {
        const text = await fs.readFile(abs, 'utf8').catch(() => '')
        const title = (/^#\s+(.+)$/m.exec(text) || [])[1] || e.name
        rules.push({ path: r, title: title.trim(), words: text.length })
      }
    }
  }
  await walk(root)
  let pipeline = null
  try {
    pipeline = JSON.parse(await fs.readFile(path.join(root, 'pipeline.json'), 'utf8'))
  } catch { /* 可选 */ }
  // 打包发行版（无 rules/ 目录）：回退到打包时内嵌的规则表
  if (!rules.length) {
    try {
      const mod = await import('./lib/rules-bundle.js')
      const bundle = mod.RULES_BUNDLE || {}
      for (const [rel, text] of Object.entries(bundle)) {
        if (!rel.endsWith('.md')) continue
        const title = (/^#\s+(.+)$/m.exec(text) || [])[1] || rel.split('/').pop()
        rules.push({ path: rel, title: String(title).trim(), words: text.length })
      }
      rules.sort((a, b) => a.path.localeCompare(b.path))
      if (!pipeline && bundle['pipeline.json']) pipeline = JSON.parse(bundle['pipeline.json'])
    } catch { /* 开发环境无内嵌表 */ }
  }
  return { root: rules.length ? root : 'embedded', count: rules.length, rules, pipeline, skills: await scanSkills() }
}

async function pickRulesRoot() {
  const candidates = [
    process.env.MOXI_RULES_ROOT,
    path.join(REPO_ROOT, 'rules', 'v2'),
    path.join(REPO_ROOT, 'rules'),
    path.join(process.cwd(), 'rules', 'v2'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (await exists(path.join(c, 'pipeline.json')) || await exists(path.join(c, 'manifest.json'))) return c
  }
  return candidates[1] || candidates[0]
}

/** 扫描技能目录（v2 仓库 skills/ + 用户级 ~/.dsh/skills） */
async function scanSkills() {
  const candidates = [
    process.env.MOXI_SKILLS_ROOT,
    path.join(REPO_ROOT, 'skills'),
    path.join(os.homedir(), '.dsh', 'skills'),
  ].filter(Boolean)
  const out = []
  for (const base of candidates) {
    const ents = await fs.readdir(base, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      if (!e.isDirectory()) continue
      const dir = path.join(base, e.name)
      let files = 0
      const walk = async (d) => {
        const list = await fs.readdir(d, { withFileTypes: true }).catch(() => [])
        for (const f of list) {
          if (f.isDirectory()) await walk(path.join(d, f.name))
          else files += 1
        }
      }
      await walk(dir)
      out.push({ name: e.name, dir, files, hasSkillMd: await exists(path.join(dir, 'SKILL.md')), source: base })
    }
  }
  return out
}

async function scanModels() {
  const profileDir = process.env.DSH_PROFILE_DIR || ''
  const out = { source: 'dsh profile', profileDir, providers: [], probe: [], probeFile: null }
  const patchPath = profileDir ? path.join(profileDir, 'cordis.patch.yml') : ''
  if (patchPath) {
    const text = await fs.readFile(patchPath, 'utf8').catch(() => '')
    let inBlock = false
    const block = []
    for (const line of text.split('\n')) {
      if (/^- id:\s*llm-pi-ai\s*$/.test(line)) { inBlock = true; continue }
      if (inBlock && /^- id:/.test(line)) break
      if (inBlock) block.push(line)
    }
    let provider = null
    for (const line of block) {
      const pm = /^ {6}([a-zA-Z][\w-]*):\s*$/.exec(line)
      if (pm) { provider = pm[1]; out.providers.push({ provider, models: [] }); continue }
      const mm = /^\s+- id:\s*([\w.\-/:]+)\s*$/.exec(line)
      if (mm && provider) out.providers[out.providers.length - 1].models.push(mm[1])
    }
  }
  try {
    const probeDir = process.env.MOXI_PROBE_DIR || path.join(os.homedir(), '.moxi', 'probe')
    const files = (await fs.readdir(probeDir)).filter((f) => f.endsWith('.jsonl')).sort()
    const latest = files[files.length - 1]
    if (latest) {
      const text = await fs.readFile(path.join(probeDir, latest), 'utf8')
      const seen = new Map()
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line)
          seen.set(`${row.provider}/${row.model}`, row)
        } catch { /* skip */ }
      }
      out.probe = [...seen.values()]
      out.probeFile = latest
    }
  } catch { /* 无探针结果 */ }
  return out
}

/**
 * 权威数字：前端所有展示计数都应以这里为准（用于前后端一致性测试）
 */
async function buildStats(store, jobs) {
  const projects = await store.listProjects()
  const perProject = []
  const total = { projects: projects.length, nodes: 0, edges: 0, approved: 0, pending: 0, blocked: 0, draft: 0, words: 0, episodes: 0 }
  for (const p of projects) {
    try {
      const { project, canvas } = await store.getProject(p.id)
      let words = 0
      let episodes = 0
      const byStatus = { draft: 0, generating: 0, review: 0, rejected: 0, approved: 0, blocked: 0 }
      for (const n of canvas.nodes) {
        byStatus[n.status] = (byStatus[n.status] || 0) + 1
        if (n.type === 'script_scene' && n.ref?.episode) episodes = Math.max(episodes, Number(n.ref.episode) || 0)
        if (n.contentFile) {
          const c = await store.getContent(p.id, n.id).catch(() => ({ text: '' }))
          words += String(c.text || '').replace(/\s/g, '').length
        }
      }
      const jobsFor = jobs ? jobs.list(p.id) : []
      const lastJob = jobsFor[0] || null
      const row = {
        id: p.id, title: p.title, episodeCount: project.episodeCount,
        nodes: canvas.nodes.length, edges: canvas.edges.length, rev: canvas.rev,
        byStatus,
        pending: byStatus.review + byStatus.rejected,
        words, episodes,
        lastJob: lastJob ? { id: lastJob.id, status: lastJob.status, progress: lastJob.progress } : null,
        updatedAt: project.updatedAt,
      }
      perProject.push(row)
      total.nodes += row.nodes; total.edges += row.edges
      total.approved += byStatus.approved; total.pending += row.pending
      total.blocked += byStatus.blocked; total.draft += byStatus.draft
      total.words += words; total.episodes += episodes
    } catch { /* 跳过损坏项目 */ }
  }
  return { generatedAt: nowIso(), total, projects: perProject }
}

function textOutput(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function registerTools(ctx, store, projectsRoot, extra = {}) {
  const { jobs, llm } = extra
  const reg = (def) => ctx.tools.register({
    ...def,
    output: {
      schema: { type: 'object' },
      render: (_args, value) => textOutput(value ?? {}),
    },
  })

  reg({
    name: 'moxi_project_list',
    description: '列出墨戏生花项目（按更新时间倒序）。返回 id/title/集数/状态/更新时间。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ projects: await store.listProjects(), projectsRoot }),
  })

  reg({
    name: 'moxi_project_create',
    description: '新建墨戏生花项目并铺出画布骨架（9 类节点）。返回 projectId 与画布摘要。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '项目名（必填、唯一）' },
        episodeCount: { type: 'integer', description: '确认的集数；不确定则不传' },
        audience: { type: 'string', description: '男频 / 女频 / 混合' },
        genreMain: { type: 'string', description: '主类型，如 家庭/甜宠/悬疑' },
        logline: { type: 'string', description: '一句话故事' },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const { project, canvas } = await store.createProject({
        title: args.title, episodeCount: args.episodeCount ?? null,
        audience: args.audience || '', genre: { main: args.genreMain || '', sub: '' },
        logline: args.logline || '',
      })
      return { projectId: project.id, title: project.title, nodeCount: canvas.nodes.length, rev: canvas.rev }
    },
  })

  reg({
    name: 'moxi_project_open',
    description: '打开项目，返回项目元数据 + 画布节点摘要（id/type/title/status/episode）。',
    parameters: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
    execute: async (args) => {
      await store.recover(args.projectId)
      const { project, canvas } = await store.getProject(args.projectId)
      return {
        project,
        rev: canvas.rev,
        nodes: canvas.nodes.map((n) => ({
          id: n.id, type: n.type, title: n.title, status: n.status, ref: n.ref,
        })),
        edges: canvas.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
      }
    },
  })

  reg({
    name: 'moxi_node_create',
    description: '在画布上创建节点。可指定类型、标题、位置、业务引用（episode/scene）与初始正文。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        type: { type: 'string', enum: NODE_TYPES },
        title: { type: 'string' },
        x: { type: 'number' }, y: { type: 'number' },
        episode: { type: 'integer' },
        sceneNo: { type: 'string' },
        text: { type: 'string', description: '初始正文（Markdown）' },
      },
      required: ['projectId', 'type', 'title'],
    },
    execute: async (args) => {
      const node = {
        type: args.type, title: args.title,
        x: args.x ?? 0, y: args.y ?? 0,
        ref: { episode: args.episode ?? null, scene: args.sceneNo ?? null },
        meta: { episode: args.episode ?? null, sceneNo: args.sceneNo ?? null },
      }
      const r = await store.applyOps(args.projectId, [{ op: 'node.create', node, text: args.text }], { actor: 'agent' })
      return { nodeId: r.results[0].nodeId, rev: r.rev }
    },
  })

  reg({
    name: 'moxi_node_write',
    description: '写节点正文（Markdown）。带长文写作、重写、改稿都走它。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        nodeId: { type: 'string' },
        text: { type: 'string' },
        baseVersion: { type: 'integer', description: '乐观锁版本；不确定则不传' },
      },
      required: ['projectId', 'nodeId', 'text'],
    },
    execute: async (args) => {
      const r = await store.applyOps(args.projectId, [
        { op: 'node.write', nodeId: args.nodeId, text: args.text, baseVersion: args.baseVersion },
      ], { actor: 'agent' })
      return { rev: r.rev, bytes: Buffer.byteLength(args.text, 'utf8') }
    },
  })

  reg({
    name: 'moxi_node_transition',
    description: '节点状态迁移（draft→generating→review→approved/rejected；不合法会报 E_TRANSITION 并给出允许集合）。质检/合规 rejected 会自动阻塞下游。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        nodeId: { type: 'string' },
        to: { type: 'string', enum: ['draft', 'generating', 'review', 'rejected', 'approved', 'blocked'] },
        reason: { type: 'string' },
      },
      required: ['projectId', 'nodeId', 'to'],
    },
    execute: async (args) => {
      const r = await store.applyOps(args.projectId, [
        { op: 'node.transition', nodeId: args.nodeId, to: args.to, reason: args.reason || 'agent' },
      ], { actor: 'agent' })
      return r.results[0]
    },
  })

  reg({
    name: 'moxi_edge_create',
    description: '创建连线。kind=dependency 参与阻塞传播且必须无环；kind=context 仅表示引用关系。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        from: { type: 'string' }, to: { type: 'string' },
        kind: { type: 'string', enum: ['dependency', 'context'] },
      },
      required: ['projectId', 'from', 'to'],
    },
    execute: async (args) => {
      const r = await store.applyOps(args.projectId, [
        { op: 'edge.create', from: args.from, to: args.to, kind: args.kind || 'dependency' },
      ], { actor: 'agent' })
      return r.results[0]
    },
  })

  reg({
    name: 'moxi_check_run',
    description: '对节点跑确定性检查（场景头格式/净字数/场次连续/空场/重复段落/合规粗筛），把 findings 写回节点 meta 并给出 verdict。',
    parameters: {
      type: 'object',
      properties: { projectId: { type: 'string' }, nodeId: { type: 'string' } },
      required: ['projectId', 'nodeId'],
    },
    execute: async (args) => {
      const { project, canvas } = await store.getProject(args.projectId)
      const node = canvas.nodes.find((n) => n.id === args.nodeId)
      if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${args.nodeId}`)
      const { text } = await store.getContent(args.projectId, node.id)
      const result = node.type === 'compliance' ? checkCompliance({ text }) : checkNode({ project, canvas, node, text })
      await store.applyOps(args.projectId, [
        { op: 'node.update', nodeId: node.id, patch: { meta: { ...(node.meta || {}), findings: result.findings, rubric: result.summary } } },
      ], { actor: 'agent' })
      return result
    },
  })

  reg({
    name: 'moxi_export',
    description: '导出项目为 md / txt / docx。docx 不可用时自动降级 md 并说明原因。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        format: { type: 'string', enum: ['md', 'txt', 'docx'] },
      },
      required: ['projectId'],
    },
    execute: async (args) => exportProject({ store, projectId: args.projectId, format: args.format || 'md' }),
  })

  reg({
    name: 'moxi_generate',
    description: '一键批量生成剧本（服务端直调 DSH 配置的模型）。按集范围生成：节拍→分场→剧本→确定性检查(自动修一次)→质检→合规。返回 jobId，用 moxi_job_status 查进度。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        from: { type: 'integer', description: '起始集（默认 1）' },
        to: { type: 'integer', description: '结束集（默认 min(总集数,30)）' },
        provider: { type: 'string', description: '模型 provider，默认用项目配置' },
        model: { type: 'string', description: '模型 id' },
        temperature: { type: 'number' },
      },
      required: ['projectId'],
    },
    execute: async (args) => {
      const job = await jobs.start({
        projectId: args.projectId, from: args.from, to: args.to,
        provider: args.provider, model: args.model, temperature: args.temperature,
      })
      return { jobId: job.id, from: job.from, to: job.to, provider: job.provider, model: job.model, status: job.status }
    },
  })

  reg({
    name: 'moxi_job_status',
    description: '查询生成任务进度：完成/失败集数、当前集与阶段、最近日志、用量。',
    parameters: {
      type: 'object',
      properties: { jobId: { type: 'string' }, projectId: { type: 'string', description: '任务文件所属项目（内存任务可省）' } },
      required: ['jobId'],
    },
    execute: async (args) => {
      const live = jobs.get(args.jobId)
      if (live) return live
      const saved = await jobs.load(args.jobId, args.projectId)
      return jobs.publicJob(saved)
    },
  })

  reg({
    name: 'moxi_job_cancel',
    description: '取消正在运行的生成任务（已完成的集保留）。',
    parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
    execute: async (args) => jobs.cancel(args.jobId),
  })

  reg({
    name: 'moxi_shootability',
    description: '可拍性报告：逐集估算时长、场次数、角色对白、集末钩子、是否在设定集内、人工签收状态；返回汇总与逐集明细（format=md 返回 Markdown）。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        format: { type: 'string', enum: ['json', 'md'] },
        episodeSeconds: { type: 'integer', description: '目标单集时长（默认取项目 episodeSeconds）' },
      },
      required: ['projectId'],
    },
    execute: async (args) => {
      const { project, canvas } = await store.getProject(args.projectId)
      const contents = {}
      for (const n of canvas.nodes) {
        if (n.type !== 'script_scene' || !n.ref?.episode) continue
        try { contents[n.id] = (await store.getContent(args.projectId, n.id)).text } catch { contents[n.id] = '' }
      }
      const pacing = args.episodeSeconds ? pacingModel({}) : undefined
      const proj = args.episodeSeconds ? { ...project, episodeSeconds: args.episodeSeconds } : project
      const report = buildReport({ project: proj, canvas, contents, signoffs: project.signoffs || {}, pacing })
      return String(args.format || 'json') === 'md'
        ? { markdown: reportToMarkdown(report), summary: report.summary }
        : report
    },
  })

  reg({
    name: 'moxi_polish',
    description: '合规修复：对已生成剧本做「合规评审→改写红线表达→复查」最多 3 轮，清理 redline/high_risk 后自动放行质检/合规节点。返回 jobId。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        episodes: { type: 'array', items: { type: 'integer' }, description: '要修复的集号；缺省=全部已有剧本集' },
      },
      required: ['projectId'],
    },
    execute: async (args) => {
      const job = await jobs.startPolish({ projectId: args.projectId, episodes: args.episodes })
      return { jobId: job.id, mode: job.mode, total: job.progress.total }
    },
  })

  reg({
    name: 'moxi_llm_probe',
    description: '探测当前 DSH 配置的模型链路是否可用（返回 provider/model/延迟）。',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const r = await llm.complete({ system: '只回复 pong', user: 'ping', maxTokens: 16, temperature: 0 })
      return { provider: r.provider, model: r.model, ms: r.ms, sample: String(r.text).slice(0, 40) }
    },
  })
}
