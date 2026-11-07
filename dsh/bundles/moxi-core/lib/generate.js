/**
 * moxi-core · 批量生成引擎（服务端直调 DSH llm；30 集一键直出）
 *
 * 流程（每集）：节拍 → 分场 → 剧本 → 确定性检查(+一次自动修) → 质检节点 → 合规节点
 * 特性：进度/取消/断点续跑/失败不中断/用量记账/审计事件
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { newId, nowIso, writeJsonAtomic, readJson, MoxiError, withLock } from './util.js'
import { netWordCount, checkNode, checkCompliance } from './checks.js'
import * as P from './prompts.js'

const NODE_H = { beat_sheet: 150, scene_list: 150, script_scene: 170, quality: 170, compliance: 170 }
const LAYOUT = { beat: 380, scene: 720, script: 1060, check: 1400 }

function wordsRange(project) {
  if (project.wordRange && project.wordRange.min) return project.wordRange
  const sec = Number(project.episodeSeconds) || 90
  // 以 90 秒 ↔ 1000–1550 净字为基准线性折算，与验收口径一致
  return { min: Math.round((sec * 1000) / 90), max: Math.round((sec * 1550) / 90) }
}

export class JobManager {
  constructor({ store, llm, repoRoot, getConfig, snapshots }) {
    this.store = store
    this.llm = llm
    this.repoRoot = repoRoot
    this.getConfig = getConfig || (() => ({}))
    this.snapshots = snapshots || null
    this.jobs = new Map() // jobId -> { meta, abort, running }
    this.active = new Map() // projectId -> jobId
  }

  jobsDir(projectId) {
    return path.join(this.store.dir(projectId), 'history', 'jobs')
  }

  async persist(job) {
    const { abort, runner, ...plain } = job
    return withLock(`job-persist:${job.id}`, async () => {
      const dir = this.jobsDir(job.projectId)
      await fs.mkdir(dir, { recursive: true })
      await writeJsonAtomic(path.join(dir, `${job.id}.json`), plain)
    })
  }

  assertJobId(jobId) {
    if (typeof jobId !== 'string' || !/^job_[0-9A-Za-z]{8,40}$/.test(jobId)) {
      throw new MoxiError('E_BAD_REQUEST', `jobId 非法: ${String(jobId)}`)
    }
    return jobId
  }

  async load(jobId, projectId) {
    this.assertJobId(jobId)
    const file = path.join(this.jobsDir(projectId), `${jobId}.json`)
    return readJson(file)
  }

  async isSettled(promise) {
    let settled = false
    promise.finally(() => { settled = true })
    await new Promise((r) => setTimeout(r, 0))
    return settled
  }

  /** 依据每集当前状态重算进度（续跑后不能沿用旧计数） */
  recalcProgress(job) {
    const done = job.episodes.filter((e) => e.status === 'done').length
    const failed = job.episodes.filter((e) => e.status === 'failed').length
    job.progress.total = job.episodes.length
    job.progress.done = done
    job.progress.failed = failed
    return job.progress
  }

  log(job, level, msg) {
    job.log.push({ ts: nowIso(), level, msg })
    if (job.log.length > 400) job.log = job.log.slice(-400)
  }

  async start(params) {
    const { projectId } = params
    return withLock(`job-start:${projectId}`, () => this._startUnlocked(params))
  }

  /** 合规修复任务：对已生成集做「检查→改写→复查」直到无 redline/high_risk */
  async startPolish(params) {
    const { projectId } = params
    return withLock(`job-start:${projectId}`, () => this._startPolishUnlocked(params))
  }

  async _startPolishUnlocked({ projectId, episodes = null, provider, model }) {
    // 同项目只允许一个任务（与 start 一致）
    this.runners = this.runners || new Map()
    const activeId = this.active.get(projectId)
    if (activeId) {
      const activeJob = this.jobs.get(activeId)
      const activeRunner = this.runners.get(activeId)
      const alive = !!(activeJob && (activeJob.running || activeJob.status === 'running')) ||
        !!(activeRunner && !(await this.isSettled(activeRunner)))
      if (alive) throw new MoxiError('E_JOB_RUNNING', `同项目已有任务在跑：${activeId}（等它结束或取消后再试）`)
      this.active.delete(projectId)
    }
    const { project } = await this.store.getProject(projectId)
    const total = Number(project.episodeCount) || 30
    let list = Array.isArray(episodes) && episodes.length ? [...new Set(episodes.map(Number))].sort((a, b) => a - b) : null
    if (list && list.some((n) => !Number.isInteger(n) || n < 1 || n > total)) {
      throw new MoxiError('E_BAD_REQUEST', `集号非法：${JSON.stringify(episodes)}`)
    }
    const { canvas } = await this.store.getProject(projectId)
    if (!list) {
      list = [...new Set(canvas.nodes
        .filter((n) => n.type === 'script_scene' && n.ref?.episode)
        .map((n) => Number(n.ref.episode)))].sort((a, b) => a - b)
    }
    if (!list.length) throw new MoxiError('E_BAD_REQUEST', '没有已生成的剧本集')
    const cfg = this.getConfig() || {}
    const job = {
      id: newId('job'), projectId, projectTitle: project.title,
      mode: 'polish',
      from: list[0], to: list[list.length - 1],
      status: 'queued', createdAt: nowIso(), startedAt: null, finishedAt: null,
      provider: provider || cfg.llmProvider || 'deepseek-official',
      model: model || cfg.llmModel || 'deepseek-flash',
      temperature: 0.4,
      progress: { total: list.length, done: 0, failed: 0, current: null },
      episodes: list.map((ep) => ({ ep, stage: 'pending', status: 'pending', words: 0, findings: 0, error: null, updatedAt: null })),
      log: [{ ts: nowIso(), level: 'info', msg: `合规修复任务：${list.length} 集` }],
      usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      wordRange: wordsRange(project),
    }
    this.jobs.set(job.id, { ...job, abort: new AbortController(), running: false })
    this.active.set(projectId, job.id)
    this.runners = this.runners || new Map()
    this.runners.set(job.id, this.runPolish(job.id).catch(() => {}))
    return this.publicJob(job)
  }

  async runPolish(jobId) {
    const job = this.jobs.get(jobId)
    if (!job || job.running) return
    job.running = true
    job.status = 'running'
    job.startedAt = job.startedAt || nowIso()
    this.recalcProgress(job)
    const signal = job.abort.signal
    try {
      const { project } = await this.store.getProject(job.projectId)
      // 并发修复（默认 3；写盘由项目锁串行化）
      const concurrency = Math.max(1, Math.min(4, Number(this.getConfig().polishConcurrency) || 3))
      const queue = job.episodes.filter((e) => e.status !== 'done')
      let cursor = 0
      const worker = async () => {
        while (cursor < queue.length) {
          if (signal.aborted) throw new MoxiError('E_CANCELLED', 'cancelled')
          const epState = queue[cursor]
          cursor += 1
          job.progress.current = epState.ep
          epState.status = 'running'
          await this.persist(job).catch(() => {})
          try {
            await this.polishEpisode(job, project, epState, signal)
            epState.status = 'done'
            epState.stage = 'done'
            this.recalcProgress(job)
            this.log(job, 'info', `第 ${epState.ep} 集合规修复完成（剩余高风险 ${epState.findings}）`)
          } catch (err) {
            if (signal.aborted) throw err
            epState.status = 'failed'
            epState.error = String(err && err.message ? err.message : err).slice(0, 300)
            this.recalcProgress(job)
            this.log(job, 'error', `第 ${epState.ep} 集修复失败：${epState.error}`)
          }
          epState.updatedAt = nowIso()
          job.usage = { ...this.llm.stats() }
          await this.persist(job).catch(() => {})
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker().catch((err) => {
        if (signal.aborted) throw err
        this.log(job, 'error', `worker 异常：${err.message}`)
      })))
      await this.finalize(job)
      job.status = job.progress.failed === 0 ? 'done' : 'done_with_errors'
      this.log(job, 'info', `修复任务结束：完成 ${job.progress.done}，失败 ${job.progress.failed}`)
    } catch (err) {
      const cancelled = signal.aborted || (err && err.code === 'E_CANCELLED')
      job.status = cancelled ? 'cancelled' : 'failed'
      this.log(job, cancelled ? 'warn' : 'error', `修复任务${cancelled ? '取消' : '失败'}：${err.message}`)
    } finally {
      job.finishedAt = nowIso()
      job.progress.current = null
      job.running = false
      this.recalcProgress(job)
      await this.persist(job).catch(() => {})
      if (this.active.get(job.projectId) === job.id) this.active.delete(job.projectId)
    }
  }

  async polishEpisode(job, project, epState, signal) {
    const ep = epState.ep
    const { canvas } = await this.store.getProject(job.projectId)
    const scriptNode = canvas.nodes.find((n) => n.type === 'script_scene' && n.ref?.episode === ep)
    const compNode = canvas.nodes.find((n) => n.type === 'compliance' && n.ref?.episode === ep)
    if (!scriptNode || !compNode) throw new MoxiError('E_NOT_FOUND', `第 ${ep} 集缺剧本或合规节点`)
    let { text: script } = await this.store.getContent(job.projectId, scriptNode.id)

    // ① 确定性红线：最多 3 轮定点改写
    let scan = checkCompliance({ text: script })
    let rounds = 0
    while (scan.summary.redline > 0 && rounds < 3) {
      rounds += 1
      epState.stage = `fix-${rounds}`
      await this.persist(job)
      const quotes = scan.findings.filter((f) => f.level === 'redline').map((f, i) => `${i + 1}. ${f.message}${f.evidence ? `（必须删除/替换：${f.evidence}）` : ''}`).join(String.fromCharCode(10))
      const fix = await this.llm.complete({
        system: P.SYSTEM,
        user: `第 ${ep} 集剧本命中平台硬红线。请重写剧本：保留全部场次、人物与剧情走向，把下列命中内容删除或改成合规写法（不得解释、不得新增暴力/犯罪/灵异细节）。**改写后净字数必须保持在 ${job.wordRange.min}–${job.wordRange.max} 之间**（当前 ${netWordCount(script)}，超了就压缩描写和对白密度）。输出完整剧本。\n\n命中项：\n${quotes}\n\n原剧本：\n${script}`,
        temperature: 0.3, signal, maxTokens: 10000, provider: job.provider, model: job.model,
      })
      const next = clean(fix.text)
      if (netWordCount(next) < job.wordRange.min * 0.9) throw new MoxiError('E_WORDS', `第 ${ep} 集合规改写后字数异常（${netWordCount(next)}）`)
      script = next
      await this.store.applyOps(job.projectId, [{ op: 'node.write', nodeId: scriptNode.id, text: script }], { actor: 'agent' })
      scan = checkCompliance({ text: script })
    }

    // 字数回区间（合规改写容易膨胀）
    for (let i = 0; i < 2; i += 1) {
      const w = netWordCount(script)
      if (w >= job.wordRange.min && w <= job.wordRange.max) break
      epState.stage = `trim-${i + 1}`
      await this.persist(job)
      const fix = await this.llm.complete({
        system: P.SYSTEM,
        user: `第 ${ep} 集剧本净字数 ${w}，必须落在 ${job.wordRange.min}–${job.wordRange.max}。请${w > job.wordRange.max ? '压缩' : '扩写'}到区间内，保留全部场次与剧情，只调整描写与对白密度，并保持内容合规。输出完整剧本。\n\n${script}`,
        temperature: 0.3, signal, maxTokens: 10000, provider: job.provider, model: job.model,
      })
      const nextW = clean(fix.text)
      const nw = netWordCount(nextW)
      const before = Math.abs(w - Math.min(job.wordRange.max, Math.max(job.wordRange.min, w)))
      const after = Math.abs(nw - Math.min(job.wordRange.max, Math.max(job.wordRange.min, nw)))
      if (after <= before) {
        script = nextW
        await this.store.applyOps(job.projectId, [{ op: 'node.write', nodeId: scriptNode.id, text: script }], { actor: 'agent' })
      }
    }

    // 字数回区间后必须重扫合规（trim 可能改写句子引入新红线）
    scan = checkCompliance({ text: script })
    if (scan.summary.redline > 0) {
      throw new MoxiError('E_COMPLIANCE', `第 ${ep} 集字数回改后命中红线（${scan.summary.redline} 处），需人工处理`)
    }

    // ② AI 评审（只作建议，不参与闸门）
    let aiFindings = []
    let aiDegraded = false
    try {
      const r = await this.llm.complete({ system: P.SYSTEM, user: P.compliancePrompt(project, ep, script), temperature: 0.2, signal, maxTokens: 2400, provider: job.provider, model: job.model })
      aiFindings = parseComplianceList(r.text, ep).map((f) => ({ ...f, source: 'ai', severity: 'warning', level: 'warning' }))
      aiDegraded = complianceReplyUnparseable(r.text)
    } catch (err) {
      if (signal.aborted) throw err
      aiDegraded = true
    }

    // 正文已改：重跑确定性检查并同步质检节点（正文/结论一起更新；失败则判该集失败，不静默放行）
    const check = await this.runChecks(job, scriptNode.id, project)
    const qNode = canvas.nodes.find((n) => n.type === 'quality' && n.ref?.episode === ep)
    if (qNode) {
      const qText = check.findings.length
        ? check.findings.map((f) => `- [${f.severity}] ${f.code || ''} ${f.message}${f.evidence ? `（${f.evidence}）` : ''}`).join(String.fromCharCode(10))
        : '无问题'
      const qOps = [
        { op: 'node.write', nodeId: qNode.id, text: qText },
        { op: 'node.update', nodeId: qNode.id, patch: { meta: { ...(qNode.meta || {}), episode: ep, findings: check.findings, rubric: check.summary } } },
      ]
      for (const to of this.pathTo(qNode, 'review')) qOps.push({ op: 'node.transition', nodeId: qNode.id, to, reason: 'compliance-polish-recheck' })
      await this.store.applyOps(job.projectId, qOps, { actor: 'agent' })
      epState.qualityErrors = check.summary.errors
    }
    const allFindings = scan.findings.concat(aiFindings)
    const redlineCount = scan.summary.redline
    const highestRisk = redlineCount ? 'redline' : scan.summary.highRisk ? 'high_risk' : allFindings.length ? 'warning' : 'none'
    epState.words = netWordCount(script)
    epState.findings = redlineCount
    const summary = {
      ...scan.summary,
      aiAdvisory: aiFindings.length,
      aiDegraded,
      highestRisk,
      verdict: redlineCount ? 'reject' : 'conditional',
      rounds,
    }
    const cNode = await this.nodeById(job, compNode.id)
    const ops = [
      { op: 'node.write', nodeId: compNode.id, text: allFindings.length ? allFindings.map((f) => `- [${f.level || f.severity}] ${f.message}${f.evidence ? `（${f.evidence}）` : ''}`).join(String.fromCharCode(10)) : '无风险项' },
      { op: 'node.update', nodeId: compNode.id, patch: { meta: { episode: ep, findings: allFindings, highestRisk, deterministicRedline: redlineCount, degraded: aiDegraded, rubric: summary } } },
    ]
    for (const to of this.pathTo(cNode, 'review')) ops.push({ op: 'node.transition', nodeId: compNode.id, to, reason: 'compliance-polish' })
    await this.store.applyOps(job.projectId, ops, { actor: 'agent' })
  }

  async _startUnlocked(params) {
    const { projectId, from, to, provider, model, temperature, skipConcept = false, episodes = null } = params
    const { project } = await this.store.getProject(projectId)
    const total = Number(project.episodeCount) || 30
    const f = from == null ? 1 : Number(from)
    const t = to == null ? Math.min(total, 30) : Number(to)
    if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < 1 || f > total || t > total || t < f) {
      throw new MoxiError('E_BAD_REQUEST', `集数范围非法：${f}–${t}（须为 1–${total} 的整数）`)
    }
    // 显式集号列表校验：正整数、去重、≤ 项目总集数
    let list = null
    if (Array.isArray(episodes) && episodes.length) {
      list = [...new Set(episodes.map(Number))]
      if (list.some((n) => !Number.isInteger(n) || n < 1 || n > total)) {
        throw new MoxiError('E_BAD_REQUEST', `集号非法（须 1–${total} 的整数）：${JSON.stringify(episodes)}`)
      }
      list.sort((a, b) => a - b)
    } else if (t < f) {
      throw new MoxiError('E_BAD_REQUEST', `集数范围非法：${f}–${t}`)
    }
    this.runners = this.runners || new Map()
    const activeId = this.active.get(projectId)
    if (activeId) {
      const activeJob = this.jobs.get(activeId)
      const activeRunner = this.runners.get(activeId)
      const stillAlive = !!(activeJob && (activeJob.running || activeJob.status === 'running')) ||
        !!(activeRunner && !(await this.isSettled(activeRunner)))
      if (stillAlive) throw new MoxiError('E_JOB_RUNNING', `已有生成任务在跑：${activeId}（请先等待其结束或取消）`)
      this.active.delete(projectId)
    }
    const cfg = this.getConfig() || {}
    const job = {
      id: newId('job'),
      projectId,
      projectTitle: project.title,
      from: f,
      to: t,
      status: 'queued',
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      provider: provider || cfg.llmProvider || 'deepseek-official',
      model: model || cfg.llmModel || 'deepseek-flash',
      temperature: temperature ?? cfg.llmTemperature ?? 0.75,
      progress: { total: t - f + 1, done: 0, failed: 0, current: null },
      episodes: [],
      log: [],
      usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
      skipConcept,
      wordRange: wordsRange(project),
    }
    const epList = list || Array.from({ length: t - f + 1 }, (_, i) => f + i)
    job.from = epList[0]
    job.to = epList[epList.length - 1]
    job.progress.total = epList.length
    for (const ep of epList) {
      job.episodes.push({
        ep, stage: 'pending', status: 'pending',
        words: 0, findings: 0, error: null, updatedAt: null,
      })
    }
    // 生成前自动快照（可整批回退）：快照失败则拒绝开始，避免"覆盖了却退不回去"
    if (this.snapshots) {
      try {
        const snap = await this.snapshots.create(projectId, 'before-generate', { jobId: job.id, from: job.from, to: job.to })
        job.snapshotId = snap.id
        this.log(job, 'info', `已创建生成前快照：${snap.id}`)
      } catch (err) {
        this.jobs.delete(job.id)
        this.active.delete(projectId)
        throw new MoxiError('E_SNAPSHOT', `生成前快照失败，已中止（避免无法回退）：${err.message}`)
      }
    }
    this.log(job, 'info', `任务创建：第 ${f}–${t} 集，模型 ${job.provider}/${job.model}`)
    await this.persist(job)
    this.jobs.set(job.id, { ...job, abort: new AbortController(), running: false })
    this.active.set(projectId, job.id)
    this.runners = this.runners || new Map()
    this.runners.set(job.id, this.run(job.id).catch(() => {}))
    return this.publicJob(job)
  }

  publicJob(job) {
    const { abort, running, ...plain } = job
    return plain
  }

  get(jobId) {
    const j = this.jobs.get(jobId)
    return j ? this.publicJob(j) : null
  }

  list(projectId) {
    const out = []
    for (const j of this.jobs.values()) {
      if (!projectId || j.projectId === projectId) out.push(this.publicJob(j))
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  /** 合并内存 + 磁盘历史任务（管理后台用；无 projectId 时扫全部项目） */
  async listAll(projectId) {
    const mem = this.list(projectId)
    const seen = new Set(mem.map((j) => j.id))
    const projects = projectId ? [{ id: projectId }] : await this.store.listProjects()
    for (const p of projects) {
      const dir = this.jobsDir(p.id)
      const files = await fs.readdir(dir).catch(() => [])
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        const id = f.replace(/\.json$/, '')
        if (seen.has(id)) continue
        try {
          const j = await readJson(path.join(dir, f))
          j.projectId = j.projectId || p.id
          mem.push(j)
          seen.add(id)
        } catch { /* 跳过坏文件 */ }
      }
    }
    return mem.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  async nextJobId(projectId) {
    const dir = this.jobsDir(projectId)
    const files = await fs.readdir(dir).catch(() => [])
    return files.filter((f) => f.endsWith('.json')).sort().pop()?.replace('.json', '') || null
  }

  async cancel(jobId) {
    this.assertJobId(jobId)
    const j = this.jobs.get(jobId)
    if (!j) throw new MoxiError('E_NOT_FOUND', `任务不存在：${jobId}`)
    if (j.status !== 'running' && j.status !== 'queued') return this.publicJob(j)
    j.cancelRequested = true
    j.abort.abort(new Error('cancelled'))
    j.status = 'cancelled'
    j.finishedAt = nowIso()
    this.recalcProgress(j)
    this.log(j, 'warn', '任务被取消')
    await this.persist(j).catch(() => {})
    return this.publicJob(j)
  }

  async resume({ projectId, jobId }) {
    this.assertJobId(jobId)
    return withLock(`job-start:${projectId}`, () => this._resumeUnlocked({ projectId, jobId }))
  }

  async _resumeUnlocked({ projectId, jobId }) {
    const j = this.jobs.get(jobId)
    this.runners = this.runners || new Map()
    const activeId = this.active.get(projectId)
    if (activeId && activeId !== jobId) {
      const other = this.jobs.get(activeId)
      if (other && (other.running || other.status === 'running')) {
        throw new MoxiError('E_JOB_RUNNING', `同项目已有其它任务在跑：${activeId}`)
      }
    }
    if (j) {
      if (j.status === 'running' || j.running) throw new MoxiError('E_JOB_RUNNING', '任务仍在运行')
      const prev = this.runners.get(jobId)
      if (prev) await prev.catch(() => {})
      j.status = 'queued'
      j.finishedAt = null
      j.running = false
      j.abort = new AbortController()
      this.recalcProgress(j)
      this.log(j, 'info', '任务续跑')
      await this.persist(j)
      this.active.set(projectId, jobId)
      this.runners.set(jobId, this.run(jobId).catch(() => {}))
      return this.publicJob(j)
    }
    const saved = await this.load(jobId, projectId).catch(() => null)
    if (!saved) throw new MoxiError('E_NOT_FOUND', `任务不存在：${jobId}`)
    saved.status = 'queued'
    saved.finishedAt = null
    const runtime = { ...saved, abort: new AbortController(), running: false }
    this.recalcProgress(runtime)
    this.jobs.set(jobId, runtime)
    this.active.set(projectId, jobId)
    this.runners.set(jobId, this.run(jobId).catch(() => {}))
    return this.publicJob(runtime)
  }

  /* ------------------------------ 执行 ------------------------------ */

  async run(jobId) {
    const job = this.jobs.get(jobId)
    if (!job || job.running) return
    job.running = true
    job.status = 'running'
    job.startedAt = job.startedAt || nowIso()
    this.recalcProgress(job)
    const signal = job.abort.signal
    try {
      const digest = await P.loadRulesDigest(this.repoRoot)
      const { project } = await this.store.getProject(job.projectId)
      // 概念（仅当设定集为空）
      if (!job.skipConcept) {
        await this.ensureConcept(job, project, signal, digest)
      }
      if (!job.skipConcept) {
        await this.ensureAssets(job, project, signal).catch((err) => {
          if (signal.aborted) throw err
          this.log(job, 'warn', `角色资产生成失败（不阻塞）：${err.message}`)
        })
      }
      for (const epState of job.episodes) {
        if (signal.aborted) throw new MoxiError('E_CANCELLED', 'cancelled')
        if (epState.status === 'done') continue
        job.progress.current = epState.ep
        epState.status = 'running'
        epState.error = null
        await this.persist(job)
        let ok = false
        for (let attempt = 1; attempt <= 2 && !ok; attempt += 1) {
          try {
            await this.generateEpisode(job, project, epState, signal, digest)
            epState.status = 'done'
            epState.stage = 'done'
            this.recalcProgress(job)
            ok = true
            this.log(job, 'info', `第 ${epState.ep} 集完成（净字数 ${epState.words}，findings ${epState.findings}）`)
          } catch (err) {
            if (signal.aborted) throw err
            epState.error = String(err && err.message ? err.message : err).slice(0, 300)
            if (attempt < 2) {
              this.log(job, 'warn', `第 ${epState.ep} 集第 ${attempt} 次失败，重试：${epState.error}`)
              await new Promise((r) => setTimeout(r, 1200))
            } else {
              epState.status = 'failed'
              this.recalcProgress(job)
              this.log(job, 'error', `第 ${epState.ep} 集失败：${epState.error}`)
            }
          }
        }
        epState.updatedAt = nowIso()
        this.recalcProgress(job)
        job.usage = { ...this.llm.stats() }
        await this.persist(job)
      }
      await this.finalize(job)
      job.status = job.progress.failed === 0 ? 'done' : 'done_with_errors'
      this.log(job, 'info', `任务结束：完成 ${job.progress.done} 集，失败 ${job.progress.failed} 集`)
    } catch (err) {
      const cancelled = signal.aborted || (err && err.code === 'E_CANCELLED')
      job.status = cancelled ? 'cancelled' : 'failed'
      this.log(job, cancelled ? 'warn' : 'error', `任务${cancelled ? '取消' : '失败'}：${err && err.message ? err.message : err}`)
    } finally {
      job.finishedAt = nowIso()
      job.progress.current = null
      job.running = false
      this.recalcProgress(job)
      await this.persist(job).catch(() => {})
      if (this.active.get(job.projectId) === job.id) this.active.delete(job.projectId)
    }
  }

  /** 同步补齐概念/角色资产（供 /project/ensure 与工具调用；不生成剧集） */
  async ensureByApi(projectId, what = 'all') {
    const { project } = await this.store.getProject(projectId)
    const job = {
      id: newId('job'), projectId, projectTitle: project.title, mode: 'ensure',
      from: 0, to: 0, status: 'running', createdAt: nowIso(), startedAt: nowIso(), finishedAt: null,
      provider: (this.getConfig().llmProvider) || 'deepseek-official',
      model: (this.getConfig().llmModel) || 'deepseek-flash',
      temperature: 0.7,
      progress: { total: 0, done: 0, failed: 0, current: null },
      episodes: [], snapshotId: null,
      log: [], usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
    }
    this.jobs.set(job.id, job)
    const signal = new AbortController().signal
    try {
      if (what === 'all' || what === 'concept') await this.ensureConcept(job, project, signal)
      if (what === 'all' || what === 'assets') await this.ensureAssets(job, project, signal)
      job.status = 'done'
      this.log(job, 'info', '概念/资产补齐完成')
    } catch (err) {
      job.status = 'failed'
      this.log(job, 'error', `补齐失败：${err.message}`)
      throw err
    } finally {
      job.finishedAt = nowIso()
      job.usage = { ...this.llm.stats() }
      await this.persist(job).catch(() => {})
    }
    return job
  }

  async ensureConcept(job, project, signal, digest) {
    const { canvas } = await this.store.getProject(job.projectId)
    const settings = canvas.nodes.find((n) => n.type === 'settings')
    if (!settings) return
    const cur = await this.store.getContent(job.projectId, settings.id).catch(() => ({ text: '' }))
    if (cur.text && cur.text.trim().length > 60) {
      this.log(job, 'info', '设定集已有内容，跳过概念生成')
      return
    }
    job.progress.current = 0
    this.log(job, 'info', '生成概念设定…')
    const r = await this.llm.complete({ system: P.SYSTEM, user: P.conceptPrompt(project, canvas), temperature: job.temperature, signal, provider: job.provider, model: job.model })
    await this.store.applyOps(job.projectId, [
      { op: 'node.write', nodeId: settings.id, text: r.text.trim() },
      { op: 'node.transition', nodeId: settings.id, to: 'generating', reason: 'batch-generate' },
      { op: 'node.transition', nodeId: settings.id, to: 'review', reason: 'batch-generate' },
    ], { actor: 'agent' })
    this.log(job, 'info', `概念已写入（${netWordCount(r.text)} 字）`)
  }

  /** 生成 4 个核心角色资产节点（若还没有资产正文） */
  async ensureAssets(job, project, signal) {
    const { canvas } = await this.store.getProject(job.projectId)
    const assets = canvas.nodes.filter((n) => n.type === 'asset')
    let hasContent = false
    for (const a of assets) {
      const c = await this.store.getContent(job.projectId, a.id).catch(() => ({ text: '' }))
      if (c.text && c.text.trim().length > 20) { hasContent = true; break }
    }
    if (hasContent) return
    this.log(job, 'info', '生成角色资产…')
    const user = `为下面这部短剧设计 4 个核心角色，每个角色一节，格式：
角色名｜身份/年龄｜外貌一句话｜性格三个词｜与主角关系｜人物弧光一句话

${P.projectBrief(project, canvas)}

只输出 4 个角色，不要解释。`
    const r = await this.llm.complete({ system: P.SYSTEM, user, temperature: job.temperature, signal, maxTokens: 1200, provider: job.provider, model: job.model })
    const blocks = String(r.text).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).slice(0, 4)
    const ops = []
    const existing = canvas.nodes.filter((n) => n.type === 'asset')
    const baseX = 40
    let y = 40
    for (const n of canvas.nodes) y = Math.max(y, n.y + n.h + 20)
    blocks.forEach((text, i) => {
      const name = (text.split(/[｜|]/)[0] || `角色${i + 1}`).replace(/^角色\s*[·:：]\s*/, '').trim().slice(0, 12)
      const reuse = existing[i]
      if (reuse) {
        ops.push({ op: 'node.update', nodeId: reuse.id, patch: { title: `角色 · ${name}`, meta: { ...(reuse.meta || {}), assetKind: 'character' } } })
        ops.push({ op: 'node.write', nodeId: reuse.id, text })
        if (reuse.status === 'draft') {
          ops.push({ op: 'node.transition', nodeId: reuse.id, to: 'generating', reason: 'batch-generate' })
          ops.push({ op: 'node.transition', nodeId: reuse.id, to: 'review', reason: 'batch-generate' })
        }
      } else {
        ops.push({ op: 'node.create', node: { type: 'asset', title: `角色 · ${name}`, x: baseX, y: y + i * 200, w: 260, h: 132, ref: { episode: null, scene: null }, meta: { assetKind: 'character', fields: {} } }, text })
      }
    })
    if (ops.length) {
      await this.store.applyOps(job.projectId, ops, { actor: 'agent', idempotencyKey: 'ensure-assets' })
      this.log(job, 'info', `角色资产已写入 ${blocks.length} 个`)
    }
  }

  /** 找到或创建某集的分镜节点 */
  async ensureEpisodeNodes(job, ep) {
    const { canvas } = await this.store.getProject(job.projectId)
    const find = (type) => canvas.nodes.find((n) => n.type === type && n.ref && n.ref.episode === ep)
    const need = []
    const layout = (row) => ({ x: LAYOUT[row], y: 40 + (ep - 1) * 760 })
    let beat = find('beat_sheet')
    if (!beat) {
      const pos = layout('beat')
      need.push({ op: 'node.create', node: { type: 'beat_sheet', title: `第 ${pad(ep)} 集 · 节拍`, x: pos.x, y: pos.y, w: 280, h: NODE_H.beat_sheet, ref: { episode: ep, scene: null }, meta: { episode: ep } } })
    }
    let scenes = find('scene_list')
    if (!scenes) {
      const pos = layout('scene')
      need.push({ op: 'node.create', node: { type: 'scene_list', title: `第 ${pad(ep)} 集 · 分场表`, x: pos.x, y: pos.y, w: 280, h: NODE_H.scene_list, ref: { episode: ep, scene: null }, meta: { episode: ep } } })
    }
    let script = find('script_scene')
    if (!script) {
      const pos = layout('script')
      need.push({ op: 'node.create', node: { type: 'script_scene', title: `第 ${pad(ep)} 集 · 剧本`, x: pos.x, y: pos.y, w: 300, h: NODE_H.script_scene, ref: { episode: ep, scene: null }, meta: { episode: ep, sceneNo: null } } })
    }
    let quality = find('quality')
    if (!quality) {
      const pos = layout('check')
      need.push({ op: 'node.create', node: { type: 'quality', title: `第 ${pad(ep)} 集 · 质检`, x: pos.x, y: pos.y, w: 280, h: NODE_H.quality, ref: { episode: ep, scene: null }, meta: { episode: ep, findings: [], rubric: {} } } })
    }
    let compliance = find('compliance')
    if (!compliance) {
      const pos = layout('check')
      need.push({ op: 'node.create', node: { type: 'compliance', title: `第 ${pad(ep)} 集 · 合规`, x: pos.x, y: pos.y + 200, w: 280, h: NODE_H.compliance, ref: { episode: ep, scene: null }, meta: { episode: ep, findings: [], highestRisk: 'none' } } })
    }
    // 复用旧节点时统一标题与尺寸（骨架自带的"1-1 场次初稿"等要改成标准名）
    const fixes = []
    const rename = (node, title, w, h) => {
      if (!node) return
      if (node.title !== title || node.w !== w || node.h !== h) fixes.push({ op: 'node.update', nodeId: node.id, patch: { title, w, h } })
    }
    rename(beat, `第 ${pad(ep)} 集 · 节拍`, 280, NODE_H.beat_sheet)
    rename(scenes, `第 ${pad(ep)} 集 · 分场表`, 280, NODE_H.scene_list)
    rename(script, `第 ${pad(ep)} 集 · 剧本`, 300, NODE_H.script_scene)
    rename(quality, `第 ${pad(ep)} 集 · 质检`, 280, NODE_H.quality)
    rename(compliance, `第 ${pad(ep)} 集 · 合规`, 280, NODE_H.compliance)
    if (need.length || fixes.length) {
      await this.store.applyOps(job.projectId, [...need, ...fixes], { actor: 'agent', idempotencyKey: `ensure-ep-${ep}` })
    }
    let after = (await this.store.getProject(job.projectId)).canvas
    const ids = {
      beat: after.nodes.find((n) => n.type === 'beat_sheet' && n.ref?.episode === ep)?.id,
      scenes: after.nodes.find((n) => n.type === 'scene_list' && n.ref?.episode === ep)?.id,
      script: after.nodes.find((n) => n.type === 'script_scene' && n.ref?.episode === ep)?.id,
      quality: after.nodes.find((n) => n.type === 'quality' && n.ref?.episode === ep)?.id,
      compliance: after.nodes.find((n) => n.type === 'compliance' && n.ref?.episode === ep)?.id,
    }
    // 连线：beat→scene→script→quality / script→compliance；quality+compliance→delivery
    const hasEdge = (from, to) => after.edges.some((e) => e.from === from && e.to === to)
    const links = []
    const add = (from, to, kind = 'dependency') => {
      if (!from || !to || hasEdge(from, to)) return
      links.push({ op: 'edge.create', from, to, kind })
    }
    add(ids.beat, ids.scenes)
    add(ids.scenes, ids.script)
    add(ids.script, ids.quality)
    add(ids.script, ids.compliance)
    const delivery = after.nodes.find((n) => n.type === 'delivery')
    if (delivery) { add(ids.quality, delivery.id); add(ids.compliance, delivery.id) }
    if (links.length) {
      await this.store.applyOps(job.projectId, links, { actor: 'agent', idempotencyKey: `ensure-links-${ep}` }).catch((err) => {
        this.log(job, 'warn', `第 ${ep} 集连线失败（可忽略）：${err.message}`)
      })
      after = (await this.store.getProject(job.projectId)).canvas
    }
    return ids
  }

  async writeAndReview(job, nodeId, text) {
    const node = await this.nodeById(job, nodeId)
    const ops = [{ op: 'node.write', nodeId, text }]
    for (const to of this.pathTo(node, 'review')) ops.push({ op: 'node.transition', nodeId, to, reason: 'batch-generate' })
    await this.store.applyOps(job.projectId, ops, { actor: 'agent' })
  }

  pathTo(node, target) {
    const path = statePath(node ? node.status : 'draft', target)
    if (path === null) throw new MoxiError('E_TRANSITION', `无法从 ${node && node.status} 到 ${target}`)
    return path
  }

  async nodeById(job, nodeId) {
    const { canvas } = await this.store.getProject(job.projectId)
    return canvas.nodes.find((n) => n.id === nodeId)
  }

  /** 已生成的上一集结尾（用于接续） */
  async prevTail(job, ep) {
    if (ep <= 1) return ''
    const { canvas } = await this.store.getProject(job.projectId)
    const cands = canvas.nodes
      .filter((n) => n.type === 'script_scene' && n.ref?.episode === ep - 1)
      .sort((a, b) => a.ref.episode - b.ref.episode)
    if (!cands.length) return ''
    const { text } = await this.store.getContent(job.projectId, cands[0].id).catch(() => ({ text: '' }))
    return text.trim().slice(-400)
  }

  /** 读取「设定集角色表」（资产节点标题 + 正文摘要），供节拍/分场/剧本提示词沿用 */
  async buildCharacters(job) {
    const { canvas } = await this.store.getProject(job.projectId)
    const contents = {}
    for (const n of canvas.nodes) {
      if (n.type !== 'asset') continue
      try { contents[n.id] = (await this.store.getContent(job.projectId, n.id)).text } catch { contents[n.id] = '' }
    }
    return { canvas, digest: P.characterDigest(canvas, contents) }
  }

  async generateEpisode(job, project, epState, signal, digest) {
    const ep = epState.ep
    const ids = await this.ensureEpisodeNodes(job, ep)
    const prev = await this.prevTail(job, ep)
    const range = job.wordRange
    const say = (stage) => { epState.stage = stage; epState.updatedAt = nowIso() }

    // 1) 节拍
    say('beat')
    await this.persist(job)
    const chars = await this.buildCharacters(job)
    const beatRes = await this.llm.complete({ system: P.SYSTEM, user: P.beatPrompt(project, ep, prev, digest, chars), temperature: job.temperature, signal, maxTokens: 2400, provider: job.provider, model: job.model })
    const beats = clean(beatRes.text)
    await this.writeAndReview(job, ids.beat, beats)

    // 2) 分场
    say('scene')
    await this.persist(job)
    const sceneRes = await this.llm.complete({ system: P.SYSTEM, user: P.scenePrompt(project, ep, beats, chars), temperature: job.temperature, signal, maxTokens: 2400, provider: job.provider, model: job.model })
    const scenes = clean(sceneRes.text)
    await this.writeAndReview(job, ids.scenes, scenes)

    // 3) 剧本
    say('script')
    await this.persist(job)
    const scriptRes = await this.llm.complete({
      system: P.SYSTEM,
      user: P.scriptPrompt(project, ep, scenes, beats, prev, range.min, range.max, chars),
      temperature: job.temperature, signal, maxTokens: 10000, provider: job.provider, model: job.model,
    })
    let script = clean(scriptRes.text)
    await this.store.applyOps(job.projectId, [{ op: 'node.write', nodeId: ids.script, text: script }], { actor: 'agent' })
    // 正文重写 = 旧审批失效
    {
      const sn = await this.nodeById(job, ids.script)
      if (sn && sn.status === 'approved') {
        for (const to of this.pathTo(sn, 'draft') || []) {
          await this.store.applyOps(job.projectId, [{ op: 'node.transition', nodeId: ids.script, to, reason: 'rewrite-invalidate' }], { actor: 'agent' })
        }
      }
    }

    // 4) 确定性检查 + 一次自动修
    say('check')
    await this.persist(job)
    let check = await this.runChecks(job, ids.script, project)
    let guard = 0
    while (check.summary.errors > 0 && guard < 1) {
      guard += 1
      const fixRes = await this.llm.complete({
        system: P.SYSTEM,
        user: P.fixPrompt(project, ep, script, check.findings.filter((f) => f.severity === 'error' || f.severity === 'warning').slice(0, 6)),
        temperature: Math.min(job.temperature, 0.5), signal, maxTokens: 10000, provider: job.provider, model: job.model,
      })
      script = clean(fixRes.text)
      await this.store.applyOps(job.projectId, [{ op: 'node.write', nodeId: ids.script, text: script }], { actor: 'agent' })
      check = await this.runChecks(job, ids.script, project)
    }
    // 字数闸门：严格区间 [min, max]；最多 2 次定点增删，仍越界则判失败（由续跑/修复重试）
    let wordsNow = netWordCount(script)
    const targetWords = Math.round((range.min + range.max) / 2)
    for (let attempt = 0; attempt < 3 && (wordsNow < range.min || wordsNow > range.max); attempt += 1) {
      try {
        const lenFix = await this.llm.complete({
          system: P.SYSTEM,
          user: `这集剧本净字数 ${wordsNow}，超出要求。请把净字数调整到 ${targetWords} 字左右（必须落在 ${range.min}–${range.max}）。${wordsNow > range.max ? '压缩：删减重复的动作/环境描写、合并同类对白，不要删场次、不要删关键剧情。' : '扩写：增加具体动作、细节与有效对白，不要注水。'}输出完整剧本。\n\n${script}`,
          temperature: 0.4, signal, maxTokens: 10000, provider: job.provider, model: job.model,
        })
        const fixed = clean(lenFix.text)
        const fixedWords = netWordCount(fixed)
        const before = Math.abs(wordsNow - clamp(wordsNow, range))
        const after = Math.abs(fixedWords - clamp(fixedWords, range))
        if (after < before || (fixedWords >= range.min && fixedWords <= range.max)) {
          script = fixed
          await this.store.applyOps(job.projectId, [{ op: 'node.write', nodeId: ids.script, text: script }], { actor: 'agent' })
          check = await this.runChecks(job, ids.script, project)
          wordsNow = fixedWords
        } else {
          break
        }
      } catch (err) {
        if (signal.aborted) throw err
        this.log(job, 'warn', `第 ${ep} 集字数修正失败：${err.message}`)
        break
      }
    }
    epState.words = netWordCount(script)
    if (epState.words < range.min || epState.words > range.max) {
      throw new MoxiError('E_WORDS', `第 ${ep} 集字数 ${epState.words} 越界（${range.min}–${range.max}），判失败待重试`)
    }
    epState.findings = check.findings.length
    const verdict = check.summary.verdict
    const meta = { ...(await this.nodeMeta(job, ids.script)), findings: check.findings, rubric: check.summary, verdict, words: epState.words }
    const scriptNode = await this.nodeById(job, ids.script)
    const scriptOps = [{ op: 'node.update', nodeId: ids.script, patch: { meta } }]
    for (const to of this.pathTo(scriptNode, 'review')) scriptOps.push({ op: 'node.transition', nodeId: ids.script, to, reason: 'batch-generate' })
    await this.store.applyOps(job.projectId, scriptOps, { actor: 'agent' })

    // 5) 质检节点：写报告 + 记录
    const qText = [
      `第 ${ep} 集 · 确定性检查`,
      `净字数：${epState.words}（目标 ${range.min}–${range.max}）`,
      `结论：${verdict}（errors ${check.summary.errors} / warnings ${check.summary.warnings}）`,
      '',
      check.findings.length ? check.findings.map((f) => `- [${f.severity}] ${f.code} ${f.message}`).join('\n') : '无问题',
    ].join('\n')
    const qNode = await this.nodeById(job, ids.quality)
    const qOps = [
      { op: 'node.write', nodeId: ids.quality, text: qText },
      { op: 'node.update', nodeId: ids.quality, patch: { meta: { episode: ep, findings: check.findings, rubric: check.summary, verdict } } },
    ]
    for (const to of this.pathTo(qNode, 'review')) qOps.push({ op: 'node.transition', nodeId: ids.quality, to, reason: 'batch-generate' })
    await this.store.applyOps(job.projectId, qOps, { actor: 'agent' })

    // 6) 合规节点：确定性红线做闸门，AI 评审只作建议
    say('compliance')
    await this.persist(job)
    const scan = checkCompliance({ text: script })
    let aiFindings = []
    let aiDegraded = false
    try {
      const compRes = await this.llm.complete({ system: P.SYSTEM, user: P.compliancePrompt(project, ep, script), temperature: 0.2, signal, maxTokens: 2400, provider: job.provider, model: job.model })
      aiFindings = parseComplianceList(compRes.text, ep).map((f) => ({ ...f, source: 'ai', severity: 'warning', level: 'warning' }))
      if (complianceReplyUnparseable(compRes.text)) aiDegraded = true
    } catch (err) {
      if (signal.aborted) throw err
      aiDegraded = true
      this.log(job, 'warn', `第 ${ep} 集 AI 合规评审不可用（不影响闸门）：${err.message}`)
    }
    const allFindings = scan.findings.concat(aiFindings)
    const redlineCount = scan.summary.redline
    const highestRisk = redlineCount ? 'redline' : scan.summary.highRisk ? 'high_risk' : allFindings.length ? 'warning' : 'none'
    const compSummary = {
      ...scan.summary,
      aiAdvisory: aiFindings.length,
      aiDegraded,
      highestRisk,
      verdict: redlineCount ? 'reject' : highestRisk === 'high_risk' ? 'conditional' : allFindings.length ? 'conditional' : 'pass',
    }
    const cNode = await this.nodeById(job, ids.compliance)
    const cOps = [
      { op: 'node.write', nodeId: ids.compliance, text: allFindings.length ? allFindings.map((f) => `- [${f.level || f.severity}] ${f.message}${f.evidence ? `（${f.evidence}）` : ''}`).join(String.fromCharCode(10)) : '无风险项' },
      { op: 'node.update', nodeId: ids.compliance, patch: { meta: { episode: ep, findings: allFindings, highestRisk, deterministicRedline: redlineCount, degraded: aiDegraded, rubric: compSummary } } },
    ]
    for (const to of this.pathTo(cNode, 'review')) cOps.push({ op: 'node.transition', nodeId: ids.compliance, to, reason: 'batch-generate' })
    await this.store.applyOps(job.projectId, cOps, { actor: 'agent' })
    epState.complianceRedline = redlineCount

    await this.store.appendEvents(job.projectId, [{
      actor: 'agent', op: 'generate.episode', nodeId: ids.script,
      data: { jobId: job.id, ep, words: epState.words, verdict, findings: check.findings.length, compliance: allFindings.length, complianceRedline: redlineCount },
    }])
    say('done')
  }

  async nodeMeta(job, nodeId) {
    const { canvas } = await this.store.getProject(job.projectId)
    return (canvas.nodes.find((n) => n.id === nodeId) || {}).meta || {}
  }

  async runChecks(job, nodeId, project) {
    const { canvas } = await this.store.getProject(job.projectId)
    const node = canvas.nodes.find((n) => n.id === nodeId)
    const { text } = await this.store.getContent(job.projectId, nodeId)
    return checkNode({ project, canvas, node, text })
  }

  /**
   * 收尾：以「当前报告」重验全部相关集
   * - 不达标/降级/失败集 → 撤销旧批准（质检、合规置 blocked），delivery 置 blocked
   * - 全项目每集都达标 → 批准质检/合规，并放行 delivery
   * 注意：即使本任务有失败集也要执行撤销部分，避免旧批准残留。
   */
  async finalize(job) {
    const { canvas } = await this.store.getProject(job.projectId)
    const attempted = new Set(job.episodes.map((e) => e.ep))
    const failedEps = new Set(job.episodes.filter((e) => e.status === 'failed').map((e) => e.ep))
    const ops = []
    const passOf = (n) => {
      const m = n.meta || {}
      const r = m.rubric || {}
      if (n.type === 'quality') return r.errors === 0 && r.verdict !== 'reject'
      if (n.type === 'compliance') return (m.deterministicRedline || 0) === 0
      return false
    }
    const byEp = new Map()
    for (const n of canvas.nodes) {
      const ep = Number(n.ref && n.ref.episode)
      if (!ep) continue
      if (!byEp.has(ep)) byEp.set(ep, {})
      byEp.get(ep)[n.type] = n
    }

    // ① 本任务涉及的集：达标则批准（含剧本/节拍/分场），不达标且已批准则撤销
    for (const ep of attempted) {
      const rec = byEp.get(ep) || {}
      const q0 = rec.quality
      const c0 = rec.compliance
      const epOk = !failedEps.has(ep) && q0 && c0 && passOf(q0) && passOf(c0)
      if (epOk) {
        for (const type of ['beat_sheet', 'scene_list', 'script_scene']) {
          const n = rec[type]
          if (n && n.status !== 'approved') {
            for (const to of this.pathTo(n, 'approved') || []) ops.push({ op: 'node.transition', nodeId: n.id, to, reason: 'batch-generate' })
          }
        }
      }
      for (const type of ['quality', 'compliance']) {
        const n = rec[type]
        if (!n) continue
        const ok = !failedEps.has(ep) && passOf(n)
        if (ok && n.status !== 'approved') {
          for (const to of this.pathTo(n, 'approved') || []) ops.push({ op: 'node.transition', nodeId: n.id, to, reason: 'batch-generate' })
        } else if (!ok && n.status === 'approved') {
          for (const to of this.pathTo(n, 'blocked') || []) ops.push({ op: 'node.transition', nodeId: n.id, to, reason: 'batch-invalidate' })
        }
      }
      // 失败集：剧本若已批准也撤销
      const script = rec.script_scene
      if (failedEps.has(ep) && script && script.status === 'approved') {
        for (const to of this.pathTo(script, 'draft') || []) ops.push({ op: 'node.transition', nodeId: script.id, to, reason: 'batch-invalidate' })
      }
    }

    // ② 全项目是否达标（以当前报告为准，历史 approved 不算数）
    let allOk = byEp.size > 0 && failedEps.size === 0
    for (const [ep, rec] of byEp) {
      if (failedEps.has(ep)) { allOk = false; break }
      if (!rec.script_scene) { allOk = false; break }
      const q = rec.quality
      const c = rec.compliance
      if (!q || !c || !passOf(q) || !passOf(c)) { allOk = false; break }
    }
    // 第一批：质检/合规（可能触发下游阻塞传播）
    if (ops.length) {
      await this.store.applyOps(job.projectId, ops, { actor: 'agent' }).catch((err) => {
        this.log(job, 'warn', `收尾（质检/合规）迁移失败：${err.message}`)
      })
    }
    // 第二批：delivery（重读画布后按真实状态计算，避免被传播后重复迁移）
    const latest = (await this.store.getProject(job.projectId)).canvas
    const delivery = latest.nodes.find((n) => n.type === 'delivery')
    const proj = (await this.store.getProject(job.projectId)).project
    const releasedAtRev = Number(proj.releasedAtRev) || 0
    const contentChanged = releasedAtRev > 0 && Number(canvas.rev) > releasedAtRev
    const released = proj.reviewState === 'released' && !contentChanged
    if (proj.reviewState === 'released' && contentChanged) {
      // 放行后又改了稿：放行失效，回到"待放行"
      this.log(job, 'warn', `稿件在放行后有更新（rev ${releasedAtRev} → ${canvas.rev}），放行状态已失效`)
      try { await this.store.updateProject(job.projectId, { reviewState: 'generated', releasedAtRev: null, revokedAt: nowIso() }) } catch { /* ignore */ }
    }
    if (delivery) {
      const dOps = []
      if (allOk) {
        // 生成完成 ≠ 可交付：只推进到 review，等待作者人工放行（已放行的项目保持 approved）
        if (!released && delivery.status !== 'review') {
          for (const to of this.pathTo(delivery, 'review') || []) dOps.push({ op: 'node.transition', nodeId: delivery.id, to, reason: 'batch-generated' })
        }
      } else if (delivery.status === 'approved' || delivery.status === 'review') {
        for (const to of this.pathTo(delivery, 'blocked') || []) dOps.push({ op: 'node.transition', nodeId: delivery.id, to, reason: 'batch-invalidate' })
      }
      if (dOps.length) {
        await this.store.applyOps(job.projectId, dOps, { actor: 'agent' }).catch((err) => {
          this.log(job, 'warn', `收尾（delivery）迁移失败：${err.message}`)
        })
      }
    }
    // 标记项目评审状态
    try {
      if (allOk) {
        const cur = (await this.store.getProject(job.projectId)).project
        if (cur.reviewState !== 'released') {
          await this.store.updateProject(job.projectId, { reviewState: 'generated', generatedAt: nowIso() })
        }
      } else {
        await this.store.updateProject(job.projectId, { reviewState: 'has_errors' })
      }
    } catch { /* 元数据失败不阻塞 */ }
    this.log(job, 'info', `收尾：全项目达标=${allOk}；失败集=${[...failedEps].join(',') || '无'}`)
  }
}

