/**
 * moxi-canvas · 共享设计原语（节点类型色板、状态、按钮、输入框）
 * 样式只用 DSH 主题 token（--dsw-alias-*），字面色仅用于类型色/数据可视化。
 */
import React from 'react'

export const h = React.createElement

export const NODE_TYPES = {
  project_root: { label: '项目根', glyph: '◆', accent: '#8b5cf6' },
  settings: { label: '设定集', glyph: '▤', accent: '#0ea5e9' },
  asset: { label: '资产', glyph: '◈', accent: '#14b8a6' },
  beat_sheet: { label: '分集节拍', glyph: '▦', accent: '#f59e0b' },
  scene_list: { label: '分场表', glyph: '☰', accent: '#eab308' },
  script_scene: { label: '剧本场次', glyph: '✎', accent: '#ef4444' },
  quality: { label: '质检', glyph: '✓', accent: '#22c55e' },
  compliance: { label: '合规', glyph: '⚖', accent: '#6366f1' },
  delivery: { label: '分镜·导出', glyph: '⤓', accent: '#ec4899' },
}

export const STATUS_META = {
  draft: { label: '草稿', color: '#94a3b8' },
  generating: { label: '生成中', color: '#3b82f6' },
  review: { label: '待审', color: '#f59e0b' },
  rejected: { label: '打回', color: '#ef4444' },
  approved: { label: '已批准', color: '#22c55e' },
  blocked: { label: '阻塞', color: '#a1a1aa' },
}

export const TRANSITION_LABEL = {
  generating: '开始生成',
  review: '送审',
  approved: '通过',
  rejected: '打回',
  draft: '退回草稿',
  blocked: '置为阻塞',
}

export const TOKENS = {
  border: 'var(--dsw-alias-border-l1, rgba(127,127,127,.25))',
  bg: 'var(--dsw-alias-bg-layer-1, #fff)',
  bgSoft: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))',
  text: 'var(--dsw-alias-label-primary, #18181b)',
  labelSecondary: 'var(--dsw-alias-label-secondary, rgba(24,24,27,.62))',
  brand: 'var(--dsw-alias-brand-primary, #247bbf)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  // 状态语义色（数据/状态可视化允许字面色；随主题不变，暗色下对比度足够）
  ok: '#22c55e', info: '#3b82f6', warn: '#f59e0b', danger: '#ef4444', muted: '#94a3b8',
}

/** 生成任务状态（契约 §2 Job.status） */
export const JOB_STATUS_META = {
  queued: { label: '排队中', color: TOKENS.muted },
  running: { label: '生成中', color: TOKENS.info },
  done: { label: '已完成', color: TOKENS.ok },
  done_with_errors: { label: '部分失败', color: TOKENS.danger },
  cancelled: { label: '已取消', color: TOKENS.danger },
  failed: { label: '失败', color: TOKENS.danger },
}

/** 异常任务状态：展示为红色（P1 最近生成任务） */
export const JOB_ALERT_STATUS = new Set(['done_with_errors', 'cancelled', 'failed'])

export function JobBadge({ status }) {
  const meta = JOB_STATUS_META[status] || { label: status || '未知', color: TOKENS.muted }
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10.5, lineHeight: '16px', padding: '0 7px', borderRadius: 999,
      color: meta.color, border: `1px solid ${meta.color}55`,
      background: `${meta.color}14`, whiteSpace: 'nowrap',
    },
  }, h('span', { style: { width: 5, height: 5, borderRadius: 999, background: meta.color } }), meta.label)
}

export function fmtBytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(2)} MB`
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${v} B`
}

export function fmtTime(iso) {
  if (!iso) return '—'
  return String(iso).slice(0, 19).replace('T', ' ')
}

export function fmtNum(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('zh-CN') : '—'
}

/** 耗时：start→end（end 为空表示仍在跑，用 now） */
export function fmtDuration(startIso, endIso) {
  if (!startIso) return '—'
  const a = Date.parse(startIso)
  const b = endIso ? Date.parse(endIso) : Date.now()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—'
  const s = Math.round((b - a) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function Badge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10.5, lineHeight: '16px', padding: '0 7px', borderRadius: 999,
      color: meta.color, border: `1px solid ${meta.color}55`,
      background: `${meta.color}14`, whiteSpace: 'nowrap',
    },
  }, h('span', { style: { width: 5, height: 5, borderRadius: 999, background: meta.color } }), meta.label)
}

