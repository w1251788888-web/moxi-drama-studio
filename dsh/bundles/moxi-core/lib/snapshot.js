/**
 * moxi-core · 项目快照（生成前的可回退点）
 *
 * 目录：<project>/history/snapshots/<ts>-<reason>/
 *   ├── meta.json      # 创建时间 / 原因 / 节点数 / 字数 / jobId
 *   ├── canvas.json    # 画布快照
 *   ├── project.json   # 项目元数据快照
 *   └── content/       # 全部正文快照
 *
 * 只保留最近 N 个（默认 10），更旧的自动清理。restore 前会自动为"当前状态"再拍一张，
 * 因此回退本身也可回退。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic, newId } from './util.js'

const KEEP = 10

function stamp() {
  return nowIso().replace(/[:+]/g, '-').slice(0, 19)
}

async function listFiles(dir) {
  const out = []
  const walk = async (d, rel = '') => {
    const ents = await fs.readdir(d, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      const abs = path.join(d, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(abs, r)
      else out.push(r)
    }
  }
  await walk(dir)
  return out
}

export class Snapshots {
  constructor({ store }) {
    this.store = store
  }

  dir(projectId) {
    return path.join(this.store.dir(projectId), 'history', 'snapshots')
  }

  async create(projectId, reason = 'manual', extra = {}) {
    const projectDir = this.store.dir(projectId)
    const { project, canvas } = await this.store.getProject(projectId)
    const id = `${stamp()}-${newId('snap').slice(5, 13)}`
    const target = path.join(this.dir(projectId), id)
    await fs.mkdir(path.join(target, 'content'), { recursive: true })
    await writeJsonAtomic(path.join(target, 'canvas.json'), canvas)
    await writeJsonAtomic(path.join(target, 'project.json'), project)
    let words = 0
    for (const n of canvas.nodes) {
      if (!n.contentFile) continue
      const src = path.join(projectDir, n.contentFile)
      const text = await fs.readFile(src, 'utf8').catch(() => null)
      if (text === null) continue
      words += text.replace(/\s/g, '').length
      const dst = path.join(target, n.contentFile)
      await fs.mkdir(path.dirname(dst), { recursive: true })
      await fs.writeFile(dst, text, 'utf8')
    }
    const meta = {
      id, reason, createdAt: nowIso(),
      nodes: canvas.nodes.length, edges: canvas.edges.length, rev: canvas.rev, words,
      projectTitle: project.title,
      ...extra,
    }
    await writeJsonAtomic(path.join(target, 'meta.json'), meta)
    await this.prune(projectId)
    return meta
  }

  async list(projectId) {
    const dir = this.dir(projectId)
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const out = []
    for (const e of ents) {
      if (!e.isDirectory()) continue
      const meta = await readJson(path.join(dir, e.name, 'meta.json')).catch(() => null)
      if (meta) out.push(meta)
    }
    return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  async prune(projectId) {
    const all = await this.list(projectId)
    for (const old of all.slice(KEEP)) {
      await fs.rm(path.join(this.dir(projectId), old.id), { recursive: true, force: true }).catch(() => {})
    }
  }

  /** 回退到指定快照（先把当前状态再拍一张，保证可撤销） */
  async restore(projectId, snapshotId) {
    const projectDir = this.store.dir(projectId)
    const snapDir = path.join(this.dir(projectId), snapshotId)
    const meta = await readJson(path.join(snapDir, 'meta.json')).catch(() => null)
    if (!meta) {
      const e = new Error(`快照不存在: ${snapshotId}`)
      e.code = 'E_NOT_FOUND'
      throw e
    }
    const safety = await this.create(projectId, `before-restore-to-${snapshotId}`)
    const canvas = await readJson(path.join(snapDir, 'canvas.json'))
    const project = await readJson(path.join(snapDir, 'project.json'))
    // 正文：先按快照覆盖，再删除快照里不存在的旧正文（避免残留）
    const files = await listFiles(path.join(snapDir, 'content'))
    const keep = new Set(files.map((f) => `content/${f}`))
    for (const rel of files) {
      const from = path.join(snapDir, 'content', rel)
      const to = path.join(projectDir, 'content', rel)
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.copyFile(from, to)
    }
    const current = await listFiles(path.join(projectDir, 'content'))
    for (const rel of current) {
      if (!keep.has(`content/${rel}`)) {
        await fs.rm(path.join(projectDir, 'content', rel), { force: true }).catch(() => {})
      }
    }
    // 画布 + 项目元数据（保留当前 rev 递增，避免轮询误判）
    const nowCanvas = await readJson(path.join(projectDir, 'canvas.json')).catch(() => ({ rev: 0 }))
    canvas.rev = Math.max(Number(nowCanvas.rev) || 0, Number(canvas.rev) || 0) + 1
    canvas.updatedAt = nowIso()
    await writeJsonAtomic(path.join(projectDir, 'canvas.json'), canvas)
    await writeJsonAtomic(path.join(projectDir, 'project.json'), { ...project, updatedAt: nowIso() })
    await this.store.appendEvents(projectId, [{
      actor: 'user', op: 'snapshot.restore', nodeId: null,
      data: { snapshotId, safetySnapshot: safety.id, nodes: canvas.nodes.length },
    }]).catch(() => {})
    return { restored: meta, safety, rev: canvas.rev }
  }
}
