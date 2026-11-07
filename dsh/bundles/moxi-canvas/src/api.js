/**
 * moxi-canvas · Host API 客户端（薄封装 / 统一信封解包）
 * 服务端契约：docs/设计/前端接口契约.md
 */
const BASE = '/api/moxi'

async function call(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json
  const text = await res.text()
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`响应不是 JSON（HTTP ${res.status}）：${text.slice(0, 120)}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!json || json.ok !== true) {
    const err = (json && json.error) || {}
    const e = new Error(err.message || '请求失败')
    e.code = err.code || 'E_UNKNOWN'
    e.details = err.details
    throw e
  }
  return json.value
}

let _seq = 0

/** 给写操作生成唯一幂等键：避免同参数操作被判为历史事务重放（undo/redo 必须唯一） */
export function newIdemKey(prefix = 'ui') {
  _seq += 1
  return `${prefix}-${Date.now()}-${_seq}-${Math.random().toString(36).slice(2, 8)}`
}

export const api = {
  hello: () => call('/hello'),
  listProjects: () => call('/projects/list'),
  createProject: (input) => call('/projects/create', input),
  getProject: (projectId) => call('/project/get', { projectId }),
  deleteProject: (projectId) => call('/project/delete', { projectId }),
  getRev: (projectId) => call('/canvas/rev', { projectId }),
  apply: (projectId, ops, opts = {}) => call('/canvas/apply', { projectId, ops, ...opts }),
  getContent: (projectId, nodeId) => call('/node/content', { projectId, nodeId }),
  saveContent: (projectId, nodeId, text, baseVersion) =>
    call('/node/save', { projectId, nodeId, text, baseVersion }),
  runCheck: (projectId, nodeId) => call('/check/run', { projectId, nodeId }),
  exportProject: (projectId, format, range, includeReports) => call('/export', { projectId, format, range, includeReports }),
  // 交付闭环
  releaseProject: (projectId, opts = {}) => call('/project/release', { projectId, ...opts }),
  listSnapshots: (projectId) => call('/snapshots/list', { projectId }),
  createSnapshot: (projectId, reason) => call('/snapshots/create', { projectId, reason }),
  restoreSnapshot: (projectId, snapshotId) => call('/snapshots/restore', { projectId, snapshotId }),
  revealFile: (path) => call('/reveal', { path }),
  readFile: (path) => call('/file/read', { path }),
  tailEvents: (projectId, limit = 30) => call('/events/tail', { projectId, limit }),
  // 可拍性：报告 + 逐集签收
  shootability: (projectId, format = 'json', pacing) => call('/report/shootability', { projectId, format, pacing }),
  signoff: (projectId, episode, action = 'sign', notes = '') => call('/episode/signoff', { projectId, episode, action, notes }),

  /* 生成任务（契约 §2） */
  startJob: (input) => call('/jobs/start', input),
  listJobs: (projectId) => call('/jobs/list', projectId ? { projectId } : {}),
  getJob: (jobId, projectId) => call('/jobs/get', projectId ? { jobId, projectId } : { jobId }),
  cancelJob: (jobId) => call('/jobs/cancel', { jobId }),
  resumeJob: (projectId, jobId) => call('/jobs/resume', { projectId, jobId }),

  /* 模型（契约 §3） */
  llmInfo: () => call('/llm/info'),
  llmProbe: (input) => call('/llm/probe', input || {}),

  /* 统计（契约 §4） */
  stats: () => call('/stats'),
}

/** 判断 Job 是否终态（终态后停止轮询） */
export const JOB_TERMINAL = new Set(['done', 'done_with_errors', 'cancelled', 'failed'])
export function isJobTerminal(job) {
  return !job || JOB_TERMINAL.has(String(job.status || ''))
}
