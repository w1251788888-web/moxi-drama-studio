/**
 * moxi-core · 数据层（项目工作区文件 = 唯一真源）
 *
 * 契约：docs/设计/数据契约-v1.md（目录、JSON、状态机、事件、§9 事务协议）
 * 纪律：UI 与 Agent 工具都只能经此层写盘；任何写入走 txn（写前备份，可无损回滚）。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  MoxiError, badRequest, writeFileAtomic, writeJsonAtomic, readJson, appendJsonl,
  readJsonl, exists, newId, sha256, nowIso, assertSafeId, projectDir, withLock,
} from './util.js'

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

export const NODE_TYPES = [
  'project_root', 'settings', 'asset', 'beat_sheet', 'scene_list',
  'script_scene', 'quality', 'compliance', 'delivery',
]

const TRANSITIONS = {
  draft: ['generating'],
  generating: ['review', 'draft'],
  review: ['approved', 'rejected'],
  rejected: ['draft', 'review'],
  approved: ['blocked'],
  blocked: ['approved', 'draft'],
}
// approved 允许被 reopen：approved -> draft 需显式 op（这里放开为 approved->blocked 之外的 revise）
TRANSITIONS.approved = ['blocked', 'draft']

const TERMINAL = new Set(['approved'])

const CONTENT_MAX_BYTES = 2 * 1024 * 1024

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

function assertProjectShape(project) {
  if (!project || typeof project !== 'object') throw badRequest('project 必须是对象')
  if (typeof project.title !== 'string' || !project.title.trim()) throw badRequest('项目名不能为空')
  if (project.episodeCount != null && (!Number.isInteger(project.episodeCount) || project.episodeCount <= 0)) {
    throw badRequest('episodeCount 必须是正整数或 null')
  }
  return project
}

function validateCanvas(canvas) {
  if (!canvas || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)) {
    throw badRequest('canvas 结构非法')
  }
  const ids = new Set()
  for (const n of canvas.nodes) {
    if (typeof n.id !== 'string' || ids.has(n.id)) throw badRequest(`节点 id 重复或非法: ${n && n.id}`)
    ids.add(n.id)
    if (!NODE_TYPES.includes(n.type)) throw badRequest(`未知节点类型: ${n.type}`)
    if (!['draft', 'generating', 'review', 'rejected', 'approved', 'blocked'].includes(n.status)) {
      throw badRequest(`未知节点状态: ${n.status}`)
    }
    for (const k of ['x', 'y', 'w', 'h']) {
      if (typeof n[k] !== 'number' || !Number.isFinite(n[k])) throw badRequest(`节点 ${n.id} 的 ${k} 非数字`)
    }
  }
  const edgeKeys = new Set()
  for (const e of canvas.edges) {
    if (typeof e.id !== 'string') throw badRequest('边 id 非法')
    if (!ids.has(e.from) || !ids.has(e.to)) throw badRequest(`边引用不存在的节点: ${e.from} -> ${e.to}`)
    if (e.from === e.to) throw badRequest('不允许自环边')
    if (!['dependency', 'context'].includes(e.kind)) throw badRequest(`未知边类型: ${e.kind}`)
    const k = `${e.from}|${e.to}|${e.kind}`
    if (edgeKeys.has(k)) throw badRequest('重复边')
    edgeKeys.add(k)
  }
  // dependency 子图必须是 DAG
  const adj = new Map()
  for (const n of canvas.nodes) adj.set(n.id, [])
  for (const e of canvas.edges) if (e.kind === 'dependency') adj.get(e.from).push(e.to)
  const state = new Map()
  const dfs = (id) => {
    const s = state.get(id)
    if (s === 1) throw badRequest(`dependency 出现环: ${id}`)
    if (s === 2) return
    state.set(id, 1)
    for (const nx of adj.get(id) || []) dfs(nx)
    state.set(id, 2)
  }
  for (const id of ids) dfs(id)
  return canvas
}

function assertTransition(from, to) {
  const allowed = TRANSITIONS[from] || []
  if (!allowed.includes(to)) {
    throw new MoxiError(
      'E_TRANSITION',
      `非法状态迁移: ${from} -> ${to}；${from} 只允许 -> ${allowed.join(' / ') || '（终态，无出边）'}`,
      { from, to, allowed }
    )
  }
}

/* ------------------------------------------------------------------ *
 * 锁：项目级串行 + 幂等缓存
 * ------------------------------------------------------------------ */
