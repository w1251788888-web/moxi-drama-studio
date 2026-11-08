/**
 * moxi-canvas · 主应用（S4: 生成弹窗 / 进度抽屉 / Confirm / 撤销重做 / 导入 / 视口持久化）
 */
import React from 'react'
import { api, newIdemKey, isJobTerminal } from './api.js'
import {
  h, NODE_TYPES, STATUS_META, JOB_STATUS_META, EP_STAGE_LABEL, TOKENS,
  Badge, JobBadge, EpBadge, Button, Input, Select, Checkbox, Field, SectionTitle,
  ProgressBar, Modal, Drawer, ConfirmModal, Empty, Toast, Spinner, TRANSITION_LABEL,
} from './theme.js'

const { useState, useRef, useEffect, useMemo, useCallback } = React

const ALLOWED = {
  draft: ['generating'],
  generating: ['review', 'draft'],
  review: ['approved', 'rejected'],
  rejected: ['draft', 'review'],
  approved: ['blocked', 'draft'],
  blocked: ['approved', 'draft'],
}

const UNDO_LIMIT = 100

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */
const fmtTs = (iso) => {
  if (!iso) return '—'
  return String(iso).slice(5, 16).replace('T', ' ')
}
const baseName = (p) => String(p || '').split('/').pop() || ''
const clampInt = (v, lo, hi) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}
const isEditableTarget = (t) => {
  if (!t) return false
  const tag = String(t.tagName || '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true
}
const randId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(String(text))
      return true
    }
  } catch { /* 继续用兜底方案 */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = String(text)
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}
const jobDone = (job) => {
  const p = (job && job.progress) || {}
  return { done: Number(p.done) || 0, failed: Number(p.failed) || 0, total: Number(p.total) || 0, current: p.current }
}

/* ---------------- 统一口径（与 core/admin 对齐） ---------------- */
/**
 * 逐集签收三态：有效签收 / 改稿失效（stale）/ 从未签收。
 * 待签收 = 从未签收 + 改稿失效；host 的 unsigned 本身就是这个合计（含 stale），
 * 所以绝不能把 staleSignoffs 再加到 unsigned 上（那样 1 集会算成 2 集）。
 */
const reportNeedsSignoff = (s) => {
  if (!s) return 0
  if (Array.isArray(s.needsSignoff)) return s.needsSignoff.length
  const n = Number(s.needsSignoff)
  if (Number.isFinite(n)) return n
  return Number(s.unsigned) || 0
}
const reportStaleCount = (s) => Number((s && s.staleSignoffs) || 0)
/** 从未签收（不含改稿失效）：host 给了 unsignedOnly 就用，缺字段时用合计减失效兜底 */
const reportUnsignedOnly = (s) => {
  if (!s) return 0
  if (Array.isArray(s.unsignedOnly)) return s.unsignedOnly.length
  const n = Number(s.unsignedOnly)
  if (Number.isFinite(n)) return n
  return Math.max(0, reportNeedsSignoff(s) - reportStaleCount(s))
}
/** 集号文案统一写作「第 5 集」 */
const epLabel = (ep) => `第 ${ep} 集`
/** 集号列表：第 1 集、第 2 集 … 超过 max 个时折叠成「等 N 集」 */
const epLabelList = (list, max = 24) => {
  const rows = (list || []).map(Number).filter((n) => Number.isFinite(n))
  const head = rows.slice(0, max).map(epLabel).join('、')
  return rows.length > max ? `${head} 等 ${rows.length} 集` : head
}

/**
 * 任务集范围文案：from/to 是「首末集号」，不等于集数。
 * 优先用 host 给的 job.scope（dense 表示连续），缺字段时从 episodes 明细兜底，
 * 避免把「第 1、6、8、10 集」误读成「第 1–10 集」。
 */
