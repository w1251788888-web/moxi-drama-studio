/**
 * moxi-core · 基础工具（无第三方依赖）
 * 只做：id 生成、原子写、sha256、路径安全、锁、时间。
 */
import { promises as fs } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 26 位 Crockford base32（ULID 风格，单调性不保证，仅需唯一） */
export function newId(prefix) {
  const bytes = randomBytes(16)
  let out = ''
  let bits = 0
  let acc = 0
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(acc >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += CROCKFORD[(acc << (5 - bits)) & 31]
  return `${prefix}_${out.slice(0, 26)}`
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function nowIso() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** 原子写：先写临时文件再 rename（同目录，保证同文件系统） */
export async function writeFileAtomic(file, text) {
  const dir = path.dirname(file)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(file)}.tmp.${randomBytes(6).toString('hex')}`)
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, file)
}

export async function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      if (fallback !== undefined) return fallback
      const e = new Error(`文件不存在: ${file}`)
      e.code = 'E_NOT_FOUND'
      throw e
    }
    if (err instanceof SyntaxError) {
      const e = new Error(`JSON 解析失败: ${file}`)
      e.code = 'E_IO'
      throw e
    }
    throw err
  }
}

export async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n')
}

export async function appendJsonl(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  await fs.appendFile(file, text, 'utf8')
}

export async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function * readJsonl(file) {
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return
    throw err
  }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      yield JSON.parse(t)
    } catch {
      // 忽略损坏行（保留诊断由调用方做）
    }
  }
}

/** 统一业务错误 */
export class MoxiError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.code = code
    this.details = details
  }
}

export function badRequest(message, details) {
  return new MoxiError('E_BAD_REQUEST', message, details)
}

/** 项目根：env > ~/.dsh/moxi/projects */
export function resolveProjectsRoot(explicit) {
  if (explicit && typeof explicit === 'string' && explicit.trim()) return path.resolve(explicit.trim())
  if (process.env.MOXI_PROJECTS_ROOT && process.env.MOXI_PROJECTS_ROOT.trim()) {
    return path.resolve(process.env.MOXI_PROJECTS_ROOT.trim())
  }
  return path.join(os.homedir(), 'Documents', 'Moxi', 'projects')
}

/** 断言 projectId 合法，防目录穿越 */
export function assertSafeId(id, label = 'id') {
  if (typeof id !== 'string' || !/^[a-z]+_[0-9A-Z]{26}$/.test(id)) {
    throw badRequest(`${label} 非法: ${String(id)}`)
  }
  return id
}

/** 进程内按 key 的串行队列 */
const queues = new Map()
export function withLock(key, fn) {
  const prev = queues.get(key) || Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.then(
    () => {},
    () => {}
  )
  queues.set(key, tail)
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}

export function projectDir(root, projectId) {
  return path.join(root, projectId)
}