export function Button({ children, onClick, tone = 'default', disabled, title, style }) {
  const tones = {
    default: { color: TOKENS.text, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` },
    primary: { color: '#fff', background: TOKENS.brand, border: `1px solid ${TOKENS.brand}` },
    danger: { color: '#fff', background: '#dc2626', border: '1px solid #dc2626' },
    ghost: { color: TOKENS.text, background: 'transparent', border: '1px solid transparent' },
  }
  return h('button', {
    onClick, disabled, title,
    style: {
      height: 28, padding: '0 10px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...tones[tone], ...style,
    },
  }, children)
}

export function Input({ value, onChange, placeholder, style, onEnter, type = 'text', min, max, disabled }) {
  return h('input', {
    value: value ?? '', placeholder, type, min, max, disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    onKeyDown: (e) => { if (e.key === 'Enter' && onEnter) onEnter() },
    style: {
      height: 28, padding: '0 9px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
      border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text,
      outline: 'none', ...style,
    },
  })
}

export function Modal({ title, children, onClose, footer, width = 520 }) {
  return h('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 2000, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.32)',
    },
    onClick: onClose,
  },
    h('div', {
      onClick: (e) => e.stopPropagation(),
      style: {
        width, maxWidth: '90vw', maxHeight: '86vh', overflow: 'auto',
        background: TOKENS.bg, color: TOKENS.text, borderRadius: 12,
        border: `1px solid ${TOKENS.border}`, boxShadow: '0 20px 60px rgba(0,0,0,.28)',
      },
    },
      h('div', { style: { padding: '14px 16px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center' } },
        h('div', { style: { flex: 1, fontSize: 14, fontWeight: 650 } }, title),
        h('button', { onClick: onClose, style: { border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, opacity: 0.6 } }, '×')
      ),
      h('div', { style: { padding: 16 } }, children),
      footer ? h('div', { style: { padding: '10px 16px', borderTop: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 } }, footer) : null
    )
  )
}

export function Empty({ text, action }) {
  return h('div', {
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', minHeight: 240, opacity: 0.75 },
  },
    h('div', { style: { fontSize: 13 } }, text),
    action || null
  )
}

export function Toast({ toast }) {
  if (!toast) return null
  const color = toast.kind === 'error' ? '#dc2626'
    : toast.kind === 'success' ? '#16a34a'
    : toast.kind === 'warn' ? '#d97706'
    : '#3b82f6'
  return h('div', {
    style: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
      padding: '9px 16px', borderRadius: 8, fontSize: 12.5, color: '#fff', background: color,
      boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    },
  }, toast.text)
}

/** 自制确认弹窗（破坏性操作统一入口；不使用 window.confirm） */
export function Confirm({ open, title, message, confirmText = '确认', cancelText = '取消', tone = 'default', busy = false, onCancel, onConfirm }) {
  if (!open) return null
  return h(Modal, {
    title: title || '请确认',
    width: 460,
    onClose: busy ? undefined : onCancel,
    footer: [
      h(Button, { key: 'cancel', onClick: onCancel, disabled: busy }, cancelText),
      h(Button, { key: 'ok', tone: tone === 'danger' ? 'danger' : 'primary', onClick: onConfirm, disabled: busy },
        busy ? '处理中…' : confirmText),
    ],
  }, h('div', { style: { fontSize: 12.5, lineHeight: 1.75, opacity: 0.85, whiteSpace: 'pre-wrap' } }, message))
}

/** 表单字段：label + 控件 */
export function Field({ label, hint, children, width }) {
  return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, width, flexShrink: 0 } },
    h('span', { style: { color: TOKENS.labelSecondary } }, label),
    children,
    hint ? h('span', { style: { fontSize: 10.5, color: TOKENS.labelSecondary, opacity: 0.8 } }, hint) : null
  )
}