const jobScopeText = (job) => {
  if (!job) return ''
  const sc = job.scope || null
  const from = Number(job.from) || 0
  const to = Number(job.to) || 0
  let eps = []
  if (sc && Array.isArray(sc.episodes) && sc.episodes.length) eps = sc.episodes.map(Number)
  else eps = ((job.episodes) || []).map((e) => Number(e && e.ep))
  eps = [...new Set(eps.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
  if (eps.length === 1) return `第 ${eps[0]} 集`
  if (eps.length) {
    const dense = sc
      ? !!sc.dense
      : (from > 0 && to > 0 && eps.length === (to - from + 1) && eps[0] === from && eps[eps.length - 1] === to)
    return dense ? `第 ${eps[0]}–${eps[eps.length - 1]} 集` : `第 ${eps.join('、')} 集（共 ${eps.length} 集）`
  }
  if (from > 0 && to > 0) return `第 ${from}–${to} 集`
  return '范围未记录'
}

/* ------------------------------------------------------------------ */
/* 项目列表页                                                          */
/* ------------------------------------------------------------------ */
function ProjectsView({ projects, loading, onCreate, onOpen, onDelete, onRefresh, error, stats, jobs }) {
  const [skin, setSkin] = useState(() => (typeof window !== 'undefined' && window.__moxiSkin ? window.__moxiSkin.getSkin() : 'ink'))
  const toggleSkin = () => {
    const next = skin === 'ink' ? 'host' : 'ink'
    setSkin(next)
    if (window.__moxiSkin) window.__moxiSkin.setSkin(next)
  }
  // 首页增强数据：stats 给节点状态/集数/最近任务，可拍性摘要给「下一步」提示（拿不到就不显示）
  const [shootMap, setShootMap] = useState({})
  const statsById = useMemo(() => {
    const m = new Map()
    for (const row of ((stats && stats.projects) || [])) if (row && row.id) m.set(row.id, row)
    return m
  }, [stats])
  const jobById = useMemo(() => {
    const m = new Map()
    for (const j of (jobs || [])) {
      if (!j || !j.projectId) continue
      if (!m.has(j.projectId)) m.set(j.projectId, j) // listJobs 已按创建时间倒序，取第一条即最近任务
    }
    return m
  }, [jobs])
  const pendingOf = (p) => {
    const st = statsById.get(p.id)
    if (st) return Number(st.pending) || 0
    return ((p.byStatus || {}).review || 0) + ((p.byStatus || {}).rejected || 0)
  }
  const projectSignature = projects.map((p) => `${p.id}:${p.reviewState || ''}:${p.updatedAt || ''}`).join('|')
  // 首页「下一步」要看到缺钩子/待签收，只有可拍性报告有这两项；仅对「已生成」项目并行取一次摘要
  useEffect(() => {
    const targets = projects.filter((p) => p.reviewState === 'generated').slice(0, 12)
    if (!targets.length) { setShootMap({}); return undefined }
    let alive = true
    Promise.all(targets.map((p) => api.shootability(p.id, 'json')
      .then((r) => [p.id, (r && r.summary) || null])
      .catch(() => null)))
      .then((rows) => {
        if (!alive) return
        const m = {}
        for (const row of rows) if (row && row[1]) m[row[0]] = row[1]
        setShootMap(m)
      })
    return () => { alive = false }
  }, [projectSignature])

  // 阶段分布（按节点状态）：已批准 / 待审 / 生成中 / 草稿（阻塞并入草稿）
  const stageBar = (byStatus) => {
    const st = byStatus || {}
    const segs = [
      { key: 'approved', n: Number(st.approved) || 0, color: TOKENS.success, label: '已批准' },
      { key: 'pending', n: (Number(st.review) || 0) + (Number(st.rejected) || 0), color: TOKENS.warn, label: '待审' },
      { key: 'generating', n: Number(st.generating) || 0, color: TOKENS.goldSoft, label: '生成中' },
      { key: 'draft', n: (Number(st.draft) || 0) + (Number(st.blocked) || 0), color: TOKENS.neutral, label: '草稿' },
    ].filter((s) => s.n > 0)
    const total = segs.reduce((a, s) => a + s.n, 0)
    if (!total) return null
    return h('div', { style: { marginBottom: 9 } },
      h('div', { style: { display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
        segs.map((s) => h('div', { key: s.key, title: `${s.label} ${s.n} 个工位`, style: { width: `${(s.n / total) * 100}%`, background: s.color } }))),
      h('div', { style: { marginTop: 4, fontSize: 10.5, opacity: 0.6, display: 'flex', gap: 9, flexWrap: 'wrap' } },
        segs.map((s) => h('span', { key: s.key }, `${s.label} ${s.n}`)))
    )
  }
  // 最近任务（状态 + 集数）
  const jobLine = (p, st) => {
    const job = jobById.get(p.id) || null
    const last = (st && st.lastJob) || null
    if (!job && !last) return null
    const status = (job && job.status) || (last && last.status)
    const pr = (job && job.progress) || (last && last.progress) || {}
    const rawRange = job ? jobScopeText(job) : ''
    const range = job && job.mode === 'ensure'
      ? '概念/资产补齐'
      : (rawRange === '范围未记录' ? '' : rawRange)
    const total = Number(pr.total) || 0
    // 没有集数的任务（补齐类）不显示 0/0，避免像个没跑完的任务
    const count = total > 0 ? `${Number(pr.done) || 0}/${total} 集` : ''
    const tail = [range, count].filter(Boolean).join(' · ')
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, fontSize: 11 } },
      h('span', { style: { opacity: 0.6 } }, '最近任务'),
      h(JobBadge, { status }),
      tail ? h('span', { style: { opacity: 0.72 } }, tail) : null
    )
  }
  // 下一步提示：只用真实报告/统计，缺数据就不显示，不自造数字
  const nextStep = (p, st, shoot) => {
    if (p.reviewState === 'released') return null
    if (shoot) {
      const need = reportNeedsSignoff(shoot)
      const hooks = Number(shoot.hooksMissing) || 0
      const parts = []
      if (hooks > 0) parts.push(`${hooks} 集缺钩子`)
      if (need > 0) parts.push(`${need} 集待签收`)
      if (parts.length) return { color: TOKENS.warn, text: `${parts.join(' · ')} → 去可拍性` }
    }
    const last = st && st.lastJob
    if (last && (last.status === 'failed' || last.status === 'done_with_errors')) {
      const failed = Number(last.progress && last.progress.failed) || 0
      return { color: TOKENS.error, text: `最近任务有 ${failed || 1} 集失败 → 续跑或修复` }
    }
    const pending = pendingOf(p)
    if (pending > 0) return { color: TOKENS.warn, text: `${pending} 个工位待审 → 进入画布` }
    return null
  }
  // 总览：项目数 / 已生成集数 / 待签收集数（只列 stats 与真实报告可得的项）
  const overviewItems = []
  if (stats && stats.total) {
    if (Number.isFinite(Number(stats.total.projects))) overviewItems.push(`${Number(stats.total.projects)} 部剧`)
    if (Number.isFinite(Number(stats.total.episodes))) overviewItems.push(`已生成 ${Number(stats.total.episodes)} 集`)
  }
  const shootRows = Object.values(shootMap || {})
  if (shootRows.length) overviewItems.push(`待签收 ${shootRows.reduce((a, s) => a + reportNeedsSignoff(s), 0)} 集`)
  return h('div', {
    className: 'moxi-app moxi-paper-bg',
    style: { height: '100%', overflow: 'auto', padding: '34px 36px', boxSizing: 'border-box' },
  },
    // 品牌头
    h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 6 } },
      h('h1', { className: 'moxi-title', style: { fontSize: 26, margin: 0, lineHeight: 1.15 } }, '墨戏生花'),
      h('span', { style: { fontSize: 12.5, opacity: 0.6, paddingBottom: 2 } }, '墨稿创作台 · 无限画布'),
      h('span', { style: { flex: 1 } }),
      h('span', { className: 'moxi-stamp' }, '实验版'),
      h('span', { className: 'moxi-stamp' }, skin === 'ink' ? '墨稿' : '原生'),
      h(Button, { onClick: toggleSkin, title: '在墨稿皮肤与宿主外观之间切换', 'data-testid': 'btn-skin-toggle' },
        skin === 'ink' ? '用宿主外观' : '用墨稿皮肤')
    ),
    h('p', { style: { fontSize: 13, opacity: 0.68, margin: '0 0 22px' } },
      '一张画布写一部剧：对话是导演，画布是片场，工位是拍摄现场。'),
    error ? h('div', { style: { marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(178,58,50,.07)', color: '#b91c1c', border: '1px solid #fecaca' } }, error) : null,
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
      h(Button, { tone: 'primary', onClick: onCreate, 'data-testid': 'btn-new-project' }, '+ 新开一部剧'),
      h(Button, { onClick: onRefresh, 'data-testid': 'btn-refresh-projects' }, '刷新')
    ),
    overviewItems.length
      ? h('div', {
        'data-testid': 'projects-overview',
        style: { fontSize: 12, opacity: 0.66, marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap' },
      }, overviewItems.map((t) => h('span', { key: t }, t)))
      : h('div', { style: { height: 4 } }),
    loading
      ? h('div', { style: { fontSize: 12, opacity: 0.6 } }, '加载中…')
      : projects.length === 0
        ? h(Empty, { text: '还没有剧作', action: h(Button, { tone: 'primary', onClick: onCreate }, '新开第一部剧') })
        : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, maxWidth: 1240 } },
          projects.map((p) => {
            const st = statsById.get(p.id) || null
            const shoot = shootMap[p.id] || null
            const hint = nextStep(p, st, shoot)
            return h('div', {
            key: p.id,
            'data-testid': `project-card-${p.id}`,
            onClick: () => onOpen(p.id),
            className: 'moxi-card',
            style: {
              cursor: 'pointer', padding: '16px 18px', borderRadius: 12, background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h('div', { className: 'moxi-serif', style: { flex: 1, fontSize: 17, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.title),
              h('button', {
                'data-testid': `btn-delete-project-${p.id}`,
                onClick: (e) => { e.stopPropagation(); onDelete(p) },
                title: '删除到回收站',
                style: { border: 0, background: 'transparent', cursor: 'pointer', opacity: 0.4, fontSize: 13, color: 'inherit' },
              }, '🗑')
            ),
            h('div', { style: { fontSize: 11.5, opacity: 0.62, display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
              h('span', null, `${p.episodeCount ?? '集数未确认'} 集`),
              p.audience ? h('span', null, p.audience) : null,
              p.genre && p.genre.main ? h('span', null, p.genre.main) : null,
              h('span', null, '更新于 ' + fmtTs(p.updatedAt))
            ),
            stageBar((st && st.byStatus) || p.byStatus),
            jobLine(p, st),
            hint ? h('div', {
              'data-testid': `project-hint-${p.id}`,
              style: { fontSize: 11, lineHeight: 1.55, marginBottom: 8, color: hint.color },
            }, hint.text) : null,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              p.reviewState === 'generated'
                ? h('span', { className: 'moxi-stamp' }, '待放行')
                : p.reviewState === 'released'
                  ? h('span', { className: 'moxi-stamp', style: { color: TOKENS.success || 'var(--moxi-accent)', borderColor: TOKENS.success || 'var(--moxi-accent)' } }, '已放行')
                  : p.reviewState === 'has_errors'
                    ? h('span', { className: 'moxi-stamp', style: { color: '#b91c1c', borderColor: '#b91c1c' } }, '有失败集')
                    : pendingOf(p) > 0
                      ? h('span', { className: 'moxi-stamp' }, `待审 ${pendingOf(p)}`)
                      : h('span', { style: { fontSize: 11, opacity: 0.5 } }, '暂无待审'),
              h('span', { style: { flex: 1 } }),
              h(Button, { tone: 'primary', onClick: (e) => { e.stopPropagation(); onOpen(p.id) }, 'data-testid': `btn-continue-${p.id}` }, '继续创作')
            )
            )
          })
        )
  )
}
/* ------------------------------------------------------------------ */
/* 新建项目弹窗                                                        */
/* ------------------------------------------------------------------ */
function NewProjectModal({ onClose, onSubmit, busy }) {
  const [title, setTitle] = useState('')
  const [episodes, setEpisodes] = useState('')
  const [audience, setAudience] = useState('女频')
  const [genre, setGenre] = useState('家庭')
  const [logline, setLogline] = useState('')
  const submit = () => {
    if (!title.trim()) return
    onSubmit({
      title: title.trim(),
      episodeCount: episodes ? Number(episodes) : null,
      audience, genreMain: genre, logline,
    })
  }
  return h(Modal, {
    title: '新建项目',
    onClose,
    testid: 'modal-new-project',
    footer: [
      h(Button, { key: 'c', onClick: onClose }, '取消'),
      h(Button, { key: 's', tone: 'primary', onClick: submit, disabled: busy || !title.trim(), 'data-testid': 'btn-create-project' }, busy ? '创建中…' : '创建并进入画布'),
    ],
  },
    h('div', { style: { display: 'grid', gap: 10 } },
      h(Field, { label: '项目名 *' }, h(Input, { value: title, onChange: setTitle, placeholder: '例如：我的父母没素质', style: { width: '100%' }, 'data-testid': 'input-project-title' })),
      h(Field, { label: '集数（确认后才生成分集节点）' }, h(Input, { value: episodes, onChange: setEpisodes, placeholder: '例如 60；留空 = 未确认', style: { width: '100%' } })),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        h(Field, { label: '受众' }, h(Input, { value: audience, onChange: setAudience, style: { width: '100%' } })),
        h(Field, { label: '主类型' }, h(Input, { value: genre, onChange: setGenre, style: { width: '100%' } }))
      ),
      h(Field, { label: '一句话故事' }, h(Input, { value: logline, onChange: setLogline, style: { width: '100%' } }))
    )
  )
}

/* ------------------------------------------------------------------ */
/* 节点卡片                                                            */
/* ------------------------------------------------------------------ */
function NodeCard({ node, selected, onPointerDown, onClick, findings, editing, editingText, onStartRename, onEditText, onCommitRename, onCancelRename, summary }) {
  const meta = NODE_TYPES[node.type] || NODE_TYPES.settings
  const errs = findings ? findings.filter((f) => f.severity === 'error').length : 0
  const warns = findings ? findings.filter((f) => f.severity === 'warning').length : 0
  const inputRef = useRef(null)
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])
  return h('div', {
    'data-testid': `node-${node.id}`,
    'data-node-type': node.type,
    onPointerDown: editing ? (e) => e.stopPropagation() : onPointerDown,
    onClick,
    style: {
      position: 'absolute', left: node.x, top: node.y, width: node.w, minHeight: node.h,
      boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, cursor: editing ? 'default' : 'grab',
      background: TOKENS.bg,
      border: selected ? `2px solid ${meta.accent}` : `1px solid ${TOKENS.border}`,
      boxShadow: selected ? `0 0 0 3px ${meta.accent}22, 0 6px 18px rgba(0,0,0,.10)` : '0 1px 3px rgba(0,0,0,.06)',
      color: TOKENS.text, userSelect: 'none',
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
      h('span', { style: { color: meta.accent, fontSize: 13 } }, meta.glyph),
      h('span', { style: { fontSize: 11, color: meta.accent, fontWeight: 600 } }, meta.label),
      h('span', { style: { flex: 1 } }),
      h(Badge, { status: node.status })
    ),
    editing
      ? h('input', {
        ref: inputRef,
        'data-testid': `input-rename-${node.id}`,
        value: editingText,
        onChange: (e) => onEditText(e.target.value),
        onKeyDown: (e) => {
          e.stopPropagation()
          if (e.key === 'Enter') onCommitRename()
          if (e.key === 'Escape') onCancelRename()
        },
        onBlur: onCommitRename,
        style: {
          width: '100%', fontSize: 13, fontWeight: 600, height: 26, boxSizing: 'border-box',
          padding: '0 8px', borderRadius: 6, border: `1px solid ${TOKENS.border}`,
          background: TOKENS.bgSoft, color: TOKENS.text, outline: 'none',
        },
      })
      : h('div', {
        'data-testid': `node-title-${node.id}`,
        title: '双击重命名',
        onDoubleClick: (e) => { e.stopPropagation(); onStartRename() },
        style: { fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
      }, node.title),
    // 卡片摘要行：剧本卡看「字数 · 钩子 · 角色数」，节拍/分场看集号与状态，资产卡看角色/类型
    summary
      ? h('div', {
        'data-testid': `node-summary-${node.id}`,
        title: summary,
        style: { marginTop: 5, fontSize: 10.5, lineHeight: 1.5, opacity: 0.62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }, summary)
      : null,
    (errs || warns)
      ? h('div', { style: { marginTop: 6, fontSize: 10.5, display: 'flex', gap: 8 } },
        errs ? h('span', { style: { color: TOKENS.error } }, `✕ ${errs}`) : null,
        warns ? h('span', { style: { color: TOKENS.warn } }, `! ${warns}`) : null)
      : null
  )
}

/* ------------------------------------------------------------------ */
/* 详情面板（Inspector）                                                */
/* ------------------------------------------------------------------ */
function Inspector({ project, node, onClose, onSaved, onTransition, onCheck, onDelete, onDirtyChange, onRename, onSaveReady, toast }) {
  const [text, setText] = useState('')
  const [version, setVersion] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('content')
  const [events, setEvents] = useState([])
  const savedTextRef = useRef('')
  const dirtyRef = useRef(false)

  const nodeRef = useRef(node)
  nodeRef.current = node
  useEffect(() => {
    let alive = true
    setText(''); setDirty(false); setVersion(0); savedTextRef.current = ''
    setDirtySilent(false)
    if (!node) return undefined
    api.getContent(project.id, node.id)
      .then((r) => {
        if (!alive) return
        setText(r.text || '')
        savedTextRef.current = r.text || ''
        setVersion(r.version || 0)
      })
      .catch((e) => toast({ kind: 'error', text: '读正文失败：' + e.message }))
    api.tailEvents(project.id, 30)
      .then((rows) => { if (alive) setEvents(rows.filter((e) => e.nodeId === node.id).slice(-12).reverse()) })
      .catch(() => {})
    return () => { alive = false }
  }, [node && node.id])

  // 画布版本变化（撤销/重做、Agent 改稿）时静默重读正文；有未保存修改则不动，避免覆盖用户输入
  useEffect(() => {
    const cur = nodeRef.current
    if (!cur || dirtyRef.current) return undefined
    let alive = true
    api.getContent(project.id, cur.id)
      .then((r) => {
        if (!alive || dirtyRef.current) return
        setText(r.text || '')
        savedTextRef.current = r.text || ''
        setVersion(r.version || 0)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [node && node.id, node && node.contentVersion, project.id])

  useEffect(() => { onDirtyChange && onDirtyChange(dirty) }, [dirty])
  useEffect(() => () => { onDirtyChange && onDirtyChange(false) }, [])

  const setDirtySilent = (val) => {
    dirtyRef.current = val
    setDirty(val)
  }

  // 保存正文（返回 boolean）。CanvasView 的「保存并导出」也复用它。
  const save = useCallback(async () => {
    if (!node) return false
    const before = savedTextRef.current
    const after = text
    setBusy(true)
    try {
      await api.saveContent(project.id, node.id, text, version)
      savedTextRef.current = after
      setDirty(false)
      setDirtySilent(false)
      setVersion((v) => v + 1)
      toast({ kind: 'success', text: '正文已保存' })
      onSaved && onSaved(before, after)
      return true
    } catch (e) {
      toast({ kind: 'error', text: e.code === 'E_CONFLICT' ? '版本冲突：请刷新后重试' : '保存失败：' + e.message })
      return false
    } finally { setBusy(false) }
  }, [node, project.id, text, version, toast, onSaved])

  // 把最新的 save 暴露给父组件（导出前「保存并导出」使用）
  useEffect(() => {
    if (onSaveReady) onSaveReady(save)
  }, [save, onSaveReady])

  if (!node) return null
  const meta = NODE_TYPES[node.type] || NODE_TYPES.settings
  const findings = (node.meta && node.meta.findings) || []

  const allowed = ALLOWED[node.status] || []
  const header = h('div', { style: { padding: '12px 14px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: 8 } },
    h('span', { style: { color: meta.accent } }, meta.glyph),
    h('div', { style: { flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, node.title),
    h('button', {
      'data-testid': 'btn-close-inspector',
      onClick: onClose,
      style: { border: 0, background: 'transparent', cursor: 'pointer', fontSize: 15, opacity: 0.6, color: 'inherit' },
    }, '×')
  )

  const tabs = h('div', { style: { display: 'flex', gap: 4, padding: '8px 12px 0' } },
    ['content', 'meta', 'events'].map((t) => h('button', {
      key: t, onClick: () => setTab(t),
      style: {
        border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, padding: '4px 8px',
        borderBottom: tab === t ? `2px solid ${meta.accent}` : '2px solid transparent',
        color: tab === t ? TOKENS.text : TOKENS.dim, opacity: tab === t ? 1 : 0.7,
      },
    }, t === 'content' ? '正文' : t === 'meta' ? '检查结果' : '事件'))
  )

  const contentTab = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '10px 14px' } },
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
      h(Button, { tone: 'primary', onClick: save, disabled: busy || !dirty, 'data-testid': 'btn-save-content' }, busy ? '保存中…' : dirty ? '保存正文' : '已保存'),
      h(Button, { onClick: () => onCheck && onCheck(node), 'data-testid': 'btn-check-run' }, '跑确定性检查'),
      h('span', { style: { flex: 1 } }),
      h('span', { style: { fontSize: 11, opacity: 0.55, lineHeight: '28px' } }, `${text.length} 字符 · v${version}`)
    ),
    h('textarea', {
      'data-testid': 'textarea-content',
      value: text,
      onChange: (e) => { setText(e.target.value); setDirtySilent(true); setDirty(true) },
      placeholder: '在这里写/改正文（Markdown）。Agent 也可以通过 moxi_node_write 写同一份内容。',
      style: {
        flex: 1, minHeight: 220, resize: 'none', padding: 12, borderRadius: 8, boxSizing: 'border-box',
        fontSize: 12.5, lineHeight: 1.7, fontFamily: TOKENS.mono, color: TOKENS.text,
        background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, outline: 'none',
      },
    }),
    allowed.length
      ? h('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 11, opacity: 0.6, lineHeight: '28px' } }, '状态迁移：'),
        allowed.map((to) => h(Button, {
          key: to,
          'data-testid': `btn-transition-${to}`,
          tone: to === 'approved' ? 'primary' : to === 'rejected' ? 'danger' : 'default',
          onClick: () => onTransition(node, to),
        }, TRANSITION_LABEL[to] || to))
      )
      : null,
    h('div', { style: { display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' } },
      h(Button, { tone: 'ghost', onClick: () => onRename && onRename(node), 'data-testid': 'btn-rename-node' }, '重命名'),
      h('span', { style: { flex: 1 } }),
      h(Button, { tone: 'danger', onClick: () => onDelete && onDelete(node), 'data-testid': 'btn-delete-node' }, '删除节点')
    )
  )

  const metaTab = h('div', { style: { flex: 1, overflow: 'auto', padding: '10px 14px' } },
    findings.length === 0
      ? h('div', { style: { fontSize: 12, opacity: 0.6 } }, '还没有检查结果。点「跑确定性检查」。')
      : h('div', { style: { display: 'grid', gap: 8 } },
        findings.map((f, i) => h('div', {
          key: i,
          style: {
            padding: '8px 10px', borderRadius: 8, fontSize: 12,
            background: f.severity === 'error' ? 'rgba(178,58,50,.07)' : f.severity === 'warning' ? '#fffbeb' : TOKENS.bgSoft,
            border: `1px solid ${f.severity === 'error' ? '#fecaca' : f.severity === 'warning' ? '#fde68a' : TOKENS.border}`,
          },
        },
          h('div', { style: { fontWeight: 600, marginBottom: 2 } }, `${f.code} · ${f.severity}`),
          h('div', null, f.message),
          f.evidence ? h('div', { style: { marginTop: 4, opacity: 0.7, fontFamily: TOKENS.mono, fontSize: 11 } }, f.evidence) : null
        ))
      ),
    h('div', { style: { marginTop: 14, fontSize: 11, opacity: 0.55 } }, `id: ${node.id} · type: ${node.type} · ref: ${JSON.stringify(node.ref || {})}`)
  )

  const eventsTab = h('div', { style: { flex: 1, overflow: 'auto', padding: '10px 14px', display: 'grid', gap: 6 } },
    events.length === 0
      ? h('div', { style: { fontSize: 12, opacity: 0.6 } }, '该节点暂无事件')
      : events.map((ev, i) => h('div', { key: i, style: { fontSize: 11.5, fontFamily: TOKENS.mono, opacity: 0.85, padding: '5px 8px', borderRadius: 6, background: TOKENS.bgSoft } },
        `${fmtTs(ev.ts)} · ${ev.actor} · ${ev.op}`,
        ev.data && ev.data.from ? ` ${ev.data.from}→${ev.data.to}` : ''
      ))
  )

  return h('div', {
    'data-testid': 'inspector',
    style: {
      width: 380, flex: '0 0 380px', display: 'flex', flexDirection: 'column', minHeight: 0,
      borderLeft: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text,
    },
  },
    header,
    h('div', { style: { padding: '8px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
      h(Badge, { status: node.status }),
      h('span', { style: { fontSize: 11, opacity: 0.6 } }, meta.label),
      dirty ? h('span', { style: { fontSize: 11, color: TOKENS.warn } }, '● 未保存') : null
    ),
    tabs,
    tab === 'content' ? contentTab : tab === 'meta' ? metaTab : eventsTab
  )
}

/* ------------------------------------------------------------------ */
/* 生成弹窗                                                            */
/* ------------------------------------------------------------------ */
function GenerateModal({ project, onClose, onStarted, toast }) {
  const epCount = Number(project.episodeCount) || 0
  const maxTo = epCount > 0 ? Math.min(30, epCount) : 30
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState(String(maxTo))
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [skipConcept, setSkipConcept] = useState(false)
  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.llmInfo()
      .then((r) => {
        if (!alive) return
        setInfo(r)
        setProvider(r.provider || '')
        const models = (r.models || []).filter((m) => m && m.id)
        setModel(models[0] ? models[0].id : '')
      })
      .catch((e) => toast({ kind: 'error', text: '读取模型列表失败：' + e.message }))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const models = (info && info.models ? info.models : []).filter((m) => m && m.id)
  const f = Number(from)
  const t = Number(to)
  const invalid = !Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t > maxTo || t < f

  const start = async () => {
    if (invalid) return
    setBusy(true)
    try {
      const job = await api.startJob({
        projectId: project.id,
        from: f, to: t,
        provider: provider || undefined,
        model: model || undefined,
        skipConcept,
      })
      toast({ kind: 'success', text: `生成任务已启动：${jobScopeText(job)}` })
      onStarted(job)
    } catch (e) {
      const hint = e.code === 'E_JOB_RUNNING' ? '该项目已有任务在跑，先到「任务」里查看/取消。' : e.message
      toast({ kind: 'error', text: '启动失败：' + hint })
      setBusy(false)
    }
  }

  const probeModel = async () => {
    setProbing(true)
    setProbe(null)
    try {
      const r = await api.llmProbe({ maxTokens: 24 })
      setProbe(r)
      toast({ kind: 'success', text: `模型探测通过：${r.provider}/${r.model} · ${r.ms}ms` })
    } catch (e) {
      setProbe({ error: e.message })
      toast({ kind: 'error', text: '模型探测失败：' + e.message })
    } finally { setProbing(false) }
  }

  return h(Modal, {
    title: '生成剧本',
    onClose: busy ? () => {} : onClose,
    width: 560,
    testid: 'modal-generate',
    footer: [
      h(Button, { key: 'c', onClick: onClose, disabled: busy, 'data-testid': 'btn-cancel-generate' }, '取消'),
      h(Button, { key: 's', tone: 'primary', onClick: start, disabled: busy || invalid, 'data-testid': 'btn-start-job' }, busy ? '启动中…' : '开始生成'),
    ],
  },
    h('div', { style: { display: 'grid', gap: 12 } },
      h('div', { style: { fontSize: 12, opacity: 0.7, lineHeight: 1.6 } },
        `项目「${project.title}」 · 生成会按集跑：节拍 → 分场 → 剧本 → 确定性检查 → 质检/合规，并在右下抽屉实时显示进度。`
      ),
      epCount > 0
        ? h('div', { 'data-testid': 'gen-episode-confirmed', style: { fontSize: 11.5, padding: '7px 10px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, lineHeight: 1.6 } },
          `已确认集数：${epCount} 集；单任务生成范围上限 ${maxTo} 集（平台标准上限 30 集）。`)
        : h('div', { 'data-testid': 'gen-episode-unknown', style: { fontSize: 11.5, padding: '7px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', lineHeight: 1.6 } },
          h('div', { style: { fontWeight: 650, marginBottom: 2 } }, '集数未确认，按平台标准 30 集处理'),
          h('div', null, '该项目尚未确认集数：默认结束集 = 30（可在下方手动调整，单任务上限 30 集）。生成完成后以实际生成集数为准。')),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        h(Field, { label: '起始集', hint: '默认 1' },
          h(Input, { value: from, onChange: setFrom, type: 'number', min: 1, max: maxTo, 'data-testid': 'gen-from', style: { width: '100%' } })),
        h(Field, { label: `结束集（≤ ${maxTo}）`, hint: '任务总集数 = 结束 − 起始 + 1' },
          h(Input, { value: to, onChange: setTo, type: 'number', min: 1, max: maxTo, 'data-testid': 'gen-to', style: { width: '100%' } }))
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        h(Field, { label: '模型 provider' },
          h(Select, {
            value: provider,
            onChange: setProvider,
            disabled: loading,
            'data-testid': 'gen-provider',
            options: (info && info.provider ? [{ value: info.provider, label: info.provider }] : [{ value: '', label: loading ? '读取中…' : '（默认）' }]),
            style: { width: '100%' },
          })),
        h(Field, { label: '模型' },
          h(Select, {
            value: model,
            onChange: setModel,
            disabled: loading,
            'data-testid': 'gen-model',
            options: loading ? [{ value: '', label: '读取中…' }] : (models.length ? models.map((m) => ({ value: m.id, label: `${m.name || m.id}（${m.id}）` })) : [{ value: '', label: '（默认）' }]),
            style: { width: '100%' },
          }))
      ),
      h('div', { style: { display: 'grid', gap: 4 } },
        h(Checkbox, {
          checked: skipConcept,
          onChange: setSkipConcept,
          'data-testid': 'gen-skip-concept',
          label: '跳过概念/资产（设定集已有内容时更快；勾选后直接生成分集）',
        }),
        h('div', { 'data-testid': 'gen-skip-hint', style: { fontSize: 11, opacity: 0.62, paddingLeft: 20, lineHeight: 1.6 } },
          '勾选后果：不会生成设定集与角色资产，直接出分集；世界观 / 角色资产节点保持原样（适合设定集已写好的项目）。')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
        h(Button, { onClick: probeModel, disabled: probing, 'data-testid': 'btn-probe' }, probing ? '探测中…' : '模型探测'),
        h('div', { style: { fontSize: 11.5, lineHeight: 1.5, opacity: 0.8, flex: 1 } },
          probing ? h('span', null, h(Spinner, { size: 10 }), ' 正在调用模型探测…')
            : probe
              ? (probe.error
                ? h('span', { style: { color: TOKENS.error } }, `探测失败：${probe.error}`)
                : h('span', null, `✓ ${probe.provider}/${probe.model} · ${probe.ms}ms · ${probe.chars} 字符 · 样例「${String(probe.sample || '').slice(0, 20)}」`))
              : '点击探测当前 provider/model 链路是否可用（会真实调用一次模型）'
        )
      ),
      invalid ? h('div', { style: { fontSize: 11.5, color: TOKENS.error } }, `集数范围非法：要求 1 ≤ 起始 ≤ 结束 ≤ ${maxTo}`) : null
    )
  )
}

/* ------------------------------------------------------------------ */
/* 进度抽屉                                                            */
/* ------------------------------------------------------------------ */
function EpisodeRows({ job }) {
  const eps = (job && job.episodes) || []
  if (!eps.length) return h('div', { style: { fontSize: 12, opacity: 0.6 } }, '暂无分集进度')
  return h('div', { style: { display: 'grid', gap: 2 } },
    h('div', {
      style: { display: 'grid', gridTemplateColumns: '46px 62px 58px 48px 46px 1fr', gap: 6, padding: '4px 6px', fontSize: 10.5, opacity: 0.55, borderBottom: `1px solid ${TOKENS.border}` },
    }, h('span', null, '集'), h('span', null, '阶段'), h('span', null, '状态'), h('span', null, '字数'), h('span', null, 'findings'), h('span', null, '错误')),
    ...eps.map((ep) => h('div', {
      key: ep.ep,
      'data-testid': `job-ep-${ep.ep}`,
      style: { display: 'grid', gridTemplateColumns: '46px 62px 58px 48px 46px 1fr', gap: 6, padding: '3px 6px', fontSize: 11.5, alignItems: 'center', borderRadius: 5, background: ep.status === 'running' ? 'rgba(59,130,246,.08)' : 'transparent' },
    },
      h('span', { style: { fontFamily: TOKENS.mono } }, `第${ep.ep}集`),
      h('span', { style: { opacity: 0.8 } }, EP_STAGE_LABEL[ep.stage] || ep.stage || '—'),
      h(EpBadge, { status: ep.status }),
      h('span', { style: { fontFamily: TOKENS.mono, opacity: 0.8 } }, String(ep.words || 0)),
      h('span', { style: { fontFamily: TOKENS.mono, opacity: ep.findings ? 0.9 : 0.5, color: ep.findings ? TOKENS.warn : 'inherit' } }, String(ep.findings || 0)),
      h('span', { style: { opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: ep.error || '' }, ep.error || '')
    ))
  )
}

function JobLog({ log }) {
  const rows = (log || []).slice(-20)
  if (!rows.length) return h('div', { style: { fontSize: 11.5, opacity: 0.6 } }, '暂无日志')
  const color = (level) => level === 'error' ? TOKENS.error : level === 'warn' ? TOKENS.warn : TOKENS.dim
  return h('div', { style: { display: 'grid', gap: 2, maxHeight: 150, overflow: 'auto', fontFamily: TOKENS.mono, fontSize: 10.5, lineHeight: 1.5 } },
    rows.map((row, i) => h('div', { key: i, style: { display: 'flex', gap: 6, whiteSpace: 'nowrap' } },
      h('span', { style: { opacity: 0.5 } }, String(row.ts || '').slice(11, 19)),
      h('span', { style: { color: color(row.level), width: 34 } }, String(row.level || 'info')),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' }, title: row.msg }, row.msg)
    ))
  )
}

function JobDrawer({ projectId, jobId, onClose, onJobChanged, toast, confirm }) {
  const [job, setJob] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const aliveRef = useRef(true)

  const fetchJob = useCallback(async (silent) => {
    try {
      const j = await api.getJob(jobId, projectId)
      if (!aliveRef.current) return
      setJob(j)
      setErr('')
      onJobChanged && onJobChanged(j)
    } catch (e) {
      if (!aliveRef.current) return
      if (!silent) {
        const msg = e.code === 'E_NOT_FOUND' ? '任务记录不存在（可能已被清理）' : '读取任务失败：' + e.message
        setErr(msg)
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [jobId, projectId, onJobChanged])

  useEffect(() => {
    aliveRef.current = true
    fetchJob(false)
    return () => { aliveRef.current = false }
  }, [fetchJob])

  const status = job && job.status
  const terminal = isJobTerminal(job)
  useEffect(() => {
    if (!job || terminal) return undefined
    const timer = window.setInterval(() => fetchJob(true), 1500)
    return () => window.clearInterval(timer)
  }, [status, terminal, fetchJob])

  const cancel = async () => {
    const ok = await confirm({
      title: '取消生成任务',
      message: `确认取消任务 ${job.id}（${jobScopeText(job)}）？已完成的集会保留。`,
      detail: '取消后可用「续跑」从第一个未完成集继续。',
      danger: true,
      confirmText: '取消任务',
      cancelText: '继续跑',
    })
    if (!ok) return
    setBusy(true)
    try {
      const j = await api.cancelJob(job.id)
      setJob(j)
      toast({ kind: 'success', text: '已请求取消任务' })
    } catch (e) {
      toast({ kind: 'error', text: '取消失败：' + e.message })
    } finally { setBusy(false) }
  }

  const resume = async () => {
    setBusy(true)
    try {
      const j = await api.resumeJob(projectId, job.id)
      setJob(j)
      toast({ kind: 'success', text: '已请求续跑（从第一个未完成集继续）' })
    } catch (e) {
      toast({ kind: 'error', text: '续跑失败：' + (e.code === 'E_JOB_RUNNING' ? '任务仍在运行' : e.message) })
    } finally { setBusy(false) }
  }

  const [restoring, setRestoring] = useState(false)
  const restoreSnapshot = async () => {
    const ok = await confirm({
      title: '回退到生成前？',
      message: '会把画布与全部正文恢复到本次生成开始前，并自动为当前状态再拍一张快照（回退本身也可撤销）。',
      detail: `快照：${job.snapshotId}`,
      danger: true, confirmText: '回退',
    })
    if (!ok) return
    setRestoring(true)
    try {
      const r = await api.restoreSnapshot(projectId, job.snapshotId)
      toast({ kind: 'success', text: `已回退到生成前（rev ${r.rev}）` })
      onJobChanged && onJobChanged(null)
      onClose && onClose()
    } catch (e) {
      toast({ kind: 'error', text: '回退失败：' + e.message })
    } finally { setRestoring(false) }
  }

  const progress = jobDone(job)
  const pctText = `${progress.done}/${progress.total} 集`
  const canResume = terminal && ['cancelled', 'failed', 'done_with_errors'].includes(String(status))
  const failedEps = (((job && job.episodes) || []).filter((e) => e && e.status === 'failed').map((e) => Number(e.ep)).filter((n) => Number.isFinite(n))).sort((a, b) => a - b)
  const failedCount = progress.failed || failedEps.length

  return h(Drawer, {
    title: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } },
      h('span', { className: 'moxi-serif' }, '创作进度'),
      job ? h(JobBadge, { status: job.status }) : null,
      job ? h('span', { style: { fontSize: 11, opacity: 0.6, fontFamily: TOKENS.mono } }, job.id) : null
    ),
    onClose,
    width: 540,
    testid: 'drawer-job',
    footer: [
      job ? h(Button, {
        key: 'cancel', tone: 'danger', onClick: cancel, disabled: busy || terminal,
        'data-testid': 'btn-job-cancel',
      }, busy ? '处理中…' : '取消任务') : null,
      job && canResume ? h(Button, { key: 'resume', tone: 'primary', onClick: resume, disabled: busy, 'data-testid': 'btn-job-resume' }, '续跑') : null,
      h(Button, { key: 'refresh', onClick: () => fetchJob(false), disabled: busy, 'data-testid': 'btn-job-refresh' }, '刷新'),
      h(Button, { key: 'close', onClick: onClose, 'data-testid': 'btn-job-close' }, '关闭'),
    ],
  },
    loading ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } }, h(Spinner), '加载任务…')
      : err ? h('div', { style: { fontSize: 12.5, color: TOKENS.error, lineHeight: 1.6 } }, err)
        : !job ? h('div', { style: { fontSize: 12 } }, '任务不存在')
          : h('div', { style: { display: 'grid', gap: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
              h('div', { style: { fontSize: 13, fontWeight: 650, flex: 1 } }, job.projectTitle || '未知项目'),
              h('div', { style: { fontSize: 11.5, opacity: 0.65 } }, `${jobScopeText(job)} · ${job.provider}/${job.model}`)
            ),
            status === 'done_with_errors'
              ? h('div', {
                'data-testid': 'drawer-job-alert',
                style: { padding: '9px 11px', borderRadius: 8, background: 'rgba(178,58,50,.07)', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 12.5, lineHeight: 1.6 },
              },
                h('div', { style: { fontWeight: 700, marginBottom: 2 } }, `${failedCount} 集失败：导出前请先续跑或修复`),
                h('div', { style: { fontSize: 11.5, opacity: 0.9 } },
                  `失败集：${failedEps.length ? failedEps.map((n) => `第 ${n} 集`).join('、') : `${failedCount} 集`}。可点下方「续跑」从第一个未完成集继续；未修复前导出的 docx 会缺这些集。`)
              )
              : status === 'cancelled'
                ? h('div', {
                  'data-testid': 'drawer-job-cancelled-hint',
                  style: { padding: '8px 11px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontSize: 11.5, lineHeight: 1.6, opacity: 0.9 },
                }, '任务已取消：已完成的集保留；可点「续跑」从第一个未完成集继续，或关闭抽屉继续编辑画布。')
                : null,
            h('div', { style: { display: 'grid', gap: 4 } },
              h('div', { style: { display: 'flex', fontSize: 11.5, opacity: 0.75, justifyContent: 'space-between' } },
                h('span', null, `进度 ${pctText}${progress.failed ? ` · 失败 ${progress.failed}` : ''}`),
                h('span', null, progress.current ? `当前：第 ${progress.current} 集` : terminal ? '已结束' : '等待中')
              ),
              h(ProgressBar, { done: progress.done, total: progress.total, failed: progress.failed })
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11.5 } },
              h('div', { style: { padding: '7px 9px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
                h('div', { style: { opacity: 0.6, marginBottom: 2 } }, '状态'), h(JobBadge, { status: job.status })),
              h('div', { style: { padding: '7px 9px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
                h('div', { style: { opacity: 0.6, marginBottom: 2 } }, '模型用量'),
                h('div', { style: { fontFamily: TOKENS.mono } }, `calls ${job.usage ? job.usage.calls : 0} · in ${job.usage ? job.usage.inputTokens : 0} · out ${job.usage ? job.usage.outputTokens : 0}`)),
              h('div', { style: { padding: '7px 9px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
                h('div', { style: { opacity: 0.6, marginBottom: 2 } }, '时间'),
                h('div', { style: { fontFamily: TOKENS.mono } }, `${fmtTs(job.createdAt)} → ${fmtTs(job.finishedAt)}`))
            ),
            h('div', null,
              h(SectionTitle, null, '分集进度'),
              h(EpisodeRows, { job })
            ),
            job.snapshotId ? h('div', {
              style: { padding: '9px 11px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontSize: 11.5, lineHeight: 1.7 },
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { className: 'moxi-stamp' }, '生成前快照'),
                h('span', { style: { flex: 1, opacity: 0.75, fontFamily: TOKENS.mono, overflow: 'hidden', textOverflow: 'ellipsis' } }, job.snapshotId)
              ),
              h('div', { style: { marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { flex: 1, opacity: 0.62 } }, '不满意可以一键回到生成前的画布。'),
                h(Button, { onClick: restoreSnapshot, disabled: restoring, 'data-testid': 'btn-snapshot-restore' }, restoring ? '回退中…' : '回退到生成前')
              )
            ) : null,
            h('div', null,
              h(SectionTitle, null, '最近日志'),
              h(JobLog, { log: job.log })
            )
          )
  )
}

/* ------------------------------------------------------------------ */
/* 可拍性抽屉：时长估算 / 角色 / 钩子 / 逐集签收                        */
/* ------------------------------------------------------------------ */
// 报告数据由 CanvasView 统一持有（打开项目就拉），这里只负责展示与签收；
// 签收/撤回后调 onReload 重新拉取，横幅与卡片同步刷新。
function ShootabilityDrawer({ project, report, loading, onReload, onClose, toast, confirm }) {
  const [busyEp, setBusyEp] = useState(null)
  const [signEp, setSignEp] = useState(null)
  const [notes, setNotes] = useState('')

  const load = async () => { await onReload() }

  const doSign = async () => {
    if (!signEp) return
    setBusyEp(signEp.episode)
    try {
      await api.signoff(project.id, signEp.episode, 'sign', notes)
      toast({ kind: 'success', text: `${epLabel(signEp.episode)}已签收` })
      setSignEp(null); setNotes('')
      await onReload()
    } catch (e) {
      toast({ kind: 'error', text: '签收失败：' + e.message })
    } finally { setBusyEp(null) }
  }
  // 改稿失效的行：不用再走签收弹窗，直接按当前稿件版本重新签收
  const reSign = async (ep) => {
    setBusyEp(ep.episode)
    try {
      await api.signoff(project.id, ep.episode, 'sign', notes)
      toast({ kind: 'success', text: `${epLabel(ep.episode)}已按当前稿件版本重新签收` })
      await onReload()
    } catch (e) {
      toast({ kind: 'error', text: '重新签收失败：' + e.message })
    } finally { setBusyEp(null) }
  }
  const revoke = async (ep) => {
    const ok = await confirm({
      title: '撤回签收',
      message: `撤回${epLabel(ep.episode)}的签收记录？`,
      confirmText: '撤回', cancelText: '保留',
    })
    if (!ok) return
    setBusyEp(ep.episode)
    try {
      await api.signoff(project.id, ep.episode, 'revoke')
      toast({ kind: 'success', text: `${epLabel(ep.episode)}签收已撤回` })
      await onReload()
    } catch (e) {
      toast({ kind: 'error', text: '撤回失败：' + e.message })
    } finally { setBusyEp(null) }
  }
  const download = async () => {
    try {
      const r = await api.shootability(project.id, 'md')
      const blob = new Blob([r.markdown || ''], { type: 'text/markdown;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${project.title}-可拍性报告.md`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      toast({ kind: 'success', text: '可拍性报告已下载' })
    } catch (e) {
      toast({ kind: 'error', text: '下载失败：' + e.message })
    }
  }

  const s = report ? report.summary : null
  const needSignoff = reportNeedsSignoff(s)
  const staleCount = reportStaleCount(s)
  const unsignedOnly = reportUnsignedOnly(s)
  const card = (label, value, hint, opts = {}) => h('div', {
    title: opts.title || undefined,
    style: { padding: '9px 11px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` },
  },
    h('div', { style: { fontSize: 11, opacity: 0.6, marginBottom: 2 } }, label),
    h('div', {
      className: 'moxi-serif',
      style: { fontSize: 19, fontWeight: 600, color: opts.danger && Number(value) > 0 ? TOKENS.error : undefined },
    }, value),
    hint ? h('div', { style: { fontSize: 10.5, opacity: 0.55 } }, hint) : null
  )
  // 待处理优先：改稿失效/未签收 → 缺钩子 → 其余已签收；同组内按集号
  const rowKind = (e) => {
    if (!e.signoff || e.signoff.stale) return 0
    if (e.hook && !e.hook.has) return 1
    return 2
  }
  const sortedEpisodes = [...((report && report.episodes) || [])]
    .sort((a, b) => (rowKind(a) - rowKind(b)) || (Number(a.episode) - Number(b.episode)))
  const pendingRows = sortedEpisodes.filter((e) => rowKind(e) < 2)
  const signedRows = sortedEpisodes.filter((e) => rowKind(e) === 2)
  const cellStyle = { padding: '6px 8px', borderBottom: `1px solid ${TOKENS.border}` }
  const sectionRow = (key, title, count) => h('tr', { key },
    h('td', {
      colSpan: 7,
      style: {
        padding: '8px 8px 4px', fontSize: 11, fontWeight: 650, opacity: 0.72,
        borderBottom: `1px solid ${TOKENS.border}`, background: TOKENS.bg, position: 'sticky', top: 28,
      },
    }, `${title} · ${count} 集`))
  const episodeRow = (e) => {
    const stale = !!(e.signoff && e.signoff.stale)
    return h('tr', {
      key: `row-${e.episode}`,
      'data-testid': `shoot-row-${e.episode}`,
      style: stale ? { background: 'rgba(176,138,74,.12)' } : undefined,
    },
      h('td', { style: cellStyle }, epLabel(e.episode)),
      h('td', { style: cellStyle }, e.scenes),
      h('td', { style: cellStyle }, `${e.durationSeconds}s`),
      h('td', { style: { ...cellStyle, maxWidth: 180 } },
        e.speakers.length ? e.speakers.slice(0, 4).join('、') : '—',
        e.unknownSpeakers.length ? h('span', { style: { color: TOKENS.warn }, title: `不在设定集：${e.unknownSpeakers.join('、')}` }, ` ⚠${e.unknownSpeakers.length}`) : null),
      h('td', { style: cellStyle }, e.hook.has ? '有' : h('span', { style: { color: TOKENS.warn } }, '缺')),
      h('td', { style: cellStyle },
        e.signoff
          ? (stale
            ? h('span', { style: { color: TOKENS.warn } }, '已签收（改稿失效）')
            : `已签收 ${String(e.signoff.at || '').slice(5, 16)}`)
          : h('span', { style: { opacity: 0.7 } }, '未签收')),
      h('td', { style: { ...cellStyle, whiteSpace: 'nowrap' } },
        !e.signoff
          ? h(Button, { onClick: () => { setSignEp(e); setNotes('') }, disabled: busyEp === e.episode, title: '我读过这一集，签字' }, '签收')
          : h('span', { style: { display: 'inline-flex', gap: 4 } },
            stale
              ? h(Button, {
                tone: 'primary', onClick: () => reSign(e), disabled: busyEp === e.episode,
                title: '按当前稿件版本重新签收（改稿后原签收已失效）',
              }, busyEp === e.episode ? '处理中…' : '重新签收')
              : null,
            h(Button, { onClick: () => revoke(e), disabled: busyEp === e.episode, title: '撤回签收' }, '撤回'))
      )
    )
  }
  const tableRows = []
  if (pendingRows.length) tableRows.push(sectionRow('sec-pending', '待处理', pendingRows.length))
  for (const e of pendingRows) tableRows.push(episodeRow(e))
  if (signedRows.length) tableRows.push(sectionRow('sec-signed', '已签收', signedRows.length))
  for (const e of signedRows) tableRows.push(episodeRow(e))

  return h(Drawer, {
    title: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } },
      h('span', { className: 'moxi-serif' }, '可拍性报告'),
      h('span', { className: 'moxi-stamp' }, '实验'),
    ),
    onClose, width: 760, testid: 'drawer-shootability',
    footer: [
      h(Button, { key: 'd', onClick: download, 'data-testid': 'btn-shootability-download' }, '下载报告 md'),
      h(Button, { key: 'r', onClick: load, disabled: loading, 'data-testid': 'btn-shootability-refresh' }, loading ? '刷新中…' : '刷新'),
      h(Button, { key: 'c', tone: 'primary', onClick: onClose }, '关闭'),
    ],
  },
    loading && !report ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } }, h(Spinner), '正在估算…')
      : !report ? h('div', { style: { fontSize: 12, lineHeight: 1.7, opacity: 0.8 } },
        '暂无数据：报告还没读到，或这个项目还没有剧本正文。可点「刷新」重试。')
        : h('div', { style: { display: 'grid', gap: 12 } },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 } },
            card('集数', s.episodes),
            card('平均估算', `${s.avgDurationSeconds}s`, `目标 ${report.project.episodeSeconds}s`),
            card('待签收', needSignoff, `未签收 ${unsignedOnly} 集 + 改稿失效 ${staleCount} 集`, {
              danger: true,
              title: `待签收 ${needSignoff} 集 ＝ 未签收 ${unsignedOnly} 集 + 改稿失效 ${staleCount} 集（改稿失效已包含在待签收内，不重复计数）`,
            }),
            card('缺钩子', s.hooksMissing, `陌生角色 ${s.unknownSpeakerEpisodes} 集`),
            card('已签收', `${s.signedOff}/${s.episodes}`, staleCount ? `另有改稿失效 ${staleCount} 集待重签` : '逐集人工签收')
          ),
          h('div', { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.7 } },
            '时长按对白字数（约 4.6 字/秒）与动作行推算，±25% 容差；钩子为文本特征检测。两者都只是审读辅助，不替代你的判断。'),
          h('div', { style: { overflow: 'auto', maxHeight: 420, border: `1px solid ${TOKENS.border}`, borderRadius: 8 } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null, h('tr', null,
                ['集', '场次', '估算', '角色', '钩子', '签收', '操作'].map((t) => h('th', {
                  key: t, style: { textAlign: 'left', padding: '7px 8px', borderBottom: `1px solid ${TOKENS.border}`, fontSize: 11, opacity: 0.7, position: 'sticky', top: 0, background: TOKENS.bg },
                }, t)))),
              h('tbody', null, tableRows)
            )
          ),
          h('div', { style: { fontSize: 11, opacity: 0.55 } }, `问题项 ${s.issueCount} 个`),
          // 角色出场分布默认折叠，避免抢走「待处理」表格的注意力
          h('details', { style: { fontSize: 11, opacity: 0.72 } },
            h('summary', { style: { cursor: 'pointer', lineHeight: 1.7 } },
              `角色出场分布（${Object.keys(report.presence || {}).length} 位）`),
            h('div', { style: { marginTop: 6, display: 'grid', gap: 3, paddingLeft: 2 } },
              Object.entries(report.presence || {}).map(([name, eps]) => h('div', { key: name },
                h('span', { style: { fontWeight: 600 } }, name), `：${eps.join('、')} 集`)))
          ),
          signEp ? h(Modal, {
            title: `签收${epLabel(signEp.episode)}`,
            onClose: () => setSignEp(null),
            width: 460,
            testid: 'modal-signoff',
            footer: [
              h(Button, { key: 'c', onClick: () => setSignEp(null) }, '取消'),
              h(Button, { key: 's', tone: 'primary', onClick: doSign, disabled: busyEp === signEp.episode, 'data-testid': 'btn-confirm-signoff' }, busyEp === signEp.episode ? '签收中…' : '确认签收'),
            ],
          },
            h('div', { style: { fontSize: 12.5, lineHeight: 1.7, marginBottom: 10 } },
              '签收表示你已通读这一集，认可剧情、人物与合规；签收绑定当前稿件版本，之后改稿会自动失效。'),
            h('div', { style: { display: 'grid', gap: 6 } },
              h('div', { style: { fontSize: 11, opacity: 0.65 } }, `备注（可选，≤200 字）`),
              h('textarea', {
                value: notes, maxLength: 200,
                onChange: (ev) => setNotes(ev.target.value),
                placeholder: '例如：第 3 场节奏偏慢，已让编剧改；整体可拍。',
                'data-testid': 'input-signoff-notes',
                style: { width: '100%', minHeight: 70, padding: '8px 10px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' },
              })
            )
          ) : null
        )
  )
}

/* ------------------------------------------------------------------ */
/* 任务列表弹窗                                                        */
/* ------------------------------------------------------------------ */
function JobListModal({ project, onClose, onOpenJob, toast, confirm }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.listJobs(project.id)
      setJobs(Array.isArray(rows) ? rows : [])
    } catch (e) {
      toast({ kind: 'error', text: '读取任务列表失败：' + e.message })
    } finally { setLoading(false) }
  }, [project.id])
  useEffect(() => { load() }, [load])

  const cancel = async (job) => {
    const ok = await confirm({
      title: '取消生成任务',
      message: `确认取消任务 ${job.id}（${jobScopeText(job)}）？已完成的集保留。`,
      danger: true, confirmText: '取消任务', cancelText: '继续跑',
    })
    if (!ok) return
    setBusyId(job.id)
    try {
      await api.cancelJob(job.id)
      toast({ kind: 'success', text: '已请求取消任务' })
      await load()
    } catch (e) {
      toast({ kind: 'error', text: '取消失败：' + e.message })
    } finally { setBusyId('') }
  }
  const resume = async (job) => {
    setBusyId(job.id)
    try {
      await api.resumeJob(project.id, job.id)
      toast({ kind: 'success', text: '已请求续跑' })
      await load()
    } catch (e) {
      toast({ kind: 'error', text: '续跑失败：' + e.message })
    } finally { setBusyId('') }
  }

  return h(Modal, {
    title: '生成任务',
    onClose,
    width: 760,
    testid: 'modal-jobs',
    footer: [
      h(Button, { key: 'r', onClick: load, 'data-testid': 'btn-jobs-refresh' }, '刷新'),
      h(Button, { key: 'c', onClick: onClose }, '关闭'),
    ],
  },
    loading ? h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 } }, h(Spinner), '加载任务…')
      : jobs.length === 0
        ? h('div', { style: { fontSize: 12, opacity: 0.65, padding: '12px 4px' } }, '该项目还没有生成任务。点工具栏「生成」启动一个。')
        : h('div', { style: { display: 'grid', gap: 6 } },
          jobs.map((job) => {
            const p = jobDone(job)
            const terminal = isJobTerminal(job)
            return h('div', {
              key: job.id,
              'data-testid': `job-row-${job.id}`,
              style: { display: 'grid', gridTemplateColumns: '1fr 110px 90px 120px 170px', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bgSoft, fontSize: 11.5 },
            },
              h('div', null,
                h('div', { style: { fontFamily: TOKENS.mono, fontSize: 11 } }, job.id),
                h('div', { style: { opacity: 0.65 } }, `${jobScopeText(job)} · ${job.provider}/${job.model}`)
              ),
              h(JobBadge, { status: job.status }),
              h('div', { style: { fontFamily: TOKENS.mono } }, `${p.done}/${p.total} 集${p.failed ? ` · ✕${p.failed}` : ''}`),
              h('div', { style: { opacity: 0.65, fontFamily: TOKENS.mono } }, fmtTs(job.createdAt)),
              h('div', { style: { display: 'flex', gap: 4, justifyContent: 'flex-end' } },
                h(Button, { 'data-testid': `btn-view-job-${job.id}`, onClick: () => onOpenJob(job) }, '查看'),
                !terminal ? h(Button, { 'data-testid': `btn-list-cancel-${job.id}`, tone: 'danger', disabled: busyId === job.id, onClick: () => cancel(job) }, '取消') : null,
                terminal && ['cancelled', 'failed', 'done_with_errors'].includes(String(job.status))
                  ? h(Button, { 'data-testid': `btn-list-resume-${job.id}`, disabled: busyId === job.id, onClick: () => resume(job) }, '续跑') : null
              )
            )
          })
        )
  )
}