/* ------------------------------ 工具 ------------------------------ */

/** 计算把节点推到 target 状态需要的最小合法路径 */
export function statePath(current, target) {
  if (current === target) return []
  const T = {
    draft: ['generating'],
    generating: ['review', 'draft'],
    review: ['approved', 'rejected'],
    rejected: ['draft', 'review'],
    approved: ['blocked', 'draft'],
    blocked: ['approved', 'draft'],
  }
  // 用 DFS 找最短路径
  const queue = [[current]]
  const seen = new Set([current])
  while (queue.length) {
    const path = queue.shift()
    const cur = path[path.length - 1]
    if (cur === target) return path.slice(1)
    for (const nxt of T[cur] || []) {
      if (seen.has(nxt)) continue
      // 目标为 review 时，允许 review 自身作为终点
      seen.add(nxt)
      queue.push([...path, nxt])
    }
  }
  return null
}

function clamp(v, range) {
  return Math.min(range.max, Math.max(range.min, v))
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function clean(text) {
  return String(text || '')
    .replace(/^```[a-zA-Z]*\n/, '')
    .replace(/\n```\s*$/, '')
    .replace(/<!--TRUNCATED-->/g, '')
    .trim()
}

function parseComplianceList(text, ep) {
  const out = []
  const raw = String(text || '').trim()
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const LV = /(redline|high[_ ]?risk|warning|高危|高风险|提示|预警)\s*[\]】]?\s*[｜|:：\-—]?/i
  for (const line of lines) {
    const t = line.replace(/^[-*\d.、)\s]+/, '').trim()
    if (!t) continue
    if (/^无[。.]?$/.test(t) || /^无风险/.test(t)) continue
    const m = LV.exec(t)
    if (!m) continue
    const token = m[1].toLowerCase()
    let level = 'warning'
    if (/redline|高危/.test(token)) level = 'redline'
    else if (/high[_ ]?risk|高风险/.test(token)) level = 'high_risk'
    out.push({
      code: 'AI-COMPLIANCE',
      severity: level === 'warning' ? 'warning' : 'error',
      message: t.slice(0, 180), nodeId: null, line: null, evidence: `第${ep}集`,
    })
  }
  return out.slice(0, 8)
}

/** 模型合规回复是否可解析：空/“无” 视为零风险；有内容但解析不到任何级别 → 不可解析 */
function complianceReplyUnparseable(text) {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (/^无[。.]?$/.test(raw) || /^无风险/.test(raw)) return false
  const parsed = parseComplianceList(raw, 0)
  const hasRiskWord = /(redline|high[_ ]?risk|warning|高危|高风险|预警|提示)/i.test(raw)
  if (!hasRiskWord) return false
  // 出现风险词但解析不出任何级别 → 视为不可解析
  if (parsed.length === 0) return true
  // 文本含 redline/高危 字样但解析结果里没有对应项 → 也可能漏判
  const rawRedline = /(redline|高危)/i.test(raw)
  const parsedRedline = parsed.some((f) => /redline|高危/i.test(f.message))
  if (rawRedline && !parsedRedline) return true
  return false
}