const lastSeq = new Map()

export class Store {
  constructor({ projectsRoot }) {
    this.root = projectsRoot
    this.txnCounter = 0
  }

  dir(projectId) {
    assertSafeId(projectId, 'projectId')
    return projectDir(this.root, projectId)
  }

  async ensureRoot() {
    await fs.mkdir(this.root, { recursive: true })
  }

  /* ---------------- 项目 ---------------- */

  async listProjects() {
    await this.ensureRoot()
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => [])
    const out = []
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue
      const file = path.join(this.root, ent.name, 'project.json')
      try {
        const p = await readJson(file)
        out.push({
          id: p.id, title: p.title, episodeCount: p.episodeCount, status: p.status,
          genre: p.genre || null, audience: p.audience || null,
          reviewState: p.reviewState || null,
          releasedAtRev: p.releasedAtRev || null,
          updatedAt: p.updatedAt, createdAt: p.createdAt,
        })
      } catch {
        // 跳过损坏项目，不中断列表
      }
    }
    out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return out
  }

  async createProject(input = {}) {
    await this.ensureRoot()
    const title = String(input.title || '').trim()
    if (!title) throw badRequest('项目名不能为空')
    // 唯一性（不区分大小写）
    const existing = await this.listProjects()
    if (existing.some((p) => p.title.toLowerCase() === title.toLowerCase())) {
      throw new MoxiError('E_DUP_TITLE', `项目名已存在: ${title}`)
    }
    const episodeCount = input.episodeCount == null ? null : Number(input.episodeCount)
    const episodeSeconds = Number(input.episodeSeconds) || 90
    const projectId = newId('proj')
    const dir = this.dir(projectId)
    await fs.mkdir(dir, { recursive: true })
    const ts = nowIso()
    const project = assertProjectShape({
      schemaVersion: 1,
      id: projectId,
      title,
      logline: String(input.logline || ''),
      genre: input.genre || { main: '', sub: '' },
      audience: input.audience || '',
      format: input.format || '真人短剧',
      episodeCount: Number.isFinite(episodeCount) ? episodeCount : null,
      episodeSeconds,
      wordRange: input.wordRange || {
        min: Math.round((episodeSeconds * 1000) / 90),
        max: Math.round((episodeSeconds * 1550) / 90),
      },
      sceneHeaderStyle: input.sceneHeaderStyle || 'bracket',
      status: 'active',
      rulesPack: input.rulesPack || 'rules/v2',
      createdAt: ts,
      updatedAt: ts,
    })
    const canvas = buildSkeleton(project)
    validateCanvas(canvas)
    await writeJsonAtomic(path.join(dir, 'project.json'), project)
    await writeJsonAtomic(path.join(dir, 'canvas.json'), canvas)
    await fs.mkdir(path.join(dir, 'content'), { recursive: true })
    await fs.mkdir(path.join(dir, 'history'), { recursive: true })
    await this.appendEvents(projectId, [
      { actor: 'user', op: 'project.create', nodeId: null, data: { title, episodeCount } },
    ])
    return { project, canvas }
  }

  async getProject(projectId) {
    const dir = this.dir(projectId)
    const project = await readJson(path.join(dir, 'project.json')).catch(() => {
      throw new MoxiError('E_NOT_FOUND', `项目不存在: ${projectId}`)
    })
    const canvas = await readJson(path.join(dir, 'canvas.json')).catch(() => {
      throw new MoxiError('E_NOT_FOUND', `画布不存在: ${projectId}`)
    })
    return { project, canvas }
  }

  /** 状态路径 BFS（store 内部用，避免与 generate.js 循环依赖） */
  _statePath(from, to, maxDepth = 6) {
    if (from === to) return []
    const queue = [[from]]
    const seen = new Set([from])
    while (queue.length) {
      const path = queue.shift()
      const cur = path[path.length - 1]
      for (const next of TRANSITIONS[cur] || []) {
        if (seen.has(next)) continue
        const np = path.concat(next)
        if (next === to) return np.slice(1)
        if (np.length < maxDepth) { seen.add(next); queue.push(np) }
      }
    }
    return null
  }

  /**
   * 稿件变更后撤销放行。
   * 任何改正文/改节点元数据的写操作都应调用：放行绑定在当时那一版稿件上。
   */
  async revokeRelease(projectId, reason = 'content-changed') {
    const dir = this.dir(projectId)
    const project = await readJson(path.join(dir, 'project.json')).catch(() => null)
    if (!project || project.reviewState !== 'released') return { revoked: false }
    await this.updateProject(projectId, {
      reviewState: 'generated', releasedAtRev: null, releasedScripts: null,
      revokedAt: nowIso(), revokeReason: reason,
    })
    // delivery 从 approved 降回 review（合法路径）
    try {
      const canvas = await readJson(path.join(dir, 'canvas.json'))
      const delivery = canvas.nodes.find((n) => n.type === 'delivery')
      if (delivery && delivery.status === 'approved') {
        // 逐步迁移（每步重读当前状态，避免批量校验与状态传播冲突）
        for (let i = 0; i < 6; i += 1) {
          const cur = (await readJson(path.join(dir, 'canvas.json'), true)).nodes.find((n) => n.id === delivery.id)
          if (!cur || cur.status === 'review') break
          const step = (this._statePath(cur.status, 'review') || [])[0]
          if (!step) break
          await this.applyOps(projectId, [{ op: 'node.transition', nodeId: delivery.id, to: step, reason: 'release-revoked' }], { actor: 'system' })
        }
      }
    } catch { /* 画布异常不影响放行撤销 */ }
    await this.appendEvents(projectId, [{
      actor: 'system', op: 'project.release.revoked', nodeId: null, data: { reason },
    }]).catch(() => {})
    return { revoked: true, reason }
  }

  /** 更新 project.json 的部分字段（内部用：评审状态等） */
  async updateProject(projectId, patch = {}) {
    const dir = this.dir(projectId)
    const project = await readJson(path.join(dir, 'project.json'))
    const next = { ...project, ...patch, updatedAt: nowIso() }
    await writeJsonAtomic(path.join(dir, 'project.json'), next)
    return next
  }

  async getRev(projectId) {
    const canvas = await readJson(path.join(this.dir(projectId), 'canvas.json')).catch(() => {
      throw new MoxiError('E_NOT_FOUND', `画布不存在: ${projectId}`)
    })
    return canvas.rev
  }

  async deleteProject(projectId) {
    const dir = this.dir(projectId)
    await this.getProject(projectId)
    const trash = path.join(this.root, '.trash')
    await fs.mkdir(trash, { recursive: true })
    const dest = path.join(trash, `${projectId}.${Date.now()}`)
    await fs.rename(dir, dest)
    return { trashPath: dest }
  }

  /* ---------------- 正文 ---------------- */

  assertInsideProject(projectId, rel) {
    const base = this.dir(projectId)
    const abs = path.resolve(base, rel)
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      throw badRequest(`路径越界：${rel}`)
    }
    return abs
  }

  async getContent(projectId, nodeId) {
    const { canvas } = await this.getProject(projectId)
    const node = canvas.nodes.find((n) => n.id === nodeId)
    if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${nodeId}`)
    if (!node.contentFile) return { text: '', version: node.contentVersion || 0 }
    const rel = node.contentFile
    const file = this.assertInsideProject(projectId, rel)
    let text = ''
    try {
      text = await fs.readFile(file, 'utf8')
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err
    }
    return { text, version: node.contentVersion || 0 }
  }

  /* ---------------- 写事务（§9） ---------------- */

  /**
   * 应用一批 CanvasOp（原子）。
   * @param {string} projectId
   * @param {Array} ops
   * @param {{actor?:string, baseRev?:number, idempotencyKey?:string}} opts
   */
  async applyOps(projectId, ops, opts = {}) {
    if (!Array.isArray(ops) || ops.length === 0) throw badRequest('ops 不能为空')
    return withLock(`project:${projectId}`, async () => {
      const { project, canvas } = await this.getProject(projectId)
      const baseRev = canvas.rev
      if (opts.baseRev != null && Number(opts.baseRev) !== baseRev) {
        throw new MoxiError('E_CONFLICT', '画布版本冲突', { latestRev: baseRev })
      }
      const explicitIdem = typeof opts.idempotencyKey === 'string' && opts.idempotencyKey.length > 0
      // 未显式给 key 时用随机值：只做审计关联，不做重放（避免"同内容不同意图"被误判为重复）
      const idem = explicitIdem ? opts.idempotencyKey : `auto_${newId('idem')}`
      if (explicitIdem) {
        const txnDone = await this.findCompletedTxn(projectId, idem)
        if (txnDone) return { rev: txnDone.rev, results: txnDone.results, idempotentReplay: true }
      }

      // 1) 内存应用
      const draft = structuredClone(canvas)
      const results = []
      const touchedContent = [] // { nodeId, text }
      for (const op of ops) applyOneOp(draft, op, results, touchedContent)

      // 2) txn 目录 + 备份
      const txnId = newId('txn')
      const txnDir = path.join(this.dir(projectId), 'history', 'txn', txnId)
      const backupDir = path.join(txnDir, 'backup')
      await fs.mkdir(backupDir, { recursive: true })
      const backups = []
      for (const item of touchedContent) {
        const node = canvas.nodes.find((n) => n.id === item.nodeId)
        const rel = (node && node.contentFile) || `content/${item.nodeId}.md`
        const abs = path.join(this.dir(projectId), rel)
        let prevText = ''
        try {
          prevText = await fs.readFile(abs, 'utf8')
        } catch (err) {
          if (!err || err.code !== 'ENOENT') throw err
        }
        const safe = rel.replace(/[\\/]/g, '__')
        await writeFileAtomic(path.join(backupDir, safe), prevText)
        backups.push({ file: rel, backup: path.join('backup', safe), prevSha256: sha256(prevText) })
      }
      const txn = {
        txnId, projectId, baseRev, idempotencyKey: idem,
        ops, contentFiles: backups.map((b) => b.file), backups,
        startedAt: nowIso(),
      }
      await writeJsonAtomic(path.join(txnDir, 'txn.json'), txn)

      // 3) 写正文 + 4) 写 canvas（提交点）——这一段失败必须整体回滚
      try {
        for (const item of touchedContent) {
          const node = draft.nodes.find((n) => n.id === item.nodeId)
          if (!node) continue
          node.contentFile = node.contentFile || `content/${node.id}.md`
          node.contentVersion = (node.contentVersion || 0) + 1
          const abs = this.assertInsideProject(projectId, node.contentFile)
          await writeFileAtomic(abs, item.text)
        }
        draft.rev = baseRev + 1
        draft.updatedAt = nowIso()
        await writeJsonAtomic(path.join(this.dir(projectId), 'canvas.json'), draft)
      } catch (err) {
        await this.rollbackTxn(projectId, txnId).catch(() => {})
        throw err
      }

      // 以下为"提交后"阶段：一律前滚，失败只记录，绝不回滚已提交的数据
      const events = results.map((r, i) => ({
        actor: opts.actor || 'user',
        op: r.op, nodeId: r.nodeId || null,
        data: { txnId, index: i, ...(r.data || {}) },
      }))
      try {
        await this.appendEvents(projectId, events, idem)
      } catch (evErr) {
        const pendingFile = path.join(this.dir(projectId), 'history', 'pending-events.jsonl')
        await appendJsonl(pendingFile, events.map((e) => ({ ...e, projectId }))).catch(() => {})
        this.logger?.warn?.(`[moxi] 事件写入失败，已记 pending：${evErr.message}`)
      }
      try {
        const doneDir = path.join(this.dir(projectId), 'history', 'txn-done')
        await fs.mkdir(doneDir, { recursive: true })
        await writeJsonAtomic(path.join(doneDir, `${txnId}.json`), {
          txnId, rev: draft.rev, at: nowIso(), results, idempotencyKey: explicitIdem ? idem : null,
        })
      } catch (doneErr) {
        this.logger?.warn?.(`[moxi] 完成记录写入失败（不影响本次提交）：${doneErr.message}`)
      }
      try {
        await fs.rm(txnDir, { recursive: true, force: true })
      } catch { /* 留给 recover 处理 */ }
      try {
        project.updatedAt = nowIso()
        await writeJsonAtomic(path.join(this.dir(projectId), 'project.json'), project)
      } catch { /* 元数据时间戳失败不影响数据 */ }
      return { rev: draft.rev, results }
    })
  }

  async findCompletedTxn(projectId, idempotencyKey) {
    const doneDir = path.join(this.dir(projectId), 'history', 'txn-done')
    let names = []
    try {
      names = await fs.readdir(doneDir)
    } catch {
      return null
    }
    for (const name of names.slice(-200)) {
      try {
        const rec = await readJson(path.join(doneDir, name))
        if (rec && rec.idempotencyKey === idempotencyKey) return rec
      } catch { /* ignore */ }
      // txn-done 记录里没存 idempotencyKey 时用 txn.json 的映射（保留兼容）
    }
    return null
  }

  /** 崩溃恢复：只处理陈旧 txn（>5 分钟），且只读路径里对同一项目只跑一次 */
  async recover(projectId) {
    this.recovered = this.recovered || new Set()
    if (this.recovered.has(projectId)) return { recovered: 0, skipped: 'cached' }
    this.recovered.add(projectId)
    return withLock(`project:${projectId}`, () => this._recoverUnlocked(projectId))
  }

  async _recoverUnlocked(projectId) {
    const txnRoot = path.join(this.dir(projectId), 'history', 'txn')
    let txnIds = []
    try {
      txnIds = await fs.readdir(txnRoot)
    } catch {
      return { recovered: 0 }
    }
    // 先重放 pending 事件（提交成功但事件写失败的情况）
    try {
      const pendingFile = path.join(this.dir(projectId), 'history', 'pending-events.jsonl')
      const rows = []
      for await (const ev of readJsonl(pendingFile)) rows.push(ev)
      if (rows.length) {
        await appendJsonl(path.join(this.dir(projectId), 'history', 'events.jsonl'), rows)
        await fs.rm(pendingFile, { force: true })
      }
    } catch { /* 忽略 */ }
    let recovered = 0
    const now = Date.now()
    for (const txnId of txnIds) {
      const txnDir = path.join(txnRoot, txnId)
      try {
        // 活跃事务（刚创建）不碰；避免读路径把正在提交的写事务回滚
        const st = await fs.stat(path.join(txnDir, 'txn.json')).catch(() => null)
        if (st && now - st.mtimeMs < 5 * 60 * 1000) continue
        const txn = await readJson(path.join(txnDir, 'txn.json'))
        const canvas = await readJson(path.join(this.dir(projectId), 'canvas.json'))
        if (canvas.rev === txn.baseRev + 1) {
          // 已提交，事件可能缺失 → 前滚补事件
          await this.appendEvents(projectId, [{
            actor: 'system', op: 'txn.recover', nodeId: null,
            data: { txnId, mode: 'roll-forward' },
          }])
        } else {
          // 未提交 → 无损回滚正文
          for (const b of txn.backups || []) {
            const abs = path.join(this.dir(projectId), b.file)
            const backupAbs = path.join(txnDir, b.backup)
            const text = await fs.readFile(backupAbs, 'utf8').catch(() => null)
            if (text !== null) {
              if (sha256(text) !== b.prevSha256 && text !== '') {
                throw new MoxiError('E_IO', `备份校验失败: ${b.file}`)
              }
              await writeFileAtomic(abs, text)
            }
          }
          await this.appendEvents(projectId, [{ actor: 'system', op: 'txn.recover', nodeId: null, data: { txnId, mode: 'rollback' } }])
        }
        await fs.rm(txnDir, { recursive: true, force: true })
        recovered += 1
      } catch (err) {
        if (err && err.code === 'E_IO') throw err
        // 其余忽略：留给人工
      }
    }
    return { recovered }
  }

  async rollbackTxn(projectId, txnId) {
    const txnDir = path.join(this.dir(projectId), 'history', 'txn', txnId)
    const txn = await readJson(path.join(txnDir, 'txn.json')).catch(() => null)
    if (txn) {
      for (const b of txn.backups || []) {
        const backupAbs = path.join(txnDir, b.backup)
        const text = await fs.readFile(backupAbs, 'utf8').catch(() => null)
        if (text !== null) await writeFileAtomic(path.join(this.dir(projectId), b.file), text)
      }
    }
    await fs.rm(txnDir, { recursive: true, force: true })
  }

  /* ---------------- 事件 ---------------- */

  async appendEvents(projectId, events, idempotencyKey = null) {
    const file = path.join(this.dir(projectId), 'history', 'events.jsonl')
    const seq = lastSeq.get(projectId) ?? (await this.readLastSeq(projectId))
    const ts = nowIso()
    const rows = events.map((e, i) => ({
      seq: seq + i + 1,
      ts,
      actor: e.actor || 'system',
      op: e.op,
      projectId,
      nodeId: e.nodeId || null,
      data: e.data || {},
      idempotencyKey: i === 0 ? idempotencyKey : null,
    }))
    await appendJsonl(file, rows)
    lastSeq.set(projectId, seq + events.length)
    return rows
  }

  async readLastSeq(projectId) {
    let last = 0
    for await (const ev of readJsonl(path.join(this.dir(projectId), 'history', 'events.jsonl'))) {
      if (typeof ev.seq === 'number') last = Math.max(last, ev.seq)
    }
    return last
  }

  async tailEvents(projectId, limit = 50) {
    const rows = []
    for await (const ev of readJsonl(path.join(this.dir(projectId), 'history', 'events.jsonl'))) {
      rows.push(ev)
    }
    return rows.slice(-Math.max(1, limit))
  }

  /** 跨项目最近事件（admin 日志页） */
  async globalEvents(limit = 200) {
    const projects = await this.listProjects()
    const all = []
    for (const p of projects) {
      const rows = await this.tailEvents(p.id, limit)
      for (const r of rows) all.push({ ...r, projectTitle: p.title })
    }
    all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)) || (b.seq - a.seq))
    return all.slice(0, limit)
  }

  /* ---------------- 概览统计 ---------------- */

  async overview() {
    const projects = await this.listProjects()
    let nodes = 0
    let pending = 0
    let approved = 0
    let blocked = 0
    const byType = {}
    const today = nowIso().slice(0, 10)
    let todayGenerated = 0
    for (const p of projects) {
      try {
        const { canvas } = await this.getProject(p.id)
        nodes += canvas.nodes.length
        for (const n of canvas.nodes) {
          byType[n.type] = (byType[n.type] || 0) + 1
          if (n.status === 'review' || n.status === 'rejected') pending += 1
          if (n.status === 'approved') approved += 1
          if (n.status === 'blocked') blocked += 1
        }
        for await (const ev of readJsonl(path.join(this.dir(p.id), 'history', 'events.jsonl'))) {
          if (String(ev.ts || '').startsWith(today) && ev.op === 'content.save' && ev.actor === 'agent') todayGenerated += 1
        }
      } catch { /* 跳过损坏项目 */ }
    }
    return {
      projects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'active').length,
      nodes, nodesByType: byType, pending, approved, blocked,
      todayGenerated,
      projectsRoot: this.root,
      generatedAt: nowIso(),
    }
  }
}

/* ------------------------------------------------------------------ *
 * CanvasOp 应用（纯函数）
 * ------------------------------------------------------------------ */

export function applyOneOp(canvas, op, results, touchedContent) {
  if (!op || typeof op.op !== 'string') throw badRequest('op 非法')
  switch (op.op) {
    case 'node.create': {
      const n = op.node || {}
      if (n.id != null && !/^[A-Za-z0-9_-]{1,64}$/.test(String(n.id))) {
        throw badRequest(`节点 id 非法（仅允许字母数字下划线连字符，≤64）：${n.id}`)
      }
      const node = {
        id: n.id || newId('n'),
        type: n.type,
        title: String(n.title || ''),
        status: 'draft',
        x: Number(n.x) || 0, y: Number(n.y) || 0, w: Number(n.w) || 280, h: Number(n.h) || 150,
        ref: n.ref || { episode: null, scene: null },
        contentFile: null,
        contentVersion: 0,
        meta: n.meta || {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      if (!NODE_TYPES.includes(node.type)) throw badRequest(`未知节点类型: ${node.type}`)
      if (canvas.nodes.some((x) => x.id === node.id)) throw badRequest(`节点 id 已存在: ${node.id}`)
      canvas.nodes.push(node)
      if (typeof op.text === 'string' && op.text.length) {
        touchedContent.push({ nodeId: node.id, text: op.text })
        node.contentFile = `content/${node.id}.md`
      }
      results.push({ op: 'node.create', nodeId: node.id, data: { type: node.type, title: node.title } })
      return
    }
    case 'node.update': {
      const node = canvas.nodes.find((n) => n.id === op.nodeId)
      if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${op.nodeId}`)
      const patch = op.patch || {}
      for (const k of ['title', 'x', 'y', 'w', 'h', 'meta', 'ref']) {
        if (k in patch) node[k] = patch[k]
      }
      node.updatedAt = nowIso()
      results.push({ op: 'node.update', nodeId: node.id, data: { fields: Object.keys(patch) } })
      return
    }
    case 'node.transition': {
      const node = canvas.nodes.find((n) => n.id === op.nodeId)
      if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${op.nodeId}`)
      assertTransition(node.status, op.to)
      const from = node.status
      node.status = op.to
      node.updatedAt = nowIso()
      // 下游阻塞传播
      if (op.to === 'rejected' || op.to === 'blocked') propagateBlocked(canvas, node.id)
      results.push({ op: 'node.transition', nodeId: node.id, data: { from, to: op.to, reason: op.reason || '' } })
      return
    }
    case 'node.write': {
      const node = canvas.nodes.find((n) => n.id === op.nodeId)
      if (!node) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${op.nodeId}`)
      const text = String(op.text ?? '')
      if (Buffer.byteLength(text, 'utf8') > CONTENT_MAX_BYTES) throw badRequest('正文超过 2MB 限制')
      if (typeof op.baseVersion === 'number' && op.baseVersion !== (node.contentVersion || 0)) {
        throw new MoxiError('E_CONFLICT', '正文版本冲突', { latestVersion: node.contentVersion || 0 })
      }
      node.contentFile = node.contentFile || `content/${node.id}.md`
      touchedContent.push({ nodeId: node.id, text })
      node.updatedAt = nowIso()
      results.push({ op: 'content.save', nodeId: node.id, data: { bytes: Buffer.byteLength(text, 'utf8') } })
      return
    }
    case 'node.delete': {
      const idx = canvas.nodes.findIndex((n) => n.id === op.nodeId)
      if (idx < 0) throw new MoxiError('E_NOT_FOUND', `节点不存在: ${op.nodeId}`)
      const [removed] = canvas.nodes.splice(idx, 1)
      canvas.edges = canvas.edges.filter((e) => e.from !== removed.id && e.to !== removed.id)
      results.push({ op: 'node.delete', nodeId: removed.id, data: {} })
      return
    }
    case 'edge.create': {
      const e = {
        id: op.id || newId('e'),
        from: op.from, to: op.to, kind: op.kind || 'dependency',
      }
      if (!canvas.nodes.some((n) => n.id === e.from)) throw badRequest(`from 不存在: ${e.from}`)
      if (!canvas.nodes.some((n) => n.id === e.to)) throw badRequest(`to 不存在: ${e.to}`)
      if (e.from === e.to) throw badRequest('不允许自环边')
      if (canvas.edges.some((x) => x.from === e.from && x.to === e.to && x.kind === e.kind)) {
        throw badRequest('重复边')
      }
      if (e.kind === 'dependency' && createsCycle(canvas, e.from, e.to)) throw badRequest('dependency 会成环')
      canvas.edges.push(e)
      results.push({ op: 'edge.create', nodeId: e.to, data: { from: e.from, to: e.to, kind: e.kind } })
      return
    }
    case 'edge.delete': {
      const before = canvas.edges.length
      canvas.edges = canvas.edges.filter((x) => x.id !== op.edgeId)
      if (canvas.edges.length === before) throw new MoxiError('E_NOT_FOUND', `边不存在: ${op.edgeId}`)
      results.push({ op: 'edge.delete', nodeId: null, data: { edgeId: op.edgeId } })
      return
    }
    case 'viewport.set': {
      canvas.viewport = { ...canvas.viewport, ...(op.viewport || {}) }
      results.push({ op: 'viewport.set', nodeId: null, data: {} })
      return
    }
    default:
      throw badRequest(`未知 op: ${op.op}`)
  }
}

