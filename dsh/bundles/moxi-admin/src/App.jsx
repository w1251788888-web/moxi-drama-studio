/**
 * moxi-admin · 5 页管理后台（S4 补全）
 * 数据源：moxi-core 的 /api/moxi/*（契约 docs/设计/前端接口契约.md）
 *
 * 数字纪律：页面上出现的计数一律来自接口原始返回值（/stats、/jobs/list、/admin/rules、
 * /llm/info 等），不在前端自算“近似值”；P1/P2 的节点/字数/集数只读 /stats。
 * 交互纪律：所有破坏性操作走自制 Confirm（不使用 window.confirm）；所有操作都有 Toast。
 */
import React from 'react'
import {
  h, TOKENS, Badge, JobBadge, JOB_ALERT_STATUS, Button, Input, Empty, Toast, Confirm, Field,
  fmtBytes, fmtTime, fmtNum, fmtDuration, statusLabel, jobStatusLabel,
} from './theme.js'

const { useState, useEffect, useCallback, useMemo, useRef } = React

async function post(path, body = {}) {
  const res = await fetch(`/api/moxi${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.ok !== true) {
    const e = new Error((json && json.error && json.error.message) || `HTTP ${res.status}`)
    e.code = json && json.error && json.error.code
    throw e
  }
  return json.value
}

/* 接口路径（全部为契约内既有路径，不新增） */
const EP = {
  stats: '/stats',
  projects: '/projects/list',
  jobs: '/jobs/list',
  export: '/export',
  projectDelete: '/project/delete',
  release: '/project/release',
  llmInfo: '/llm/info',
  llmProbe: '/llm/probe',
  rules: '/admin/rules',
  logs: '/admin/logs',
  legacyModels: '/admin/models',
}

function localNowIso() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const BTN_SM = { height: 26, padding: '0 8px', fontSize: 11 }
const LOG_OP_LABELS = {
  'node.transition': '节点流转',
  'content.save': '正文保存',
  'generate.episode': '分集生成',
  'check.run': '质检运行',
}
const LOG_OP_OPTIONS = [{ value: '全部', label: '全部操作' }].concat(
  Object.keys(LOG_OP_LABELS).map((op) => ({ value: op, label: LOG_OP_LABELS[op] }))
)
const opLabel = (op) => (op === '全部' ? '全部操作' : (LOG_OP_LABELS[op] || op))
const EXPORT_FORMATS = ['docx', 'md', 'txt']

/* 任务集范围：优先用后端 scope（{from,to,count,episodes,dense}），历史任务用 episodes 兜底。
   from/to 只是首末集号，polish 任务可能只含其中几集（例：第 1、6、8、10 集），不能直接写成「1–10 集」。 */
function jobScope(job) {
  const s = job && job.scope
  if (s && Array.isArray(s.episodes) && s.episodes.length) {
    const eps = [...new Set(s.episodes.map(Number))].sort((a, b) => a - b)
    return { episodes: eps, dense: !!s.dense }
  }
  const eps = [...new Set(((job && job.episodes) || []).map((e) => Number(e && e.ep)).filter((n) => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b)
  if (eps.length) return { episodes: eps, dense: eps.length === eps[eps.length - 1] - eps[0] + 1 }
  // 再兜底：只有首末集号的历史任务，用进度总数说明实际集数，避免又写成「1—10 集」
  const from = Number(job && job.from)
  const to = Number(job && job.to)
  if (Number.isInteger(from) && from > 0 && Number.isInteger(to) && to >= from) {
    const count = Number(job && job.progress && job.progress.total) || 0
    return { from, to, count: count > 0 ? count : to - from + 1 }
  }
  return null
}

/** 集范围文案：连续 →「第 1–10 集」；跳集 →「第 1、6、8、10 集（共 4 集）」 */
function fmtScope(scope, job) {
  // 补齐类任务没有集范围，直接说明任务性质，不留一个空破折号
  if (job && job.mode === 'ensure') return '概念/资产补齐'
  if (!scope) return '—'
  if (!scope.episodes) {
    const span = scope.to - scope.from + 1
    if (scope.count !== span) return `第 ${scope.from}–${scope.to} 集（共 ${scope.count} 集）`
    return `第 ${scope.from}–${scope.to} 集`
  }
  const eps = scope.episodes
  if (eps.length === 1) return `第 ${eps[0]} 集`
  if (scope.dense) return `第 ${eps[0]}–${eps[eps.length - 1]} 集`
  return `第 ${eps.join('、')} 集（共 ${eps.length} 集）`
}

/* ======================================================================== *
 * 通用小组件
 * ======================================================================== */
function Card({ title, value, hint, tone }) {
  return h('div', {
    style: {
      padding: '14px 16px', borderRadius: 10, background: TOKENS.bg,
      border: `1px solid ${TOKENS.border}`, boxShadow: '0 1px 3px rgba(0,0,0,.05)',
    },
  },
    h('div', { style: { fontSize: 11.5, opacity: 0.62, marginBottom: 6 } }, title),
    h('div', { style: { fontSize: 24, fontWeight: 700, color: tone || TOKENS.text, lineHeight: 1.1 } }, String(value)),
    hint ? h('div', { style: { fontSize: 11, opacity: 0.5, marginTop: 6 } }, hint) : null
  )
}

function Section({ title, extra, hint, children }) {
  return h('section', { style: { marginBottom: 22 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
      h('h2', { className: 'moxi-serif', style: { fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: '.02em' } }, title),
      hint ? h('span', { style: { fontSize: 11, color: TOKENS.labelSecondary } }, hint) : null,
      h('span', { style: { flex: 1 } }),
      extra || null
    ),
    children
  )
}

function Loading({ text = '加载中…' }) {
  return h('div', { style: { fontSize: 12, opacity: 0.6, padding: '10px 0' } }, text)
}

function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
      padding: '8px 12px', borderRadius: 8, fontSize: 12, color: TOKENS.danger,
      border: `1px solid ${TOKENS.danger}55`, background: `${TOKENS.danger}0f`,
    },
  },
    h('span', { style: { flex: 1 } }, '读取失败：' + error),
    onRetry ? h(Button, { onClick: onRetry }, '重试') : null
  )
}

function Table({ columns, rows, empty = '暂无数据' }) {
  if (!rows || rows.length === 0) return h(Empty, { text: empty })
  const head = h('thead', null,
    h('tr', null, columns.map((c) => h('th', {
      key: c.key,
      style: {
        textAlign: c.align || 'left', padding: '9px 12px', borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11, opacity: 0.6, fontWeight: 600, whiteSpace: 'nowrap',
      },
    }, c.title))))
  const body = h('tbody', null, rows.map((r, i) => h('tr', {
    key: r.id || r.seq || i,
    style: { borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${TOKENS.border}` },
  }, columns.map((c) => h('td', { key: c.key, style: { padding: '8px 12px', verticalAlign: 'top', fontSize: 12 } },
    c.render ? c.render(r) : String(r[c.key] ?? '')
  )))))
  return h('div', {
    style: { border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: 'auto', background: TOKENS.bg },
  }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } }, head, body))
}