/* ------------------------------------------------------------------ */
/* 导入旧项目（v2 工作区：project.json + canvas.json + content/*.md）    */
/* ------------------------------------------------------------------ */
function ImportModal({ project, canvas, onClose, onImported, toast }) {
  const [phase, setPhase] = useState('pick') // pick | preview | importing
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fileMode, setFileMode] = useState('dir')
  const dirInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const pickerSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

  const reset = () => { setPhase('pick'); setSource(null); setError(''); setWarnings([]); setProgress({ done: 0, total: 0 }) }

  const readFromFiles = async (files) => {
    setError('')
    const list = Array.from(files || [])
    if (!list.length) return
    const norm = (f) => String(f.webkitRelativePath || f.name || '')
    const byPath = new Map(list.map((f) => [norm(f), f]))
    const findOne = (name) => {
      const hit = [...byPath.entries()].filter(([p]) => baseName(p) === name).sort((a, b) => a[0].length - b[0].length)[0]
      return hit ? hit[1] : null
    }
    const projectFile = findOne('project.json')
    const canvasFile = findOne('canvas.json')
    if (!projectFile || !canvasFile) {
      setError('该目录不是 v2 项目工作区：缺少 project.json 或 canvas.json。')
      return
    }
    try {
      const projectJson = JSON.parse(await projectFile.text())
      const canvasJson = JSON.parse(await canvasFile.text())
      if (!canvasJson || !Array.isArray(canvasJson.nodes)) {
        setError('canvas.json 结构不合法：缺少 nodes 数组。')
        return
      }
      // 正文：content/<nodeId>.md 或任意 .md，按文件名映射
      const contentByName = new Map()
      for (const f of list) {
        const name = baseName(norm(f))
        if (!name.endsWith('.md')) continue
        contentByName.set(name, await f.text())
      }
      const contents = new Map()
      for (const node of canvasJson.nodes) {
        const fileName = baseName(node && node.contentFile)
        const text = (fileName && contentByName.get(fileName)) || contentByName.get(`${node && node.id}.md`) || ''
        if (text) contents.set(node.id, text)
      }
      buildPreview(projectJson, canvasJson, contents, list)
    } catch (e) {
      setError('解析失败：' + e.message)
    }
  }

  const readFromPicker = async () => {
    setError('')
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' })
      const all = []
      const walk = async (handle, prefix) => {
        for await (const entry of handle.values()) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.kind === 'directory') await walk(entry, path)
          else all.push(await entry.getFile())
        }
      }
      await walk(dir, '')
      await readFromFiles(all)
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        setError('已取消目录选择。也可以点「改用逐个选文件」。')
        return
      }
      setError('目录选择失败：' + (e && e.message ? e.message : String(e)) + '。可改用「逐个选文件」。')
    }
  }

  const buildPreview = (projectJson, canvasJson, contents, files) => {
    const warnings = []
    const nodes = canvasJson.nodes.filter((n) => {
      if (!n || typeof n !== 'object' || !n.id || !n.type) { warnings.push('跳过 1 个缺少 id/type 的节点'); return false }
      if (!NODE_TYPES[n.type]) { warnings.push(`跳过未知类型节点「${n.title || n.id}」（type=${n.type}）`); return false }
      return true
    })
    const edges = Array.isArray(canvasJson.edges) ? canvasJson.edges.filter((e) => e && e.from && e.to) : []
    const expected = nodes.filter((n) => n.contentFile).length
    const withContent = nodes.filter((n) => contents.has(n.id)).length
    let chars = 0
    for (const text of contents.values()) chars += text.length
    if (nodes.length !== canvasJson.nodes.length) warnings.push(`共 ${canvasJson.nodes.length - nodes.length} 个节点因结构不合法被跳过`)
    if (expected > withContent) warnings.push(`有 ${expected - withContent} 个节点标了 contentFile 但目录里没找到对应 .md`)
    const byType = {}
    for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1
    setSource({
      projectJson: projectJson || {},
      canvasJson: { nodes, edges, viewport: canvasJson.viewport || null },
      contents,
      files: files.map((f) => String(f.webkitRelativePath || f.name || '')),
      stats: { nodes: nodes.length, edges: edges.length, withContent, chars, byType },
    })
    setWarnings(warnings)
    setPhase('preview')
  }

  const doImport = async () => {
    if (!source) return
    const existing = new Set((canvas.nodes || []).map((n) => n.id))
    const idMap = new Map()
    const ops = []
    for (const node of source.canvasJson.nodes) {
      let id = node.id
      if (existing.has(id)) id = randId('n_imp')
      existing.add(id)
      idMap.set(node.id, id)
      const nodePayload = {
        id,
        type: node.type,
        title: String(node.title || ''),
        x: Number(node.x) || 0, y: Number(node.y) || 0,
        w: Number(node.w) || 280, h: Number(node.h) || 150,
        ref: node.ref || { episode: null, scene: null },
        meta: node.meta || {},
      }
      const text = source.contents.get(node.id) || ''
      ops.push({ op: 'node.create', node: nodePayload, text })
    }
    for (const edge of source.canvasJson.edges) {
      const from = idMap.get(edge.from)
      const to = idMap.get(edge.to)
      if (!from || !to) continue
      ops.push({ op: 'edge.create', from, to, kind: edge.kind === 'context' ? 'context' : 'dependency' })
    }
    if (source.canvasJson.viewport && !(canvas.nodes || []).length) {
      ops.push({ op: 'viewport.set', viewport: source.canvasJson.viewport })
    }
    if (!ops.length) { setError('没有可导入的内容。'); return }
    setPhase('importing')
    setProgress({ done: 0, total: ops.length })
    try {
      for (let i = 0; i < ops.length; i += 50) {
        const chunk = ops.slice(i, i + 50)
        await api.apply(project.id, chunk, { idempotencyKey: newIdemKey('import') })
        setProgress({ done: Math.min(ops.length, i + chunk.length), total: ops.length })
      }
      toast({ kind: 'success', text: `导入完成：${source.stats.nodes} 节点 / ${source.stats.edges} 连线 / ${source.stats.chars} 字符` })
      onImported && onImported()
    } catch (e) {
      setPhase('preview')
      setError(`导入第 ${Math.floor(progress.done / 50) + 1} 批失败（已写入的部分保留）：${e.message}`)
    }
  }

  const footer = phase === 'pick'
    ? [h(Button, { key: 'c', onClick: onClose }, '取消')]
    : phase === 'preview'
      ? [
        h(Button, { key: 'b', onClick: reset }, '重新选择'),
        h(Button, { key: 'c', onClick: onClose }, '取消'),
        h(Button, { key: 'ok', tone: 'primary', onClick: doImport, 'data-testid': 'btn-import-confirm' }, '确认导入'),
      ]
      : [h(Button, { key: 'c', onClick: () => {}, disabled: true }, '导入中…')]

  const statsCards = source
    ? [['节点', source.stats.nodes], ['连线', source.stats.edges], ['有正文', source.stats.withContent], ['正文字符', source.stats.chars]].map(([label, value]) =>
      h('div', { key: label, style: { padding: '8px 10px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
        h('div', { style: { fontSize: 10.5, opacity: 0.6 } }, label),
        h('div', { style: { fontSize: 15, fontWeight: 650, fontFamily: TOKENS.mono } }, String(value))
      ))
    : []

  return h(Modal, {
    title: '导入本地项目工作区',
    onClose: phase === 'importing' ? () => {} : onClose,
    width: 640,
    testid: 'modal-import',
    footer,
  },
    phase === 'pick'
      ? h('div', { style: { display: 'grid', gap: 12 } },
        h('div', { style: { fontSize: 12.5, lineHeight: 1.65, opacity: 0.85 } },
          `把本地 v2 工作区（project.json + canvas.json + content/*.md）导入到当前项目「${project.title}」。`,
          '导入会按每批 ≤50 个操作分批写入；同 id 节点会自动改名避免冲突。'
        ),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          pickerSupported ? h(Button, { tone: 'primary', onClick: readFromPicker, 'data-testid': 'btn-choose-dir' }, '选择目录（系统对话框）') : null,
          h(Button, {
            onClick: () => { setFileMode('dir'); setTimeout(() => dirInputRef.current && dirInputRef.current.click(), 0) },
            'data-testid': 'btn-choose-dir-input',
          }, '选择目录（浏览器文件框）'),
          h(Button, {
            onClick: () => { setFileMode('files'); setTimeout(() => fileInputRef.current && fileInputRef.current.click(), 0) },
            'data-testid': 'btn-choose-files',
          }, '改用逐个选文件')
        ),
        h('input', {
          ref: dirInputRef,
          type: 'file', multiple: true, webkitdirectory: '', directory: '',
          'data-testid': 'input-import-dir',
          style: { display: 'none' },
          onChange: (e) => readFromFiles(e.target.files),
        }),
        h('input', {
          ref: fileInputRef,
          type: 'file', multiple: true,
          'data-testid': 'input-import-files',
          style: { display: 'none' },
          onChange: (e) => readFromFiles(e.target.files),
        }),
        h('div', { style: { fontSize: 11.5, opacity: 0.6, lineHeight: 1.6 } },
          '说明：浏览器安全限制下无法直接按绝对路径读盘，因此「逐个选文件」是兜底方式（选 project.json、canvas.json 和 content 下的 .md 即可）。'
        ),
        error ? h('div', { style: { fontSize: 12, color: TOKENS.error, lineHeight: 1.6 } }, error) : null
      )
      : phase === 'preview' && source
        ? h('div', { style: { display: 'grid', gap: 12 } },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } }, statsCards),
          h('div', { style: { fontSize: 12, lineHeight: 1.7 } },
            h('div', null, `项目名：${source.projectJson.title || '（未命名）'} · 集数：${source.projectJson.episodeCount ?? '未确认'}`),
            h('div', { style: { opacity: 0.7 } }, `工位类型：${Object.entries(source.stats.byType).map(([k, v]) => `${(NODE_TYPES[k] || {}).label || k}×${v}`).join(' · ')}`),
            h('div', { style: { opacity: 0.7 } }, `文件：${source.files.slice(0, 4).join('、')}${source.files.length > 4 ? ` 等 ${source.files.length} 个` : ''}`)
          ),
          warnings.length ? h('div', { style: { padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 11.5, lineHeight: 1.6, color: '#92400e' } },
            ...warnings.map((w, i) => h('div', { key: i }, `⚠ ${w}`))) : null,
          error ? h('div', { style: { fontSize: 12, color: TOKENS.error, lineHeight: 1.6 } }, error) : null
        )
        : h('div', { style: { display: 'grid', gap: 10 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } }, h(Spinner), `正在分批导入：${progress.done}/${progress.total} 个操作…`),
          h(ProgressBar, { done: progress.done, total: progress.total })
        )
  )
}