function createsCycle(canvas, from, to) {
  // dependency 边：from -> to；检查从 to 能否回到 from
  const adj = new Map()
  for (const n of canvas.nodes) adj.set(n.id, [])
  for (const e of canvas.edges) if (e.kind === 'dependency') adj.get(e.from).push(e.to)
  adj.get(from).push(to)
  const seen = new Set()
  const stack = [to]
  while (stack.length) {
    const cur = stack.pop()
    if (cur === from) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const nx of adj.get(cur) || []) stack.push(nx)
  }
  return false
}

function propagateBlocked(canvas, fromNodeId) {
  const adj = new Map()
  for (const n of canvas.nodes) adj.set(n.id, [])
  for (const e of canvas.edges) if (e.kind === 'dependency') adj.get(e.from).push(e.to)
  const queue = [...(adj.get(fromNodeId) || [])]
  while (queue.length) {
    const id = queue.shift()
    const node = canvas.nodes.find((n) => n.id === id)
    if (!node) continue
    if (['blocked', 'rejected', 'draft', 'generating'].includes(node.status)) continue
    node.status = 'blocked'
    node.updatedAt = nowIso()
    queue.push(...(adj.get(id) || []))
  }
}

/* ------------------------------------------------------------------ *
 * 新项目骨架（画布铺出流程骨架）
 * ------------------------------------------------------------------ */