function Select({ value, onChange, options, style, disabled }) {
  return h('select', {
    value, disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    style: {
      height: 28, padding: '0 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
      border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text,
      outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer', ...style,
    },
  }, options.map((o) => h('option', { key: o.value ?? o, value: o.value ?? o }, o.label ?? o)))
}

function Progress({ done = 0, total = 0, failed = 0 }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  // 补齐类任务（concept/assets）本来就没有集数：显示「—」，不要写成 0/0 集让人以为没跑
  if (!(total > 0)) {
    return h('div', { style: { minWidth: 110, fontSize: 11.5, opacity: 0.6 } },
      '—',
      failed > 0 ? h('span', { style: { color: TOKENS.danger, marginLeft: 8 } }, `失败 ${failed}`) : null
    )
  }
  return h('div', { style: { minWidth: 110 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 } },
      h('span', { style: { fontWeight: 600 } }, `${done}/${total} 集`),
      failed > 0 ? h('span', { style: { color: TOKENS.danger } }, `失败 ${failed}`) : null
    ),
    h('div', { style: { marginTop: 4, height: 5, borderRadius: 999, background: TOKENS.bgSoft, overflow: 'hidden' } },
      h('div', { style: { width: `${pct}%`, height: '100%', background: failed > 0 ? TOKENS.danger : TOKENS.info } })
    )
  )
}

function Mono({ children }) {
  return h('span', { style: { fontFamily: TOKENS.mono, fontSize: 11 } }, children)
}

/* ======================================================================== *
 * P1 工作台：KPI 全部来自 /stats + 最近生成任务（/jobs/list）
 * ======================================================================== */
function PageOverview({ stats, jobs, loading, errors, onRefresh, onGoJobs }) {
  const total = stats && stats.total
  const jobRows = (jobs || []).slice(0, 6)
  const alertCount = (jobs || []).filter((j) => JOB_ALERT_STATUS.has(j.status)).length
  const kpis = total ? [
    ['项目数', fmtNum(total.projects), '全部项目合计', null],
    ['节点数', fmtNum(total.nodes), '画布节点合计', null],
    ['已生成集数', fmtNum(total.episodes), '各项目已生成集数合计', null],
    ['总字数', fmtNum(total.words), '正文净字数（去空白）', null],
    ['待审节点', fmtNum(total.pending), '送审 + 打回', total.pending ? TOKENS.warn : null],
    ['已批准', fmtNum(total.approved), '已通过评审的节点', total.approved ? TOKENS.ok : null],
    ['阻塞', fmtNum(total.blocked), '被阻塞的节点', total.blocked ? TOKENS.danger : null],
    ['草稿', fmtNum(total.draft), '尚未送审的节点', null],
  ] : []

  return h('div', null,
    h(ErrorBox, { error: errors.stats, onRetry: onRefresh }),
    h(Section, {
      title: '运行概览',
    },
      loading.stats && !stats ? h(Loading) :
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 } },
          kpis.map(([title, value, hint, tone]) => h(Card, { key: title, title, value, hint, tone }))
        )
    ),

    h(Section, {
      title: `最近生成任务${alertCount ? `（异常 ${alertCount}）` : ''}`,
      hint: jobRows.length ? `最近 ${jobRows.length} 条` : '',
      extra: h(Button, { onClick: onGoJobs }, '查看全部任务 →'),
    },
      loading.jobs && !jobs ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'projectTitle', title: '项目', render: (r) => h('span', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, r.projectTitle) },
            { key: 'range', title: '集范围', render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, fmtScope(jobScope(r), r)) },
            { key: 'status', title: '状态', render: (r) => h(JobBadge, { status: r.status }) },
            { key: 'progress', title: '进度', render: (r) => h(Progress, { ...(r.progress || {}) }) },
            { key: 'model', title: '模型', render: (r) => h(Mono, null, `${r.provider}/${r.model}`) },
            { key: 'time', title: '开始时间', render: (r) => fmtTime(r.startedAt || r.createdAt) },
          ],
          rows: jobRows,
          empty: '暂无生成任务',
        })
    ),

    h(Section, { title: '项目统计', hint: '按项目汇总' },
      loading.stats && !stats ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'title', title: '项目', render: (r) => h('span', { style: { fontWeight: 600 } }, r.title) },
            { key: 'nodes', title: '节点', align: 'right', render: (r) => fmtNum(r.nodes) },
            { key: 'edges', title: '边', align: 'right', render: (r) => fmtNum(r.edges) },
            { key: 'episodeCount', title: '集数', align: 'right', render: (r) => (r.episodeCount == null ? '未确认' : r.episodeCount) },
            { key: 'episodes', title: '已生成集数', align: 'right', render: (r) => fmtNum(r.episodes) },
            { key: 'words', title: '字数', align: 'right', render: (r) => fmtNum(r.words) },
            { key: 'pending', title: '待审', align: 'right', render: (r) => fmtNum(r.pending) },
            { key: 'lastJob', title: '最近任务', render: (r) => (r.lastJob ? h(JobBadge, { status: r.lastJob.status }) : '—') },
            { key: 'rev', title: '画布版本', align: 'right', render: (r) => h(Mono, null, String(r.rev)) },
          ],
          rows: (stats && stats.projects) || [],
          empty: '还没有项目',
        })
    )
  )
}