/* ------------------------------------------------------------------ */
/* 画布主视图                                                          */
/* ------------------------------------------------------------------ */
function CanvasView({ project, canvas, rev, onBack, onChanged, toast, confirm }) {
  const [nodes, setNodes] = useState(canvas.nodes)
  const [edges, setEdges] = useState(canvas.edges)
  const [viewport, setViewport] = useState(canvas.viewport || { x: 0, y: 0, zoom: 0.85 })
  const [selected, setSelected] = useState(null)
  const [showGrid, setShowGrid] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [jobsOpen, setJobsOpen] = useState(false)
  const [shootOpen, setShootOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [drawerJob, setDrawerJob] = useState(null) // { jobId }
  const [history, setHistory] = useState({ undo: [], redo: [] })
  const [historyBusy, setHistoryBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [activeJobs, setActiveJobs] = useState(0)
  const [latestJob, setLatestJob] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportConflictOpen, setExportConflictOpen] = useState(false)
  const [exportDone, setExportDone] = useState(null)
  const [releasing, setReleasing] = useState(false)
  const [gateInfo, setGateInfo] = useState(null) // 可拍性闸门未通过的详情
  const [forceReason, setForceReason] = useState('')
  // 完整可拍性报告：打开项目就拉，横幅/顶卡片/画布摘要/集导航都从这一份派生
  const [shootReport, setShootReport] = useState(null)
  const [shootLoading, setShootLoading] = useState(false)
  const [reviewState, setReviewState] = useState(project.reviewState || null)
  const inspectorSaveRef = useRef(null)
  const handleSaveReady = useCallback((fn) => { inspectorSaveRef.current = fn }, [])
  const [dirty, setDirty] = useState(false)
  const drag = useRef(null)
  const surfaceRef = useRef(null)
  const historyRef = useRef(history)
  historyRef.current = history
  const persistedVpRef = useRef(canvas.viewport || { x: 0, y: 0, zoom: 0.85 })
  const dirtyRef = useRef(false)

  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    setNodes(canvas.nodes)
    setEdges(canvas.edges)
    const vp = canvas.viewport || { x: 0, y: 0, zoom: 0.85 }
    setViewport(vp)
    persistedVpRef.current = { x: vp.x, y: vp.y, zoom: vp.zoom }
    setEditingId(null)
  }, [canvas.rev])

  /* ---------- 基础提交 ---------- */
  const apply = useCallback(async (ops, opts = {}) => {
    const r = await api.apply(project.id, ops, { idempotencyKey: newIdemKey('canvas'), ...opts })
    onChanged && onChanged()
    return r
  }, [project.id, onChanged])

  const pushHistory = useCallback((entry) => {
    setHistory((st) => ({ undo: [...st.undo, entry].slice(-UNDO_LIMIT), redo: [] }))
  }, [])

  const nodeById = useMemo(() => {
    const m = new Map()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  const selectedNode = selected ? nodeById.get(selected) || null : null

  /* ---------- 撤销 / 重做 ---------- */
  const runHistory = useCallback(async (direction) => {
    const st = historyRef.current
    const source = direction === 'undo' ? st.undo : st.redo
    const entry = source[source.length - 1]
    if (!entry || historyBusy) return
    setHistoryBusy(true)
    try {
      const ops = direction === 'undo' ? entry.inverse : entry.forward
      await api.apply(project.id, ops, { idempotencyKey: newIdemKey(direction) })
      setHistory((cur) => {
        if (direction === 'undo') return { undo: cur.undo.slice(0, -1), redo: [...cur.redo, entry].slice(-UNDO_LIMIT) }
        return { undo: [...cur.undo, entry].slice(-UNDO_LIMIT), redo: cur.redo.slice(0, -1) }
      })
      toast({ kind: 'success', text: `${direction === 'undo' ? '已撤销' : '已重做'}：${entry.label}` })
      onChanged && onChanged()
    } catch (e) {
      toast({ kind: 'error', text: `${direction === 'undo' ? '撤销' : '重做'}失败：${e.message}` })
    } finally { setHistoryBusy(false) }
  }, [project.id, historyBusy, onChanged, toast])
  const undo = useCallback(() => runHistory('undo'), [runHistory])
  const redo = useCallback(() => runHistory('redo'), [runHistory])

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const key = String(e.key || '').toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* ---------- 视口持久化（防抖 800ms） ---------- */
  useEffect(() => {
    const last = persistedVpRef.current || {}
    const same = Math.abs((viewport.x || 0) - (last.x || 0)) < 0.5 &&
      Math.abs((viewport.y || 0) - (last.y || 0)) < 0.5 &&
      Math.abs((viewport.zoom || 0) - (last.zoom || 0)) < 0.0005
    if (same) return undefined
    const timer = window.setTimeout(async () => {
      try {
        await api.apply(project.id, [{ op: 'viewport.set', viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } }], { idempotencyKey: newIdemKey('vp') })
        persistedVpRef.current = { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
      } catch { /* 静默：视口保存失败不打断 */ }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [viewport.x, viewport.y, viewport.zoom, project.id])

  /* ---------- 任务角标（每 10s） ---------- */
  const refreshActiveJobs = useCallback(async () => {
    try {
      const rows = await api.listJobs(project.id)
      const list = Array.isArray(rows) ? rows : []
      setActiveJobs(list.filter((j) => j && (j.status === 'running' || j.status === 'queued')).length)
      setLatestJob(list[0] || null)
    } catch { /* 静默 */ }
  }, [project.id])
  useEffect(() => {
    refreshActiveJobs()
    const timer = window.setInterval(refreshActiveJobs, 10000)
    return () => window.clearInterval(timer)
  }, [refreshActiveJobs])

  /* ---------- 画布交互 ---------- */
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const rect = surfaceRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setViewport((vp) => {
      const factor = Math.exp(-e.deltaY * 0.0015)
      const zoom = Math.min(2.5, Math.max(0.2, vp.zoom * factor))
      const k = zoom / vp.zoom
      return { zoom, x: px - (px - vp.x) * k, y: py - (py - vp.y) * k }
    })
  }, [])

  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return undefined
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onSurfacePointerDown = (e) => {
    if (e.button !== 0) return
    setSelected(null)
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onNodePointerDown = (node) => (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    // 选中走 onClick → selectNode（含“放弃未保存正文”守卫），这里只准备拖动。
    // 不立即 setPointerCapture：否则 click/dblclick 会被重定向到卡片，标题双击改名失效。
    // 真正开始拖动（位移 > 阈值）时再让画布捕获指针。
    drag.current = { kind: 'node', id: node.id, startX: e.clientX, startY: e.clientY, nx: node.x, ny: node.y, moved: false, captured: false }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.startX) / viewport.zoom
    const dy = (e.clientY - d.startY) / viewport.zoom
    if (d.kind === 'node' && !d.captured && (Math.abs(dx) + Math.abs(dy)) > 2) {
      d.captured = true
      try { surfaceRef.current && surfaceRef.current.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    if (d.kind === 'pan') {
      setViewport((vp) => ({ ...vp, x: d.vx + (e.clientX - d.startX), y: d.vy + (e.clientY - d.startY) }))
    } else {
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
      setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x: Math.round(d.nx + dx), y: Math.round(d.ny + dy) } : n)))
    }
  }
  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    if (d && d.kind === 'node' && d.moved) {
      const n = nodes.find((x) => x.id === d.id)
      if (!n) return
      const forward = [{ op: 'node.update', nodeId: n.id, patch: { x: n.x, y: n.y } }]
      apply(forward)
        .then(() => pushHistory({
          label: `移动「${n.title}」`,
          forward,
          inverse: [{ op: 'node.update', nodeId: n.id, patch: { x: d.nx, y: d.ny } }],
        }))
        .catch((err) => toast({ kind: 'error', text: '保存位置失败：' + err.message }))
    }
  }

  /* ---------- 节点操作 ---------- */
  const onCreateNode = async (type) => {
    const rect = surfaceRef.current.getBoundingClientRect()
    const x = Math.round((rect.width / 2 - viewport.x) / viewport.zoom) - 140
    const y = Math.round((rect.height / 2 - viewport.y) / viewport.zoom) - 75
    try {
      const r = await apply([{ op: 'node.create', node: { type, title: `新${NODE_TYPES[type].label}`, x, y } }])
      const nodeId = r && r.results && r.results[0] ? r.results[0].nodeId : null
      setCreateOpen(false)
      toast({ kind: 'success', text: '节点已创建' })
      if (nodeId) {
        pushHistory({
          label: `创建节点「${NODE_TYPES[type].label}」`,
          forward: [{ op: 'node.create', node: { id: nodeId, type, title: `新${NODE_TYPES[type].label}`, x, y } }],
          inverse: [{ op: 'node.delete', nodeId }],
        })
        setSelected(nodeId)
      }
    } catch (e) {
      toast({ kind: 'error', text: '创建节点失败：' + e.message })
    }
  }

  const onTransition = async (node, to) => {
    const from = node.status
    const forward = [{ op: 'node.transition', nodeId: node.id, to, reason: 'ui' }]
    try {
      await apply(forward)
      pushHistory({
        label: `「${node.title}」状态 ${STATUS_META[from] ? STATUS_META[from].label : from}→${STATUS_META[to] ? STATUS_META[to].label : to}`,
        forward,
        inverse: [{ op: 'node.transition', nodeId: node.id, to: from, reason: 'undo' }],
      })
      toast({ kind: 'success', text: `状态 → ${STATUS_META[to] ? STATUS_META[to].label : to}` })
    } catch (e) {
      toast({ kind: 'error', text: '状态迁移失败：' + e.message })
    }
  }

  const onContentSaved = (before, after) => {
    pushHistory({
      label: '保存正文',
      forward: [{ op: 'node.write', nodeId: selected, text: after }],
      inverse: [{ op: 'node.write', nodeId: selected, text: before }],
    })
    // 正文字数/钩子检测都来自报告，保存后重拉一次，让横幅与卡片跟上
    reloadShootReport()
  }

  const onDeleteNode = async (node) => {
    const ok = await confirm({
      title: '删除节点',
      message: `确认删除节点「${node.title}」？`,
      detail: '会同时删除与它相连的连线；删除后可用 Cmd+Z 撤销恢复（正文一并恢复）。',
      danger: true,
      confirmText: '删除节点',
    })
    if (!ok) return
    try {
      const content = await api.getContent(project.id, node.id).catch(() => ({ text: '' }))
      const snapshot = {
        id: node.id, type: node.type, title: node.title,
        x: node.x, y: node.y, w: node.w, h: node.h,
        ref: node.ref || { episode: null, scene: null }, meta: node.meta || {},
      }
      await apply([{ op: 'node.delete', nodeId: node.id }])
      pushHistory({
        label: `删除节点「${node.title}」`,
        forward: [{ op: 'node.delete', nodeId: node.id }],
        inverse: [{ op: 'node.create', node: snapshot, text: content.text || '' }],
      })
      if (selected === node.id) setSelected(null)
      toast({ kind: 'success', text: '节点已删除（可撤销）' })
    } catch (e) {
      toast({ kind: 'error', text: '删除失败：' + e.message })
    }
  }

  /* ---------- 重命名 ---------- */
  const startRename = (node) => {
    setEditingId(node.id)
    setEditingText(node.title || '')
  }
  const cancelRename = () => { setEditingId(null); setEditingText('') }
  const commitRename = async () => {
    const id = editingId
    if (!id) return
    const node = nodeById.get(id)
    const title = String(editingText || '').trim()
    setEditingId(null)
    if (!node || !title || title === node.title) return
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, title } : n)))
    try {
      await apply([{ op: 'node.update', nodeId: id, patch: { title } }])
      pushHistory({
        label: `重命名「${node.title}」→「${title}」`,
        forward: [{ op: 'node.update', nodeId: id, patch: { title } }],
        inverse: [{ op: 'node.update', nodeId: id, patch: { title: node.title } }],
      })
      toast({ kind: 'success', text: '已重命名' })
    } catch (e) {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, title: node.title } : n)))
      toast({ kind: 'error', text: '重命名失败：' + e.message })
    }
  }

  const selectNode = useCallback(async (id) => {
    if (id === selected) return
    if (dirtyRef.current) {
      const ok = await confirm({
        title: '放弃未保存正文？',
        message: '当前节点有未保存的正文修改，切换节点会丢失。',
        danger: true, confirmText: '放弃修改', cancelText: '回去保存',
      })
      if (!ok) return
      dirtyRef.current = false
      setDirty(false)
    }
    setSelected(id)
  }, [selected, confirm])

  const closeInspector = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: '放弃未保存正文？',
        message: '当前节点有未保存的正文修改，关闭会丢失。',
        danger: true, confirmText: '放弃修改', cancelText: '回去保存',
      })
      if (!ok) return
      dirtyRef.current = false
      setDirty(false)
    }
    setSelected(null)
  }

  const goBack = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: '放弃未保存正文？',
        message: '当前节点有未保存的正文修改，返回项目列表会丢失。',
        danger: true, confirmText: '放弃并返回', cancelText: '回去保存',
      })
      if (!ok) return
      dirtyRef.current = false
      setDirty(false)
    }
    onBack()
  }

  const onCheck = async (node) => {
    try {
      const r = await api.runCheck(project.id, node.id)
      toast({ kind: r.summary.verdict === 'reject' ? 'error' : 'success', text: `检查完成：${r.summary.verdict}（${r.summary.errors} 错 / ${r.summary.warnings} 警）` })
      onChanged && onChanged()
    } catch (e) {
      toast({ kind: 'error', text: '检查失败：' + e.message })
    }
  }

  const showExportToast = useCallback((r) => {
    setExportDone(r || {})
    const path = r && r.path ? String(r.path) : ''
    const kb = Math.round(((r && r.bytes) || 0) / 1024)
    toast({ kind: 'success', duration: 5000, text: `已导出 ${r && r.format ? r.format : 'docx'} · ${kb} KB` })
  }, [toast])

  const doExport = useCallback(async () => {
    setExporting(true)
    try {
      const r = await api.exportProject(project.id, 'docx')
      showExportToast(r)
    } catch (e) {
      toast({ kind: 'error', text: '导出失败：' + e.message })
    } finally { setExporting(false) }
  }, [project.id, showExportToast, toast])

  // 导出：正文有未保存改动 → 三选（保存并导出 / 仅导出磁盘版 / 取消）
  const onExport = () => {
    if (dirtyRef.current) { setExportConflictOpen(true); return }
    doExport()
  }
  const exportSaveAndGo = async () => {
    setExportConflictOpen(false)
    const ok = inspectorSaveRef.current ? await inspectorSaveRef.current() : true
    if (!ok) { toast({ kind: 'error', text: '保存失败，已中止导出' }); return }
    await doExport()
  }
  const exportDiskOnly = async () => {
    setExportConflictOpen(false)
    await doExport()
  }

  // 人工放行：生成完成 → 作者确认 → 可交付
  const onRelease = async () => {
    const ok = await confirm({
      title: '人工放行这部剧？',
      message: '放行表示你已通读/抽查剧本，确认可以作为交付稿。放行后会记录放行人与时间。',
      detail: '生成完成只是"自动质检通过"，不代替你的判断。放行会记录当前稿件版本；之后若再改稿，放行自动失效，需要重新放行。',
      confirmText: '确认放行',
      cancelText: '再看看',
    })
    if (!ok) return
    setReleasing(true)
    try {
      const r = await api.releaseProject(project.id)
      setReviewState('released')
      toast({ kind: 'success', text: `已放行：交付节点 ${r.deliveryStatus || 'approved'}，可以导出了` })
      onChanged && onChanged()
    } catch (e) {
      if (e.code === 'E_RELEASE_GATE') {
        setGateInfo({ message: e.message, details: e.details || {} })
        setForceReason('')
      } else {
        toast({ kind: 'error', text: '放行失败：' + e.message })
      }
    } finally { setReleasing(false) }
  }

  const forceRelease = async () => {
    if (!forceReason.trim()) { toast({ kind: 'error', text: '强制放行必须填写理由（会记入审计）' }); return }
    setReleasing(true)
    try {
      const r = await api.releaseProject(project.id, { force: true, forceReason: forceReason.trim() })
      setReviewState('released')
      setGateInfo(null)
      toast({ kind: 'success', text: `已强制放行（原因已记录）· 交付节点 ${r.deliveryStatus || 'approved'}` })
      onChanged && onChanged()
    } catch (e) {
      toast({ kind: 'error', text: '强制放行失败：' + e.message })
    } finally { setReleasing(false) }
  }

  // 打开项目就拉完整报告（不再只等 reviewState==='generated'）；签收/撤回后由抽屉回调重拉
  const reloadShootReport = useCallback(async () => {
    if (!project || !project.id) return null
    setShootLoading(true)
    try {
      const r = await api.shootability(project.id, 'json')
      setShootReport(r || null)
      return r || null
    } catch {
      // 报告拿不到不打断画布：横幅退回定性文案，报告抽屉显示「暂无数据」
      return null
    } finally { setShootLoading(false) }
  }, [project && project.id])

  useEffect(() => { reloadShootReport() }, [reloadShootReport, reviewState])

  // 任务跑到终态后重拉报告（生成/续跑完成时 rev 会变，报告里的字数/钩子也要跟上）
  const reportJobRef = useRef('')
  const onDrawerJobChanged = useCallback((j) => {
    refreshActiveJobs()
    if (!j || !isJobTerminal(j)) return
    const sig = `${j.id}:${j.status}:${(j.progress && j.progress.done) || 0}`
    if (reportJobRef.current === sig) return
    reportJobRef.current = sig
    reloadShootReport()
  }, [refreshActiveJobs, reloadShootReport])

  // 生成完成后 project.reviewState 会从 null 变 generated，同步进组件状态
  useEffect(() => {
    if (project && project.reviewState !== undefined) setReviewState(project.reviewState || null)
  }, [project && project.reviewState])

  // 横幅/顶卡片用的闸门摘要：待签收只数一次（needsSignoff 已含改稿失效）
  const gateSummary = useMemo(() => {
    const s = shootReport && shootReport.summary
    if (!s) return null
    return {
      episodes: Number(s.episodes) || 0,
      signedOff: Number(s.signedOff) || 0,
      needsSignoff: reportNeedsSignoff(s),
      unsignedOnly: reportUnsignedOnly(s),
      staleSignoffs: reportStaleCount(s),
      hooksMissing: Number(s.hooksMissing) || 0,
    }
  }, [shootReport])

  /* ---------- 集级派生数据（卡片摘要 / 集导航 / 闸门明细共用） ---------- */
  const epInfoByEp = useMemo(() => {
    const m = new Map()
    for (const e of ((shootReport && shootReport.episodes) || [])) m.set(Number(e.episode), e)
    return m
  }, [shootReport])
  const scriptEpisodes = useMemo(() => {
    const eps = nodes
      .filter((n) => n.type === 'script_scene')
      .map((n) => Number(n.ref && n.ref.episode))
      .filter((n) => Number.isInteger(n) && n > 0)
    return [...new Set(eps)].sort((a, b) => a - b)
  }, [nodes])
  /** 卡片摘要：报告有数据就用报告，没有就退回状态文案 */
  const nodeSummary = (node) => {
    if (!node) return ''
    const ep = node.ref && node.ref.episode != null ? Number(node.ref.episode) : null
    const statusLabel = (STATUS_META[node.status] || STATUS_META.draft).label
    if (node.type === 'script_scene' && ep) {
      const info = epInfoByEp.get(ep)
      if (info) {
        const hook = info.hook && info.hook.has ? '有钩子' : '缺钩子'
        return `${Number(info.bodyChars) || 0} 字 · ${hook} · ${(info.speakers || []).length} 角色`
      }
      return `${epLabel(ep)} · ${statusLabel}`
    }
    if ((node.type === 'beat_sheet' || node.type === 'scene_list') && ep) return `${epLabel(ep)} · ${statusLabel}`
    if (node.type === 'asset') {
      const f = (node.meta && node.meta.fields) || {}
      const titleParts = String(node.title || '').split(/[·・:：]/)
      const titleName = titleParts.length > 1 ? String(titleParts.pop()).trim() : ''
      const name = String(f.name || '').trim() || titleName
      const kind = String(f.role || f.kind || '').trim()
        || ((node.meta && node.meta.assetKind === 'character') ? '角色' : NODE_TYPES[node.type].label)
      return name ? `${name} · ${kind}` : statusLabel
    }
    if (ep) return `${epLabel(ep)} · ${statusLabel}`
    return statusLabel
  }

  // 定位到某一集：选中该集剧本节点并把视口居中（闸门弹窗与集导航共用）
  const focusEpisode = useCallback((ep) => {
    const n = nodes.find((x) => x.type === 'script_scene' && Number(x.ref && x.ref.episode) === Number(ep))
    if (!n) { toast({ kind: 'error', text: `没找到${epLabel(ep)}的剧本节点` }); return }
    // 选中后右侧检查器（380px）会展开并挤窄画布：按展开后的可视宽度算中心，否则节点会偏右半个面板
    const inspectorOpening = !selected
    selectNode(n.id)
    const el = surfaceRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const usableWidth = inspectorOpening ? Math.max(320, rect.width - 380) : rect.width
    setViewport((vp) => {
      const zoom = vp.zoom || 0.85
      return {
        ...vp,
        x: Math.round(usableWidth / 2 - (n.x + n.w / 2) * zoom),
        y: Math.round(rect.height / 2 - (n.y + n.h / 2) * zoom),
      }
    })
  }, [nodes, selected, selectNode, toast])

  const zoomBy = (k) => setViewport((vp) => ({ ...vp, zoom: Math.min(2.5, Math.max(0.2, vp.zoom * k)) }))
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 800)
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 600)
  const canUndo = history.undo.length > 0
  const canRedo = history.redo.length > 0

  /* ---------- 闸门弹窗明细：未签收 / 改稿失效 / 缺钩子 分开列，不重复计数 ---------- */
  const gateDetails = (gateInfo && gateInfo.details) || {}
  const gateUnsignedAll = Array.isArray(gateDetails.unsigned) ? gateDetails.unsigned.map(Number) : []
  const gateStale = Array.isArray(gateDetails.stale) ? gateDetails.stale.map(Number) : []
  const gateStaleSet = new Set(gateStale)
  const gateUnsignedOnly = Array.isArray(gateDetails.unsignedOnly)
    ? gateDetails.unsignedOnly.map(Number)
    : gateUnsignedAll.filter((n) => !gateStaleSet.has(n))
  const gateNoHook = Array.isArray(gateDetails.noHook) ? gateDetails.noHook.map(Number) : []
  // host 的 details.needsSignoff 可能是集号数组（与 unsigned 同源），也可能是数字
  const gateNeeds = Array.isArray(gateDetails.needsSignoff)
    ? gateDetails.needsSignoff.length
    : (Number.isFinite(Number(gateDetails.needsSignoff)) ? Number(gateDetails.needsSignoff) : gateUnsignedAll.length)
  const gateEpChip = (ep) => h('button', {
    key: `gate-ep-${ep}`,
    'data-testid': `gate-ep-${ep}`,
    onClick: () => { setGateInfo(null); focusEpisode(ep) },
    title: `定位到${epLabel(ep)}的剧本节点`,
    style: {
      border: 0, background: 'transparent', cursor: 'pointer', padding: '0 1px',
      color: TOKENS.brand, fontSize: 11.5, fontFamily: 'inherit', textDecoration: 'underline dotted',
    },
  }, epLabel(ep))
  const gateEpLine = (label, list) => (list.length
    ? h('div', { key: label, style: { fontSize: 11.5, lineHeight: 1.8, opacity: 0.9 } },
      h('span', { style: { opacity: 0.7 } }, `${label} ${list.length} 集：`),
      h('span', null, list.slice(0, 30).map((ep, i) => h(React.Fragment, { key: `f-${ep}` }, i ? '、' : '', gateEpChip(ep)))),
      list.length > 30 ? h('span', { style: { opacity: 0.6 } }, ` 等 ${list.length} 集`) : null)
    : null)

  const edgePath = (a, b) => {
    const from = { x: a.x + a.w, y: a.y + a.h / 2 }
    const to = { x: b.x, y: b.y + b.h / 2 }
    const dx = Math.max(40, Math.abs(to.x - from.x) * 0.45)
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  }

  // 右侧弱化区的小按钮：不抢主操作视线，但仍可点
  const weakBtnStyle = { height: 24, padding: '0 6px', fontSize: 11.5, opacity: 0.82 }
  // 横幅文案：待签收只数一次；N=0 只显示缺钩子；都为 0 显示闸门已通过
  const gateNeedSignoff = reportNeedsSignoff(gateSummary)
  const gateUnsignedOnlyN = reportUnsignedOnly(gateSummary)
  const gateStaleN = reportStaleCount(gateSummary)
  // 待签收直接给出拆分（未签收 a 集、改稿失效 b 集），避免用户自己换算或把失效重复算一次
  const gateSignoffText = gateNeedSignoff > 0
    ? `待签收 ${gateNeedSignoff} 集（未签收 ${gateUnsignedOnlyN} 集、改稿失效 ${gateStaleN} 集）`
    : null
  const gateParts = gateSummary
    ? [
      gateSignoffText,
      Number(gateSummary.hooksMissing) > 0 ? `缺钩子 ${Number(gateSummary.hooksMissing)} 集` : null,
    ].filter(Boolean)
    : []
  const gatePassed = !!gateSummary && gateParts.length === 0

  return h('div', { className: 'moxi-panel', style: { height: '100%', display: 'flex', flexDirection: 'column', background: TOKENS.bg, color: TOKENS.text } },
    /* 工具栏：左侧按阶段排主操作（生成 → 可拍性 → 导出），其余收进右侧弱化区 */
    h('div', { 'data-testid': 'toolbar', style: { flex: '0 0 auto', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderBottom: `1px solid ${TOKENS.border}`, overflowX: 'auto' } },
      h(Button, { tone: 'ghost', onClick: goBack, 'data-testid': 'btn-back' }, '← 项目'),
      h('span', { style: { fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap' } }, project.title),
      h('span', { style: { fontSize: 11, opacity: 0.55, whiteSpace: 'nowrap' } }, `${project.episodeCount ?? '集数未确认'} 集${project.audience ? ' · ' + project.audience : ''}`),
      h('span', { style: { width: 1, height: 18, background: TOKENS.border, margin: '0 2px' } }),
      h(Button, { tone: 'primary', onClick: () => setGenOpen(true), 'data-testid': 'btn-generate' }, '⚡ 生成'),
      h(Button, { onClick: () => setShootOpen(true), 'data-testid': 'btn-shootability', title: '可拍性报告：时长/角色/钩子/逐集签收' }, '可拍性'),
      h(Button, {
        onClick: onExport,
        disabled: exporting,
        title: latestJob && latestJob.status === 'done_with_errors'
          ? `最近生成任务有 ${(latestJob.progress && latestJob.progress.failed) || 0} 集失败，导出前请先续跑或修复`
          : '导出 docx',
        'data-testid': 'btn-export',
      },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } },
          exporting ? '导出中…' : '导出',
          latestJob && latestJob.status === 'done_with_errors'
            ? h('span', { 'data-testid': 'export-warn-dot', title: '最近任务有失败集，导出前请先续跑或修复', style: { width: 7, height: 7, borderRadius: 999, background: TOKENS.error, display: 'inline-block' } })
            : null
        )
      ),
      h('span', { style: { flex: 1 } }),
      // —— 右侧弱化区：次级操作与视图控制 ——
      h('span', { style: { width: 1, height: 18, background: TOKENS.border, margin: '0 2px' } }),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => setCreateOpen(true), 'data-testid': 'btn-add-node' }, '+ 工位'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => setJobsOpen(true), 'data-testid': 'btn-jobs' }, activeJobs ? `创作记录 (${activeJobs})` : '创作记录'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => setImportOpen(true), 'data-testid': 'btn-import' }, '导入'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: undo, disabled: !canUndo || historyBusy, title: canUndo ? `撤销：${history.undo[history.undo.length - 1].label}（Cmd+Z）` : '没有可撤销的操作', 'data-testid': 'btn-undo' }, '↶ 撤销'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: redo, disabled: !canRedo || historyBusy, title: canRedo ? `重做：${history.redo[history.redo.length - 1].label}（Shift+Cmd+Z）` : '没有可重做的操作', 'data-testid': 'btn-redo' }, '↷ 重做'),
      h('span', { style: { fontSize: 10.5, opacity: 0.45, whiteSpace: 'nowrap', fontFamily: TOKENS.mono } }, `rev ${rev}`),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => zoomBy(1 / 1.2), 'data-testid': 'btn-zoom-out' }, '－'),
      h('span', { style: { fontSize: 10.5, minWidth: 34, textAlign: 'center', opacity: 0.62 } }, `${Math.round(viewport.zoom * 100)}%`),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => zoomBy(1.2), 'data-testid': 'btn-zoom-in' }, '＋'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => setViewport({ x: 0, y: 0, zoom: 0.85 }), 'data-testid': 'btn-zoom-reset' }, '复位'),
      h(Button, { tone: 'ghost', style: weakBtnStyle, onClick: () => setShowGrid((v) => !v), 'data-testid': 'btn-grid' }, showGrid ? '网格开' : '网格关')
    ),

    /* 集导航条：剧本集 > 6 才出现；签收改稿失效（朱砂点）/ 缺钩子（赭金点）做标记 */
    scriptEpisodes.length > 6
      ? h('div', {
        'data-testid': 'episode-nav',
        style: { flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderBottom: `1px solid ${TOKENS.border}`, overflowX: 'auto', fontSize: 11 },
      },
        h('span', { style: { opacity: 0.5, marginRight: 4, whiteSpace: 'nowrap' } }, '集'),
        scriptEpisodes.map((ep) => {
          const info = epInfoByEp.get(ep)
          const stale = !!(info && info.signoff && info.signoff.stale)
          const noHook = !!(info && info.hook && !info.hook.has)
          const active = !!(selectedNode && selectedNode.type === 'script_scene' && Number(selectedNode.ref && selectedNode.ref.episode) === ep)
          return h('button', {
            key: `nav-${ep}`,
            'data-testid': `ep-nav-${ep}`,
            onClick: () => focusEpisode(ep),
            title: `${epLabel(ep)}${stale ? ' · 签收已改稿失效' : ''}${noHook ? ' · 缺钩子' : ''}`,
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 3, height: 21, padding: '0 7px',
              borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: TOKENS.mono, fontSize: 10.5,
              color: active ? '#fff' : TOKENS.text,
              background: active ? TOKENS.brand : 'transparent',
              border: `1px solid ${active ? TOKENS.brand : TOKENS.border}`,
              opacity: active ? 1 : 0.85,
            },
          },
            `第${ep}集`,
            stale ? h('span', { title: '签收已改稿失效', style: { width: 5, height: 5, borderRadius: 999, background: TOKENS.error, display: 'inline-block' } }) : null,
            noHook ? h('span', { title: '缺集末钩子', style: { width: 5, height: 5, borderRadius: 999, background: TOKENS.warn, display: 'inline-block' } }) : null)
        })
      )
      : null,

    // 评审状态条：生成完成 ≠ 可交付
    (reviewState === 'generated' || reviewState === 'has_errors')
      ? h('div', {
        'data-testid': 'review-banner',
        style: {
          flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
          background: reviewState === 'generated' ? 'rgba(164,71,54,.08)' : 'rgba(178,58,50,.07)',
          borderBottom: `1px solid ${reviewState === 'generated' ? 'rgba(164,71,54,.28)' : 'rgba(178,58,50,.32)'}`,
          fontSize: 12.5,
        },
      },
        h('span', { className: 'moxi-stamp' }, reviewState === 'generated' ? '待放行' : '有失败集'),
        h('span', { style: { flex: 1, opacity: 0.85 } },
          reviewState === 'generated'
            ? (gatePassed
              ? '本剧已生成，自动质检通过；可拍性闸门已通过，可以放行。'
              : `本剧已生成，自动质检通过。放行需通过可拍性闸门${gateParts.length ? `：${gateParts.join(' · ')}` : ''}。逐集签收 + 补齐钩子后才可放行。`)
            : '最近一次生成有失败集，请打开「创作记录」续跑或修复后再放行。'),
        reviewState === 'generated'
          ? h(Button, { tone: 'primary', onClick: onRelease, disabled: releasing, 'data-testid': 'btn-release' }, releasing ? '放行中…' : '人工放行')
          : null
      )
      : null,

    h('div', { style: { flex: 1, display: 'flex', minHeight: 0 } },
      h('div', {
        ref: surfaceRef,
        onPointerDown: onSurfacePointerDown, onPointerMove, onPointerUp,
        'data-testid': 'canvas-surface',
        style: {
          position: 'relative', flex: 1, overflow: 'hidden',
          backgroundColor: TOKENS.bgSoft,
          backgroundImage: showGrid ? `radial-gradient(circle, ${TOKENS.border} 1px, transparent 1px)` : 'none',
          backgroundSize: '18px 18px',
        },
      },
        h('div', {
          style: {
            position: 'absolute', left: 0, top: 0,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0', width: maxX + 400, height: maxY + 400,
          },
        },
          h('svg', { width: maxX + 400, height: maxY + 400, style: { position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' } },
            h('defs', null, h('marker', { id: 'mx-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
              h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor', opacity: 0.45 }))),
            edges.map((e) => {
              const a = nodeById.get(e.from)
              const b = nodeById.get(e.to)
              if (!a || !b) return null
              return h('path', {
                key: e.id,
                d: edgePath(a, b),
                fill: 'none',
                stroke: 'var(--dsw-alias-label-primary, #71717a)',
                strokeWidth: e.kind === 'dependency' ? 1.6 : 1.2,
                strokeDasharray: e.kind === 'dependency' ? 'none' : '4 4',
                opacity: e.kind === 'dependency' ? 0.5 : 0.32,
                markerEnd: 'url(#mx-arrow)',
              })
            })
          ),
          nodes.map((n) => h(NodeCard, {
            key: n.id, node: n, selected: selected === n.id,
            findings: n.meta && n.meta.findings,
            summary: nodeSummary(n),
            editing: editingId === n.id,
            editingText,
            onEditText: setEditingText,
            onStartRename: () => startRename(n),
            onCommitRename: commitRename,
            onCancelRename: cancelRename,
            onPointerDown: onNodePointerDown(n),
            onClick: (e) => { e.stopPropagation(); selectNode(n.id) },
          }))
        ),
        h('div', {
          style: {
            position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap',
            padding: '6px 10px', borderRadius: 8, fontSize: 10.5, background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`, maxWidth: 'calc(100% - 24px)',
          },
        },
          Object.entries(NODE_TYPES).map(([k, v]) => h('span', { key: k, style: { display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0.8 } },
            h('span', { style: { color: v.accent } }, v.glyph), v.label))
        )
      ),
      h(Inspector, {
        project, node: selectedNode, toast,
        onClose: closeInspector,
        onSaved: onContentSaved,
        onTransition, onCheck,
        onDelete: onDeleteNode,
        onDirtyChange: setDirty,
        onRename: startRename,
        onSaveReady: handleSaveReady,
      })
    ),

    h('div', { style: { flex: '0 0 auto', height: 26, display: 'flex', alignItems: 'center', gap: 14, padding: '0 12px', fontSize: 11, opacity: 0.68, borderTop: `1px solid ${TOKENS.border}` } },
      h('span', null, `工位 ${nodes.length}`),
      h('span', null, `连线 ${edges.length}`),
      h('span', null, `rev ${rev}`),
      dirty ? h('span', { style: { color: TOKENS.warn, opacity: 1 } }, '● 正文未保存') : null,
      h('span', { style: { flex: 1 } }),
      h('span', null, `撤销 ${history.undo.length} / 重做 ${history.redo.length}`),
      h('span', null, '拖空白=平移 · 滚轮=缩放 · 双击标题=改名 · Cmd+Z=撤销')
    ),

    createOpen ? h(Modal, { title: '新建工位', onClose: () => setCreateOpen(false), width: 420, testid: 'modal-create-node' },
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
        Object.entries(NODE_TYPES).map(([k, v]) => h(Button, { key: k, 'data-testid': `btn-create-node-${k}`, onClick: () => onCreateNode(k) },
          h('span', { style: { color: v.accent, marginRight: 5 } }, v.glyph), v.label))
      )
    ) : null,

    genOpen ? h(GenerateModal, {
      project,
      onClose: () => setGenOpen(false),
      onStarted: (job) => {
        setGenOpen(false)
        setDrawerJob({ jobId: job.id })
        refreshActiveJobs()
      },
      toast,
    }) : null,

    jobsOpen ? h(JobListModal, {
      project,
      onClose: () => { setJobsOpen(false); refreshActiveJobs() },
      onOpenJob: (job) => { setJobsOpen(false); setDrawerJob({ jobId: job.id }); refreshActiveJobs() },
      toast, confirm,
    }) : null,

    shootOpen ? h(ShootabilityDrawer, {
      project,
      report: shootReport,
      loading: shootLoading,
      onReload: reloadShootReport,
      onClose: () => setShootOpen(false),
      toast, confirm,
    }) : null,

    importOpen ? h(ImportModal, {
      project, canvas,
      onClose: () => setImportOpen(false),
      onImported: () => { setImportOpen(false); onChanged && onChanged() },
      toast,
    }) : null,

    gateInfo ? h(Modal, {
      title: '可拍性闸门未通过',
      onClose: () => setGateInfo(null),
      width: 640,
      testid: 'modal-release-gate',
      footer: [
        h(Button, { key: 's', tone: 'primary', onClick: () => { setGateInfo(null); setShootOpen(true) }, 'data-testid': 'btn-gate-goto-signoff' }, '去可拍性页签收'),
        h(Button, {
          key: 'f', tone: 'danger', onClick: forceRelease, disabled: releasing,
          // 强制放行是例外路径：danger 只保留语义色，样式降级为描边，避免被当成主操作
          style: { background: 'transparent', color: TOKENS.error, border: `1px solid ${TOKENS.error}`, opacity: releasing ? 0.5 : 0.9 },
          'data-testid': 'btn-gate-force',
        }, releasing ? '处理中…' : '强制放行（需理由）'),
        h(Button, { key: 'c', onClick: () => setGateInfo(null) }, '取消'),
      ],
    },
      h('div', { style: { fontSize: 12.5, lineHeight: 1.8, marginBottom: 10 } },
        gateInfo.message),
      // 计数卡只放两项：待签收（合计，含改稿失效）与缺钩子；明细拆开列，不重复计数
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 10, fontSize: 11.5 } },
        [['待签收', gateNeeds], ['缺钩子', gateNoHook.length]].map(([k, v]) => h('div', {
          key: k, style: { padding: '8px 10px', borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` },
        },
          h('div', { style: { opacity: 0.6 } }, k),
          h('div', { className: 'moxi-serif', style: { fontSize: 20, fontWeight: 600, color: k === '待签收' && v > 0 ? TOKENS.error : undefined } }, v))
        )
      ),
      h('div', { style: { marginBottom: 10 } },
        gateEpLine('未签收', gateUnsignedOnly),
        gateEpLine('改稿失效', gateStale),
        gateEpLine('缺钩子', gateNoHook),
        (!gateUnsignedOnly.length && !gateStale.length && !gateNoHook.length)
          ? h('div', { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.7 } }, '闸门明细为空：可以直接重试放行。')
          : null
      ),
      h('div', { style: { fontSize: 11.5, opacity: 0.7, marginBottom: 6, lineHeight: 1.7 } },
        '正常路径：补齐后直接放行，不需要强制。若确需跳过（例如钩子由人工确认过），可填写理由强制放行；理由会写入审计事件。'),
      h('textarea', {
        value: forceReason, maxLength: 300,
        onChange: (ev) => setForceReason(ev.target.value),
        placeholder: '强制放行理由（必填，≤300 字）',
        'data-testid': 'input-force-reason',
        style: { width: '100%', minHeight: 64, padding: '8px 10px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' },
      })
    ) : null,

    exportDone ? h(Modal, {
      title: '导出完成',
      onClose: () => setExportDone(null),
      width: 620,
      testid: 'modal-export-done',
      footer: [
        h(Button, { key: 'r', onClick: async () => {
          try { await api.revealFile(exportDone.path); toast({ kind: 'success', text: '已在文件夹中定位' }) }
          catch (e) { toast({ kind: 'error', text: '定位失败：' + e.message }) }
        }, 'data-testid': 'btn-export-reveal' }, '在文件夹中显示'),
        h(Button, { key: 'd', onClick: async () => {
          try {
            const f = await api.readFile(exportDone.path)
            const bin = atob(f.base64)
            const arr = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
            const blob = new Blob([arr], { type: 'application/octet-stream' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = exportDone.path.split('/').pop()
            document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(a.href), 4000)
            toast({ kind: 'success', text: '已开始下载副本' })
          } catch (e) { toast({ kind: 'error', text: '下载失败：' + e.message }) }
        }, 'data-testid': 'btn-export-download' }, '下载副本'),
        h(Button, { key: 'c', onClick: async () => {
          const ok = await copyTextToClipboard(exportDone.path || '')
          toast({ kind: ok ? 'success' : 'error', text: ok ? '路径已复制' : '复制失败' })
        }, 'data-testid': 'btn-export-copy' }, '复制路径'),
        h(Button, { key: 'x', tone: 'primary', onClick: () => setExportDone(null) }, '完成'),
      ],
    },
      h('div', { style: { fontSize: 12.5, lineHeight: 1.8 } },
        h('div', null, `格式 ${String(exportDone.format || 'docx').toUpperCase()} · ${Math.round((exportDone.bytes || 0) / 1024)} KB · ${exportDone.sections || 0} 节`),
        exportDone.fallback ? h('div', { style: { color: TOKENS.warn } }, `降级说明：${exportDone.fallback.reason || 'docx 不可用'}`) : null,
        h('div', { style: { marginTop: 8, fontSize: 11.5, opacity: 0.7, fontFamily: TOKENS.mono, wordBreak: 'break-all' } }, exportDone.path || '')
      ),
      h('div', { style: { marginTop: 10, fontSize: 11.5, opacity: 0.7 } },
        '你可以把文件复制到任意位置：点「在文件夹中显示」在访达定位，或「下载副本」另存一份。')
    ) : null,

    exportConflictOpen ? h(Modal, {
      title: '有未保存正文',
      onClose: () => setExportConflictOpen(false),
      width: 580,
      testid: 'modal-export-conflict',
      footer: [
        h(Button, { key: 'c', onClick: () => setExportConflictOpen(false), 'data-testid': 'btn-export-choice-cancel' }, '取消'),
        h(Button, { key: 'd', onClick: exportDiskOnly, 'data-testid': 'btn-export-choice-disk' }, '仅导出当前磁盘版'),
        h(Button, { key: 's', tone: 'primary', onClick: exportSaveAndGo, 'data-testid': 'btn-export-choice-save' }, '保存并导出'),
      ],
    },
      h('div', { style: { fontSize: 13, lineHeight: 1.7 } },
        '当前节点的正文有未保存修改。导出 docx 读取的是磁盘上的内容，请先选择导出方式：'),
      h('div', { style: { marginTop: 10, display: 'grid', gap: 6, fontSize: 11.5, opacity: 0.82, lineHeight: 1.6 } },
        h('div', null, '· 保存并导出：先保存当前正文（写入磁盘），再导出'),
        h('div', null, '· 仅导出当前磁盘版：不保存本次修改，直接导出磁盘上的旧内容（本地编辑仍保留，可稍后再保存）'),
        h('div', null, '· 取消：回到画布继续编辑')
      )
    ) : null,

    drawerJob ? h(JobDrawer, {
      projectId: project.id,
      jobId: drawerJob.jobId,
      onClose: () => { setDrawerJob(null); refreshActiveJobs() },
      onJobChanged: onDrawerJobChanged,
      toast, confirm,
    }) : null
  )
}

/* ------------------------------------------------------------------ */
/* 根组件                                                              */
/* ------------------------------------------------------------------ */
export default function App() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null) // { project, canvas, rev }
  const [newOpen, setNewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmState, setConfirmState] = useState(null) // { opts, resolve }
  // 首页增强数据：统计（节点状态/集数/最近任务）+ 全部任务（用于「最近任务」与集范围）
  const [stats, setStats] = useState(null)
  const [allJobs, setAllJobs] = useState([])

  const showToast = useCallback((t) => {
    setToast(t)
    window.clearTimeout(showToast._timer)
    const duration = (t && Number(t.duration)) || 3000
    showToast._timer = window.setTimeout(() => setToast(null), duration)
  }, [])

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setConfirmState({ opts: opts || {}, resolve })
  }), [])
  const resolveConfirm = (result) => {
    setConfirmState((st) => {
      if (st && typeof st.resolve === 'function') st.resolve(result)
      return null
    })
  }

  const reloadProjects = useCallback(async () => {
    try {
      const rows = await api.listProjects()
      setProjects(rows)
      setError('')
    } catch (e) {
      setError('项目列表读取失败：' + e.message + '（已保留上次结果）')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reloadProjects() }, [reloadProjects])

  // 首页增强数据：拿不到就退回朴素卡片，不阻塞项目列表
  // 防重复：项目列表还没到（空列表）时不发；同一份项目快照（id+更新时间）只拉一次
  const overviewKeyRef = useRef('')
  const reloadOverview = useCallback(async (force = false) => {
    if (!projects.length) return
    const key = projects.map((p) => `${p.id}:${p.updatedAt || ''}`).join('|')
    if (!force && key === overviewKeyRef.current) return
    try {
      const [s, rows] = await Promise.all([api.stats(), api.listJobs()])
      setStats(s || null)
      setAllJobs(Array.isArray(rows) ? rows : [])
      overviewKeyRef.current = key
    } catch { /* 静默：增强信息缺失不影响列表 */ }
  }, [projects])
  const overviewSignature = projects.map((p) => `${p.id}:${p.updatedAt || ''}`).join('|')
  useEffect(() => {
    if (!current) reloadOverview()
  }, [current && current.project.id, overviewSignature, reloadOverview])

  const restoreLastRef = useRef(false)
  // 上次项目恢复失败时明确告知，而不是静默留在列表
  const restoreLastProject = useCallback(async () => {
    let last = null
    try { last = window.localStorage.getItem('moxi:lastProject') } catch { return }
    if (!last) return
    try {
      const r = await api.getProject(last)
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev })
    } catch {
      try { window.localStorage.removeItem('moxi:lastProject') } catch { /* ignore */ }
      showToast({ kind: 'error', text: '未找到上次打开的项目，请从列表选择', duration: 6000 })
    }
  }, [showToast])

  // 记住上次打开的项目
  useEffect(() => {
    if (current) {
      try { window.localStorage.setItem('moxi:lastProject', current.project.id) } catch { /* ignore */ }
      return
    }
    if (restoreLastRef.current) return
    restoreLastRef.current = true
    restoreLastProject()
  }, [current && current.project.id, restoreLastProject])

  const openProject = useCallback(async (projectId) => {
    try {
      const r = await api.getProject(projectId)
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev })
    } catch (e) {
      showToast({ kind: 'error', text: '打开失败：' + e.message })
    }
  }, [showToast])

  const refresh = useCallback(async () => {
    if (!current) return
    try {
      const r = await api.getProject(current.project.id)
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev })
    } catch { /* 静默失败，保留旧数据 */ }
  }, [current && current.project.id])

  // 轮询 rev：Agent 工具改了画布后 UI 能跟上
  useEffect(() => {
    if (!current) return undefined
    const t = window.setInterval(async () => {
      try {
        const r = await api.getRev(current.project.id)
        if (r.rev !== current.rev) await refresh()
      } catch { /* ignore */ }
    }, 2000)
    return () => window.clearInterval(t)
  }, [current && current.project.id, current && current.rev, refresh])

  const createProject = async (input) => {
    setBusy(true)
    try {
      const r = await api.createProject(input)
      setNewOpen(false)
      showToast({ kind: 'success', text: '项目已创建' })
      await reloadProjects()
      await openProject(r.project.id)
    } catch (e) {
      showToast({ kind: 'error', text: e.message })
    } finally { setBusy(false) }
  }

  const deleteProject = async (p) => {
    const ok = await confirm({
      title: '删除项目',
      message: `确认删除项目「${p.title}」？`,
      detail: '会移到磁盘回收站（.trash），可在磁盘上找回。此操作不可用撤销按钮恢复。',
      danger: true,
      confirmText: '删除到回收站',
    })
    if (!ok) return
    try {
      await api.deleteProject(p.id)
      showToast({ kind: 'success', text: '已移到回收站' })
      await reloadProjects()
    } catch (e) {
      showToast({ kind: 'error', text: '删除失败：' + e.message })
    }
  }

  return h('div', { className: 'moxi-app moxi-paper-bg', style: { height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'hidden', background: TOKENS.bg, color: TOKENS.text } },
    current
      ? h(CanvasView, {
        project: current.project, canvas: current.canvas, rev: current.rev,
        onBack: () => { try { window.localStorage.removeItem('moxi:lastProject') } catch { /* ignore */ } setCurrent(null); reloadProjects() },
        onChanged: refresh, toast: showToast, confirm,
      })
      : h(ProjectsView, {
        projects, loading, error, stats, jobs: allJobs,
        onCreate: () => setNewOpen(true),
        onOpen: openProject,
        onDelete: deleteProject,
        onRefresh: reloadProjects,
      }),
    newOpen ? h(NewProjectModal, { onClose: () => setNewOpen(false), onSubmit: createProject, busy }) : null,
    confirmState ? h(ConfirmModal, {
      ...confirmState.opts,
      onConfirm: () => resolveConfirm(true),
      onCancel: () => resolveConfirm(false),
    }) : null,
    h(Toast, { toast })
  )
}