export function buildSkeleton(project) {
  const nodes = []
  const edges = []
  const push = (n) => { nodes.push(n); return n }
  const link = (from, to, kind = 'dependency') => edges.push({ id: newId('e'), from, to, kind })

  const root = push({
    id: newId('n'), type: 'project_root', title: '项目根', status: 'approved',
    x: 40, y: 40, w: 260, h: 132, ref: { episode: null, scene: null },
    contentFile: null, contentVersion: 0,
    meta: { audience: project.audience, episodeCount: project.episodeCount, logline: project.logline },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  const settings = push({
    id: newId('n'), type: 'settings', title: '设定集 · 世界观与主线', status: 'draft',
    x: 40, y: 230, w: 260, h: 132, ref: { episode: null, scene: null },
    contentFile: null, contentVersion: 0, meta: { coreFields: {} },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  const asset = push({
    id: newId('n'), type: 'asset', title: '角色 · 主角', status: 'draft',
    x: 40, y: 420, w: 260, h: 132, ref: { episode: null, scene: null },
    contentFile: null, contentVersion: 0, meta: { assetKind: 'character', fields: {} },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(root.id, settings.id)
  link(root.id, asset.id, 'context')
  link(settings.id, asset.id, 'context')

  const epCount = Math.min(Number(project.episodeCount) || 3, 3)
  const beatNodes = []
  for (let i = 1; i <= epCount; i += 1) {
    const n = push({
      id: newId('n'), type: 'beat_sheet', title: `第 ${String(i).padStart(2, '0')} 集 · 节拍`, status: 'draft',
      x: 380, y: 40 + (i - 1) * 200, w: 280, h: 150,
      ref: { episode: i, scene: null }, contentFile: null, contentVersion: 0,
      meta: { episode: i, hooks: [], anchors: [] },
      createdAt: project.createdAt, updatedAt: project.createdAt,
    })
    beatNodes.push(n)
    link(settings.id, n.id)
  }

  const sceneList = push({
    id: newId('n'), type: 'scene_list', title: '第 01 集 · 分场表', status: 'draft',
    x: 720, y: 40, w: 280, h: 150, ref: { episode: 1, scene: null },
    contentFile: null, contentVersion: 0, meta: { episode: 1, scenes: [] },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(beatNodes[0].id, sceneList.id)

  const script = push({
    id: newId('n'), type: 'script_scene', title: '1-1 场次初稿', status: 'draft',
    x: 1060, y: 40, w: 300, h: 170, ref: { episode: 1, scene: '1-1' },
    contentFile: null, contentVersion: 0, meta: { episode: 1, sceneNo: '1-1', wordCount: 0, segment: 1 },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(sceneList.id, script.id)

  const quality = push({
    id: newId('n'), type: 'quality', title: '第 01 集 · 质检', status: 'draft',
    x: 1400, y: 40, w: 280, h: 170, ref: { episode: 1, scene: null },
    contentFile: null, contentVersion: 0, meta: { episode: 1, findings: [], rubric: {}, verdict: null },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(script.id, quality.id)

  const compliance = push({
    id: newId('n'), type: 'compliance', title: '第 01 集 · 合规', status: 'draft',
    x: 1400, y: 260, w: 280, h: 170, ref: { episode: 1, scene: null },
    contentFile: null, contentVersion: 0, meta: { episode: 1, findings: [], highestRisk: 'none' },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(script.id, compliance.id)

  const delivery = push({
    id: newId('n'), type: 'delivery', title: '导出', status: 'blocked',
    x: 1400, y: 480, w: 280, h: 150, ref: { episode: null, scene: null },
    contentFile: null, contentVersion: 0, meta: { format: 'docx', exportPath: null },
    createdAt: project.createdAt, updatedAt: project.createdAt,
  })
  link(quality.id, delivery.id)
  link(compliance.id, delivery.id)

  return {
    schemaVersion: 1,
    rev: 1,
    updatedAt: project.createdAt,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    nodes,
    edges,
  }
}