/* ======================================================================== *
 * P2 项目：表格补 /stats 四列 + 打开画布 + 导出 docx + 删除项目
 * ======================================================================== */
function PageProjects({ projects, stats, loading, errors, busy, onRefresh, onOpenCanvas, onExport, onDelete, onRelease }) {
  const [q, setQ] = useState('')
  const statsMap = useMemo(() => {
    const map = {}
    for (const p of (stats && stats.projects) || []) map[p.id] = p
    return map
  }, [stats])
  const rows = useMemo(() => (projects || [])
    .filter((p) => !q || String(p.title).toLowerCase().includes(q.toLowerCase()))
    .map((p) => {
      const s = statsMap[p.id] || null
      return { ...p, nodes: s ? s.nodes : null, words: s ? s.words : null, episodes: s ? s.episodes : null, lastJob: s ? s.lastJob : null, byStatus: s ? s.byStatus : null }
    }), [projects, statsMap, q])

  return h('div', null,
    h(ErrorBox, { error: errors.projects, onRetry: onRefresh }),
    h(Section, {
      title: `项目（${rows.length}${q ? ` / ${(projects || []).length}` : ''}）`,
      hint: '节点、字数、已生成集数与最近任务为后端统计',
      extra: h(Input, { value: q, onChange: setQ, placeholder: '搜索项目名', style: { width: 170 } }),
    },
      loading.projects && !projects ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'title', title: '项目名', render: (r) => h('span', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, r.title) },
            { key: 'episodeCount', title: '集数', align: 'right', render: (r) => (r.episodeCount == null ? '未确认' : r.episodeCount) },
            { key: 'audience', title: '受众', render: (r) => r.audience || '—' },
            { key: 'nodes', title: '节点数', align: 'right', render: (r) => (r.nodes == null ? '—' : fmtNum(r.nodes)) },
            { key: 'words', title: '字数', align: 'right', render: (r) => (r.words == null ? '—' : fmtNum(r.words)) },
            { key: 'episodes', title: '已生成集数', align: 'right', render: (r) => (r.episodes == null ? '—' : fmtNum(r.episodes)) },
            {
              key: 'lastJob', title: '最近任务', render: (r) => (r.lastJob
                ? h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                  h(JobBadge, { status: r.lastJob.status }),
                  h(Mono, null, `${(r.lastJob.progress && r.lastJob.progress.done) || 0}/${(r.lastJob.progress && r.lastJob.progress.total) || 0} 集`))
                : '—'),
            },
            {
              key: 'review', title: '评审', render: (r) => {
                const st = r.reviewState
                if (st === 'released') return h(Badge, { tone: 'success' }, '已放行')
                if (st === 'generated') return h(Badge, { tone: 'warn' }, '待放行')
                if (st === 'has_errors') return h(Badge, { tone: 'danger' }, '有失败集')
                return h('span', { style: { opacity: 0.5 } }, '—')
              },
            },
            {
              key: 'act', title: '操作', render: (r) => h('div', { style: { display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' } },
                r.reviewState === 'generated'
                  ? h(Button, { style: BTN_SM, tone: 'primary', onClick: () => onRelease(r), disabled: !!busy[`release:${r.id}`], title: '人工放行：生成完成 ≠ 可交付' },
                    busy[`release:${r.id}`] ? '放行中…' : '放行')
                  : null,
                h(Button, { style: BTN_SM, onClick: () => onOpenCanvas(r), title: '在墨戏画布中打开该项目' }, '打开画布'),
                h(Button, { style: BTN_SM, onClick: () => onExport(r), disabled: !!busy[`export:${r.id}`], title: '按项目导出 docx' },
                  busy[`export:${r.id}`] ? '导出中…' : '导出 docx'),
                h(Button, { style: BTN_SM, tone: 'danger', onClick: () => onDelete(r), title: '删除前二次确认，移入回收站' }, '删除'))
            },
          ],
          rows,
          empty: '还没有项目（在「墨戏画布」中新建）',
        })
    )
  )
}

/* ======================================================================== *
 * P3 规则与技能：保持 + 重新扫描 loading / 空态
 * ======================================================================== */
function PageRules({ data, loading, scanning, error, onScan }) {
  const d = data || {}
  const rules = d.rules || []
  const pipeline = d.pipeline || null
  const skills = d.skills || []
  const steps = (pipeline && pipeline.steps) || []
  const hardGates = (pipeline && pipeline.hardGates) || []

  return h('div', null,
    h(ErrorBox, { error, onRetry: onScan }),
    h(Section, {
      title: '规则包扫描',
      hint: '只读扫描规则目录',
      extra: h(Button, { onClick: onScan, disabled: scanning || loading }, scanning || loading ? '扫描中…' : '重新扫描'),
    },
      loading && !data ? h(Loading, { text: '首次扫描规则包…' }) :
        h('div', null,
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 12 } },
            h(Card, { title: '规则文件数', value: fmtNum(d.count != null ? d.count : rules.length), hint: '后端扫描计数' }),
            h(Card, { title: '流水线步骤', value: fmtNum(steps.length), hint: '规则流水线定义' }),
            h(Card, { title: '硬门', value: fmtNum(hardGates.length), hint: hardGates.join(', ') || '无' }),
            h(Card, { title: '技能数', value: fmtNum(skills.length), hint: '扫描到的技能目录' }),
          ),
          h('div', { style: { fontSize: 11.5, opacity: 0.6, marginBottom: 10 } },
            '根目录：', h(Mono, null, d.root || '—'),
            steps.length ? h('span', null, ` · 流水线：${steps.length} 个步骤 · ${hardGates.length} 个硬门`) : null
          ),
          h(Table, {
            columns: [
              { key: 'path', title: '路径', render: (r) => h(Mono, null, r.path) },
              { key: 'title', title: '标题' },
              { key: 'words', title: '字数', align: 'right', render: (r) => fmtNum(r.words) },
            ],
            rows: rules,
            empty: '规则根目录为空：把规则包放回仓库根目录后点「重新扫描」',
          })
        )
    ),

    h(Section, { title: `技能（${skills.length}）` },
      loading && !data ? h(Loading, { text: '扫描技能目录…' }) :
        h(Table, {
          columns: [
            { key: 'name', title: '名称' },
            { key: 'dir', title: '目录', render: (r) => h(Mono, null, r.dir) },
            { key: 'files', title: '文件数', align: 'right' },
            { key: 'hasSkillMd', title: 'SKILL.md', render: (r) => (r.hasSkillMd ? '✓' : '—') },
          ],
          rows: skills,
          empty: '未扫描到技能目录',
        })
    )
  )
}

/* ======================================================================== *
 * P4 模型与用量：/llm/info 模型列表 + /llm/probe 实测延迟表 + 当前默认模型
 * ======================================================================== */
function PageModels({ llmInfo, legacy, jobs, probeRuns, probing, loading, error, onProbe, onRefresh }) {
  const models = (llmInfo && llmInfo.models) || []
  const latest = probeRuns[0] || null
  const defaultProvider = (llmInfo && llmInfo.provider) || (latest && latest.provider) || '—'
  const defaultModel = (latest && latest.model) || (jobs && jobs[0] && jobs[0].model) || '待探测'
  const usage = useMemo(() => {
    const acc = { calls: 0, inputTokens: 0, outputTokens: 0, jobs: (jobs || []).length }
    for (const j of jobs || []) {
      const u = j.usage || {}
      acc.calls += Number(u.calls) || 0
      acc.inputTokens += Number(u.inputTokens) || 0
      acc.outputTokens += Number(u.outputTokens) || 0
    }
    return acc
  }, [jobs])
  const legacyProviders = (legacy && legacy.providers) || []
  const legacyProbe = (legacy && legacy.probe) || []

  return h('div', null,
    h(ErrorBox, { error, onRetry: onRefresh }),
    h(Section, { title: '模型概览', hint: '模型信息与探测结果' },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px,1fr))', gap: 12 } },
        h(Card, { title: '当前服务商', value: defaultProvider, hint: '模型清单返回的默认服务商' }),
        h(Card, { title: '当前默认模型', value: defaultModel, hint: latest ? '最近一次探测实测' : '取最近任务所用模型，可点探测器实测' }),
        h(Card, { title: '可选模型数', value: fmtNum(models.length), hint: '模型清单条数' }),
        h(Card, { title: '最近探测延迟', value: latest ? `${latest.ms} ms` : '—', hint: latest ? `${latest.provider}/${latest.model}` : '尚未探测' }),
      )
    ),

    h(Section, {
      title: `模型列表（${models.length}）`,
      hint: '只读，不在后台修改',
    },
      loading.llmInfo && !llmInfo ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'id', title: '模型 ID', render: (r) => h(Mono, null, r.id) },
            { key: 'name', title: '显示名' },
            { key: 'target', title: '归属', render: (r) => (r.id === defaultModel ? '当前默认' : '可选') },
          ],
          rows: models,
          empty: '未读取到模型列表',
        })
    ),

    h(Section, {
      title: `链路探测器（本次会话 ${probeRuns.length} 次实测）`,
      hint: '逐次实测，延迟为后端毫秒数',
      extra: h(Button, { onClick: onProbe, disabled: probing, tone: 'primary' }, probing ? '探测中…' : '开始探测'),
    },
      h(Table, {
        columns: [
          { key: 'ts', title: '时间', render: (r) => fmtTime(r.ts) },
          { key: 'provider', title: '服务商', render: (r) => (r.provider ? h(Mono, null, r.provider) : '—') },
          { key: 'model', title: '模型', render: (r) => (r.model ? h(Mono, null, r.model) : '—') },
          { key: 'ms', title: '延迟(ms)', align: 'right', render: (r) => (r.ok === false ? '—' : fmtNum(r.ms)) },
          { key: 'ok', title: '结果', render: (r) => (r.ok === false
            ? h('span', { style: { color: TOKENS.danger } }, '失败')
            : h('span', { style: { color: TOKENS.ok } }, '通')) },
          { key: 'chars', title: '字符数', align: 'right', render: (r) => fmtNum(r.chars) },
          { key: 'sample', title: '返回样例', render: (r) => h(Mono, null, String(r.sample || '').slice(0, 60)) },
        ],
        rows: probeRuns,
        empty: '点击上方「开始探测」实测当前默认模型的链路延迟',
      })
    ),

    h(Section, {
      title: '用量（生成任务合计）',
      hint: `按 ${usage.jobs} 个生成任务合计`,
    },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px,1fr))', gap: 12 } },
        h(Card, { title: 'LLM 调用次数', value: fmtNum(usage.calls), hint: '各任务调用次数合计' }),
        h(Card, { title: '输入 tokens', value: fmtNum(usage.inputTokens), hint: '各任务输入消耗合计' }),
        h(Card, { title: '输出 tokens', value: fmtNum(usage.outputTokens), hint: '各任务输出消耗合计' }),
      )
    ),

    h(Section, { title: `服务商全量清单（${legacyProviders.length}）`, hint: '只读清单，不在后台修改' },
      loading.legacy && !legacy ? h(Loading) :
        h('div', { style: { display: 'grid', gap: 10 } },
          legacyProviders.map((p) => h('div', { key: p.provider, style: { padding: '10px 12px', borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg } },
            h('div', { style: { fontSize: 12.5, fontWeight: 650, marginBottom: 6 } }, p.provider),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              (p.models || []).map((m) => h('span', { key: m, style: { fontSize: 11, padding: '2px 8px', borderRadius: 999, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontFamily: TOKENS.mono } }, m)))
          )),
          legacyProviders.length === 0 ? h(Empty, { text: '未读取到服务商清单' }) : null,
          legacyProbe.length ? h('div', null,
            h('div', { style: { fontSize: 11.5, opacity: 0.6, margin: '12px 0 8px' } },
              `历史探测快照（非本次实测）`),
            h(Table, {
              columns: [
                { key: 'provider', title: '服务商', render: (r) => h(Mono, null, r.provider) },
                { key: 'model', title: '模型', render: (r) => h(Mono, null, r.model) },
                { key: 'http_status', title: 'HTTP 状态', align: 'right' },
                { key: 'latency_ms', title: '延迟(ms)', align: 'right' },
                { key: 'verdict', title: '判定' },
              ],
              rows: legacyProbe,
              empty: '暂无历史探测记录',
            })) : null
        )
    )
  )
}

/* ======================================================================== *
 * P5 日志与导出：op 过滤 + 范围导出 + 生成任务表（取消带 Confirm）
 * ======================================================================== */
function PageLogs({ logs, jobs, projects, loading, errors, busy, onRefresh, onCancelJob, onExportRange }) {
  const [op, setOp] = useState('全部')
  const [form, setForm] = useState({ projectId: '', from: '', to: '', format: 'docx' })
  const filtered = useMemo(() => (logs || []).filter((r) => op === '全部' || r.op === op), [logs, op])
  const set = (patch) => setForm((s) => ({ ...s, ...patch }))
  const rangeBusy = !!busy['export:range']
  const jobBusy = (j) => !!busy[`cancel:${j.id}`]

  const submitExport = () => {
    if (!form.projectId) return onExportRange({ ...form, error: '请先选择项目' })
    onExportRange(form)
  }

  return h('div', null,
    h(ErrorBox, { error: errors.jobs || errors.logs || errors.projects, onRetry: onRefresh }),

    h(Section, {
      title: `生成任务（${(jobs || []).length}）`,
      hint: '取消任务需二次确认',
    },
      loading.jobs && !jobs ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'id', title: '任务', render: (r) => h(Mono, null, String(r.id).replace(/^job_/, '').slice(0, 10) + '…') },
            { key: 'projectTitle', title: '项目', render: (r) => h('span', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, r.projectTitle) },
            { key: 'range', title: '集范围', render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, fmtScope(jobScope(r), r)) },
            { key: 'status', title: '状态', render: (r) => h(JobBadge, { status: r.status }) },
            { key: 'progress', title: '进度', render: (r) => h(Progress, { ...(r.progress || {}) }) },
            { key: 'duration', title: '耗时', render: (r) => h('span', { style: { whiteSpace: 'nowrap' } }, fmtDuration(r.startedAt || r.createdAt, r.finishedAt)) },
            { key: 'model', title: '模型', render: (r) => h('span', { whiteSpace: 'nowrap', title: `${r.provider}/${r.model}` }, h(Mono, null, r.model)) },
            {
              key: 'act', title: '操作', render: (r) => h(Button, {
                tone: 'danger',
                onClick: () => onCancelJob(r),
                disabled: !['queued', 'running'].includes(r.status) || jobBusy(r),
                title: ['queued', 'running'].includes(r.status) ? '取消任务（需确认）' : '任务已结束，无需取消',
              }, jobBusy(r) ? '取消中…' : '取消')
            },
          ],
          rows: jobs || [],
          empty: '暂无生成任务',
        })
    ),

    h(Section, { title: '导出（按项目 · 集范围）', hint: '按项目导出；填了集范围就只导出该范围' },
      h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 14px', border: `1px solid ${TOKENS.border}`, borderRadius: 10, background: TOKENS.bg } },
        h(Field, { label: '项目', width: 220 },
          h(Select, {
            value: form.projectId,
            onChange: (v) => set({ projectId: v }),
            options: [{ value: '', label: '请选择项目…' }].concat((projects || []).map((p) => ({ value: p.id, label: p.title }))),
            style: { width: '100%' },
          })),
        h(Field, { label: '起始集', width: 110 },
          h(Input, { value: form.from, type: 'number', min: 1, onChange: (v) => set({ from: v }), placeholder: '1' })),
        h(Field, { label: '结束集', width: 110 },
          h(Input, { value: form.to, type: 'number', min: 1, onChange: (v) => set({ to: v }), placeholder: '留空=起始集' })),
        h(Field, { label: '格式', width: 100 },
          h(Select, { value: form.format, onChange: (v) => set({ format: v }), options: EXPORT_FORMATS })),
        h(Button, { tone: 'primary', onClick: submitExport, disabled: rangeBusy }, rangeBusy ? '导出中…' : '导出'),
        h('span', { style: { fontSize: 11, color: TOKENS.labelSecondary, paddingBottom: 6 } }, '集范围留空 = 整部项目')
      )
    ),

    h(Section, {
      title: `审计日志（${filtered.length}/${(logs || []).length}）`,
      hint: '最近 300 条',
      extra: h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { style: { fontSize: 11, color: TOKENS.labelSecondary } }, '操作类型'),
        h(Select, { value: op, onChange: setOp, options: LOG_OP_OPTIONS })),
    },
      loading.logs && !logs ? h(Loading) :
        h(Table, {
          columns: [
            { key: 'ts', title: '时间', render: (r) => fmtTime(r.ts) },
            { key: 'projectTitle', title: '项目' },
            { key: 'actor', title: '操作人' },
            { key: 'op', title: '操作', render: (r) => opLabel(r.op) },
            { key: 'nodeId', title: '节点', render: (r) => (r.nodeId ? h(Mono, null, String(r.nodeId).slice(0, 12) + '…') : '—') },
            { key: 'seq', title: '序号', align: 'right' },
          ],
          rows: filtered,
          empty: op === '全部' ? '还没有审计事件' : `「${opLabel(op)}」暂无日志`,
        })
    )
  )
}

/* ======================================================================== *
 * 根组件：数据加载 / Tab / Toast / Confirm
 * ======================================================================== */
const TABS = [
  { id: 'overview', label: '工作台', icon: '▤' },
  { id: 'projects', label: '项目', icon: '▦' },
  { id: 'rules', label: '规则与技能', icon: '⚙' },
  { id: 'models', label: '模型与用量', icon: '◈' },
  { id: 'logs', label: '日志与导出', icon: '☰' },
]

const TAB_HINT = {
  overview: '数据自动刷新，数字来自后端统计',
  projects: '节点、字数与已生成集数为后端统计',
  rules: '只读扫描规则与技能目录',
  models: '模型信息与链路探测（只读）',
  logs: '任务、日志与导出',
}

export default function App() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState({ stats: null, projects: null, jobs: null, rules: null, logs: null, llmInfo: null, legacy: null })
  const [loading, setLoading] = useState({})
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [confirmSpec, setConfirmSpec] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [busy, setBusy] = useState({})
  const [probeRuns, setProbeRuns] = useState([])
  const [probing, setProbing] = useState(false)
  const toastTimer = useRef(null)

  const showToast = useCallback((t) => {
    setToast(t)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), (t && t.duration) || 3200)
  }, [])
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current) }, [])

  const setLoad = (key, val) => setLoading((s) => ({ ...s, [key]: val }))
  const setErr = (key, val) => setErrors((s) => ({ ...s, [key]: val }))
  const setKey = (key, val) => setData((s) => ({ ...s, [key]: val }))
  const markBusy = (key, val) => setBusy((s) => ({ ...s, [key]: val }))

  const load = useCallback(async (key, path, body) => {
    setLoad(key, true)
    try {
      const value = await post(path, body || {})
      setKey(key, value)
      setErr(key, '')
      return value
    } catch (e) {
      setErr(key, e.message)
      return null
    } finally {
      setLoad(key, false)
    }
  }, [])

  const loadStats = useCallback(() => load('stats', EP.stats), [load])
  const loadProjects = useCallback(() => load('projects', EP.projects), [load])
  const loadJobs = useCallback(() => load('jobs', EP.jobs), [load])
  const loadRules = useCallback(() => load('rules', EP.rules), [load])
  const loadLogs = useCallback(() => load('logs', EP.logs, { limit: 300 }), [load])
  const loadLlmInfo = useCallback(() => load('llmInfo', EP.llmInfo), [load])
  const loadLegacy = useCallback(() => load('legacy', EP.legacyModels), [load])

  /* 进入 Tab 时拉取该页所需数据（全部为已加载过则刷新，保证数字新鲜） */
  useEffect(() => {
    if (tab === 'overview') { loadStats(); loadJobs(); loadProjects() }
    else if (tab === 'projects') { loadProjects(); loadStats(); loadJobs() }
    else if (tab === 'rules') { loadRules() }
    else if (tab === 'models') { loadLlmInfo(); loadLegacy() }
    else if (tab === 'logs') { loadLogs(); loadJobs(); loadProjects() }
  }, [tab, loadStats, loadJobs, loadProjects, loadRules, loadLlmInfo, loadLegacy, loadLogs])

  const refreshCurrent = useCallback(() => {
    if (tab === 'overview') { loadStats(); loadJobs(); loadProjects() }
    else if (tab === 'projects') { loadProjects(); loadStats(); loadJobs() }
    else if (tab === 'rules') loadRules()
    else if (tab === 'models') { loadLlmInfo(); loadLegacy() }
    else if (tab === 'logs') { loadLogs(); loadJobs(); loadProjects() }
  }, [tab, loadStats, loadJobs, loadProjects, loadRules, loadLlmInfo, loadLegacy, loadLogs])

  /* -------- Confirm（统一破坏性操作入口） -------- */
  const openConfirm = useCallback((spec) => setConfirmSpec({ tone: 'default', confirmText: '确认', ...spec }), [])
  const runConfirm = useCallback(async () => {
    if (!confirmSpec || confirmBusy) return
    setConfirmBusy(true)
    try {
      await confirmSpec.onConfirm()
      setConfirmSpec(null)
    } catch (e) {
      showToast({ kind: 'error', text: '操作失败：' + (e && e.message ? e.message : e) })
    } finally {
      setConfirmBusy(false)
    }
  }, [confirmSpec, confirmBusy, showToast])

  /* -------- 操作：打开画布 / 导出 / 删除 / 取消任务 / 探测 -------- */
  const statsMap = useMemo(() => {
    const map = {}
    for (const p of (data.stats && data.stats.projects) || []) map[p.id] = p
    return map
  }, [data.stats])

  const onOpenCanvas = useCallback((project) => {
    try { window.localStorage.setItem('moxi:lastProject', project.id) } catch { /* ignore */ }
    showToast({ kind: 'success', text: `已定位项目「${project.title}」→ 点左侧「墨戏画布」打开` })
  }, [showToast])

  const exportOne = useCallback(async (project, opts = {}) => {
    const key = `export:${project.id}`
    if (busy[key]) return
    markBusy(key, true)
    try {
      const payload = { projectId: project.id, format: opts.format || 'docx' }
      if (opts.range && opts.range.from) payload.range = opts.range
      const r = await post(EP.export, payload)
      const kb = `${Math.max(1, Math.round((Number(r.bytes) || 0) / 1024))} KB`
      if (r.fallback) {
        showToast({
          kind: 'warn',
          text: `docx 不可用，已降级 ${r.format} · ${r.path} · ${kb}（${String(r.fallback.reason || '').slice(0, 70)}）`,
          duration: 6000,
        })
      } else {
        showToast({ kind: 'success', text: `已导出 ${r.format} · ${r.path} · ${kb} · ${r.sections} 节`, duration: 6000 })
      }
    } catch (e) {
      showToast({ kind: 'error', text: '导出失败：' + e.message })
    } finally {
      markBusy(key, false)
    }
  }, [busy, showToast])

  const onExportRange = useCallback(async (form) => {
    if (form && form.error) { showToast({ kind: 'error', text: form.error }); return }
    const from = Number(form.from)
    const to = Number(form.to)
    if (Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0 && to < from) {
      showToast({ kind: 'error', text: `集范围不合法：结束集（${to}）早于起始集（${from}）` })
      return
    }
    const project = (data.projects || []).find((p) => p.id === form.projectId) || { id: form.projectId, title: form.projectId }
    const range = Number.isFinite(from) && from > 0
      ? { from, to: Number.isFinite(to) && to > 0 ? to : from }
      : null
    await exportOne(project, { format: form.format, range })
  }, [data.projects, exportOne, showToast])

  const onDeleteProject = useCallback((project) => {
    const s = statsMap[project.id] || {}
    openConfirm({
      tone: 'danger',
      title: '删除项目',
      confirmText: '删除项目',
      message: `确认删除项目「${project.title}」？\n\n节点数：${s.nodes == null ? '—' : s.nodes} · 字数：${s.words == null ? '—' : s.words} · 已生成：${s.episodes == null ? '—' : s.episodes} 集\n\n项目会移入工作区回收站，可从磁盘上找回。`,
      onConfirm: async () => {
        const r = await post(EP.projectDelete, { projectId: project.id })
        showToast({ kind: 'success', text: `已删除「${project.title}」→ ${r.trashPath}`, duration: 5000 })
        loadProjects(); loadStats(); loadJobs()
      },
    })
  }, [openConfirm, statsMap, showToast, loadProjects, loadStats, loadJobs])

  const releaseProject = useCallback((project) => {
    const key = `release:${project.id}`
    openConfirm({
      tone: 'primary',
      title: '人工放行',
      confirmText: '确认放行',
      message: `确认放行项目「${project.title}」？\n\n含义：你已通读/抽查剧本，确认可以作为交付稿。放行后交付节点转为「已批准」，并记录放行时间。`,
      onConfirm: async () => {
        markBusy(key, true)
        try {
          const r = await post(EP.release, { projectId: project.id })
          const st = r.deliveryStatus ? statusLabel(r.deliveryStatus) : '已批准'
          showToast({ kind: 'success', text: `已放行「${project.title}」· 交付节点${st}` })
          loadProjects(); loadStats()
        } finally {
          markBusy(key, false)
        }
      },
    })
  }, [openConfirm, showToast, loadProjects, loadStats, markBusy])

  const onCancelJob = useCallback((job) => {
    if (!job || !['queued', 'running'].includes(job.status)) {
      showToast({ kind: 'info', text: '任务已结束，无需取消' })
      return
    }
    const p = job.progress || {}
    const scopeText = fmtScope(jobScope(job), job)
    openConfirm({
      tone: 'danger',
      title: '取消生成任务',
      confirmText: '取消任务',
      message: `确认取消任务 ${job.id}？\n\n项目：${job.projectTitle}\n集范围：${scopeText}\n进度：${p.done || 0}/${p.total || 0} 集（失败 ${p.failed || 0} 集）\n\n已生成的集与正文会保留，可稍后续跑。`,
      onConfirm: async () => {
        const r = await post('/jobs/cancel', { jobId: job.id })
        showToast({ kind: 'success', text: `已取消任务 ${r.id}（${jobStatusLabel(r.status)}）` })
        loadJobs(); loadStats()
      },
    })
  }, [openConfirm, showToast, loadJobs, loadStats])

  const runProbe = useCallback(async () => {
    if (probing) return
    setProbing(true)
    try {
      const r = await post(EP.llmProbe, { maxTokens: 16, user: 'ping', system: '只回复 pong 四个字母。' })
      const row = { ...r, ts: localNowIso() }
      setProbeRuns((rs) => [row, ...rs].slice(0, 20))
      showToast({ kind: 'success', text: `探测成功 · ${r.provider}/${r.model} · ${r.ms} ms · ${r.chars} 字符` })
    } catch (e) {
      setProbeRuns((rs) => [{ ts: localNowIso(), ok: false, provider: (data.llmInfo && data.llmInfo.provider) || '', model: '', ms: null, chars: 0, sample: e.message }, ...rs].slice(0, 20))
      showToast({ kind: 'error', text: '探测失败：' + e.message, duration: 5000 })
    } finally {
      setProbing(false)
    }
  }, [probing, showToast, data.llmInfo])

  const scanRules = useCallback(() => loadRules(), [loadRules])

  const pages = {
    overview: h(PageOverview, {
      stats: data.stats, jobs: data.jobs, loading, errors,
      onRefresh: refreshCurrent, onGoJobs: () => setTab('logs'),
    }),
    projects: h(PageProjects, {
      projects: data.projects, stats: data.stats, loading, errors, busy,
      onRefresh: refreshCurrent, onOpenCanvas, onExport: exportOne, onDelete: onDeleteProject, onRelease: releaseProject,
    }),
    rules: h(PageRules, {
      data: data.rules, loading: !!loading.rules, scanning: !!loading.rules,
      error: errors.rules, onScan: scanRules,
    }),
    models: h(PageModels, {
      llmInfo: data.llmInfo, legacy: data.legacy, jobs: data.jobs, probeRuns, probing,
      loading, error: errors.llmInfo || errors.legacy, onProbe: runProbe, onRefresh: refreshCurrent,
    }),
    logs: h(PageLogs, {
      logs: data.logs, jobs: data.jobs, projects: data.projects, loading, errors, busy,
      onRefresh: refreshCurrent, onCancelJob, onExportRange,
    }),
  }

  const title = (TABS.find((t) => t.id === tab) || {}).label
  // 统计时间只在真正拉过统计数据的页展示（工作台 / 项目），避免别的页挂着旧时间
  const statsTime = (tab === 'overview' || tab === 'projects') && data.stats && data.stats.generatedAt
    ? `统计时间 ${fmtTime(data.stats.generatedAt)}` : ''
  const tabLoading = tab === 'overview' ? !!(loading.stats || loading.jobs || loading.projects)
    : tab === 'projects' ? !!(loading.projects || loading.stats || loading.jobs)
    : tab === 'rules' ? !!loading.rules
    : tab === 'models' ? !!(loading.llmInfo || loading.legacy)
    : !!(loading.logs || loading.jobs || loading.projects)

  return h('div', {
    className: 'moxi-app moxi-paper-bg',
    style: {
      height: '100%', width: '100%', display: 'flex', boxSizing: 'border-box',
      background: TOKENS.bg, color: TOKENS.text,
    },
  },
    /* 左侧导航 */
    h('div', {
      style: {
        width: 176, flex: '0 0 176px', borderRight: `1px solid ${TOKENS.border}`,
        padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2,
      },
    },
      h('div', { style: { fontSize: 11, opacity: 0.55, padding: '0 8px 8px' } }, '墨戏后台'),
      TABS.map((t) => h('button', {
        key: t.id,
        onClick: () => setTab(t.id),
        style: {
          display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px',
          borderRadius: 7, border: 0, cursor: 'pointer', fontSize: 12.5, textAlign: 'left',
          background: tab === t.id ? TOKENS.bgSoft : 'transparent',
          color: TOKENS.text, fontWeight: tab === t.id ? 650 : 400,
        },
      },
        h('span', { style: { opacity: 0.7, width: 16 } }, t.icon), t.label))
    ),
    /* 内容区 */
    h('div', { style: { flex: 1, overflow: 'auto', padding: '20px 24px', minWidth: 0 } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18, flexWrap: 'wrap' } },
        h('h1', { style: { fontSize: 17, fontWeight: 680, margin: 0 } }, title),
        h('span', { style: { fontSize: 11, opacity: 0.5 } }, TAB_HINT[tab] || ''),
        h('span', { style: { flex: 1 } }),
        statsTime ? h('span', { style: { fontSize: 11, opacity: 0.5 } }, statsTime) : null,
        h(Button, { onClick: refreshCurrent, disabled: tabLoading }, '刷新')
      ),
      pages[tab]
    ),
    h(Toast, { toast }),
    h(Confirm, {
      open: !!confirmSpec,
      title: confirmSpec && confirmSpec.title,
      message: confirmSpec && confirmSpec.message,
      confirmText: confirmSpec && confirmSpec.confirmText,
      tone: confirmSpec && confirmSpec.tone,
      busy: confirmBusy,
      onCancel: () => { if (!confirmBusy) setConfirmSpec(null) },
      onConfirm: runConfirm,
    })
  )
}
