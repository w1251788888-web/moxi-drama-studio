/**
 * moxi-canvas · 共享设计原语（节点类型色板、状态、按钮、输入框、弹窗、抽屉、轻提示）
 * 样式只用 DSH 主题 token（--dsw-alias-*），字面色仅用于类型色/状态色/数据可视化。
 */
import React from 'react'

export const h = React.createElement

/*
 * 类型色收敛到墨稿色系：墨灰 / 朱砂 / 赭金 / 墨绿 四个色相族，
 * 只靠明度与色相微差区分（对应 skin.js 的 INK：ink=#252A2B、inkSoft=#5B6163、
 * inkFaint=#8C9194、accent=#A44736、accentSoft=#C4705C、gold=#B08A4A）。
 * 取值刻意留在中等明度：宣纸底（#FBF8F1）与墨稿暗色（#232628）两种皮肤下都能看清。
 * 字面色仅用于类型点/状态点等数据可视化，不覆盖主题 token。
 */
export const NODE_TYPES = {
  project_root: { label: '项目根', glyph: '◆', accent: '#A44736' },
  settings: { label: '设定集', glyph: '▤', accent: '#5B6163' },
  asset: { label: '资产', glyph: '◈', accent: '#8C9194' },
  beat_sheet: { label: '分集节拍', glyph: '▦', accent: '#A87E3C' },
  scene_list: { label: '分场表', glyph: '☰', accent: '#C9A46A' },
  script_scene: { label: '剧本场次', glyph: '✎', accent: '#C4705C' },
  quality: { label: '质检', glyph: '✓', accent: '#4E7A4B' },
  compliance: { label: '合规', glyph: '⚖', accent: '#5C8A57' },
  delivery: { label: '分镜·导出', glyph: '⤓', accent: '#6B7376' },
}

/* 状态色统一四档：成功 #4E7A4B / 警示 #B08A4A / 错误 #B23A32 / 中性 #8C9194 */
export const STATUS_META = {
  draft: { label: '草稿', color: '#8C9194' },
  generating: { label: '生成中', color: '#B08A4A' },
  review: { label: '待审', color: '#B08A4A' },
  rejected: { label: '打回', color: '#B23A32' },
  approved: { label: '已批准', color: '#4E7A4B' },
  blocked: { label: '阻塞', color: '#8C9194' },
}

export const JOB_STATUS_META = {
  queued: { label: '排队中', color: '#8C9194' },
  running: { label: '运行中', color: '#B08A4A' },
  done: { label: '已完成', color: '#4E7A4B' },
  done_with_errors: { label: '完成但有失败', color: '#B23A32' },
  cancelled: { label: '已取消', color: '#8C9194' },
  failed: { label: '失败', color: '#B23A32' },
}

export const EP_STATUS_META = {
  pending: { label: '待生成', color: '#8C9194' },
  running: { label: '生成中', color: '#B08A4A' },
  done: { label: '完成', color: '#4E7A4B' },
  failed: { label: '失败', color: '#B23A32' },
}

export const EP_STAGE_LABEL = {
  pending: '待生成',
  beat: '节拍',
  scene: '分场',
  script: '剧本',
  check: '确定性检查',
  compliance: '合规',
  done: '完成',
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
  dim: 'var(--dsw-alias-label-secondary, rgba(127,127,127,1))',
  brand: 'var(--dsw-alias-brand-primary, #247bbf)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  /* 语义色：墨稿皮肤下由 skin.js 覆盖为朱砂/墨绿/赭金/灰墨；名字固定，语义不随皮肤漂移 */
  success: 'var(--dsw-alias-state-success-primary, #4E7A4B)',
  warn: 'var(--dsw-alias-state-warn-primary, #B08A4A)',
  error: 'var(--dsw-alias-state-error-primary, #B23A32)',
  neutral: 'var(--dsw-alias-state-idle-primary, #8C9194)',
  /* 数据可视化用的字面色（与 skin.js 的 INK 对齐） */
  accent: '#A44736',
  gold: '#B08A4A',
  goldSoft: '#C9A46A',
}

/* ---------------- 基础件 ---------------- */

export function Pill({ color, children, title }) {
  return h('span', {
    title,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10.5, lineHeight: '16px', padding: '0 7px', borderRadius: 999,
      color, border: `1px solid ${color}55`, background: `${color}14`, whiteSpace: 'nowrap',
    },
  }, h('span', { style: { width: 5, height: 5, borderRadius: 999, background: color } }), children)
}

export function Badge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft
  return h(Pill, { color: meta.color }, meta.label)
}

export function JobBadge({ status }) {
  const meta = JOB_STATUS_META[status] || JOB_STATUS_META.queued
  return h(Pill, { color: meta.color }, meta.label)
}

export function EpBadge({ status }) {
  const meta = EP_STATUS_META[status] || EP_STATUS_META.pending
  return h(Pill, { color: meta.color }, meta.label)
}

export function Button({ children, onClick, tone = 'default', disabled, title, style, ...rest }) {
  const tones = {
    default: { color: TOKENS.text, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` },
    // 主操作 = 品牌色（墨稿皮肤下是朱砂）；危险操作 = 语义错误红，保持填充态
    primary: { color: '#fff', background: TOKENS.brand, border: `1px solid ${TOKENS.brand}` },
    danger: { color: '#fff', background: TOKENS.error, border: `1px solid ${TOKENS.error}` },
    ghost: { color: TOKENS.text, background: 'transparent', border: '1px solid transparent' },
  }
  return h('button', {
    onClick, disabled, title,
    ...rest,
    style: {
      height: 28, padding: '0 10px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...tones[tone], ...style,
    },
  }, children)
}

export function Input({ value, onChange, placeholder, style, onEnter, disabled, type, min, max, ...rest }) {
  return h('input', {
    value: value ?? '', placeholder, disabled, type, min, max,
    onChange: (e) => onChange && onChange(e.target.value),
    onKeyDown: (e) => { if (e.key === 'Enter' && onEnter) onEnter() },
    ...rest,
    style: {
      height: 28, padding: '0 9px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
      border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text,
      outline: 'none', ...style,
    },
  })
}

export function Select({ value, onChange, options, style, disabled, ...rest }) {
  return h('select', {
    value: value ?? '',
    disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    ...rest,
    style: {
      height: 28, padding: '0 6px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
      border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text,
      outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer', ...style,
    },
  }, (options || []).map((o) => h('option', { key: o.value, value: o.value, disabled: o.disabled }, o.label)))
}

export function Checkbox({ checked, onChange, label, ...rest }) {
  return h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' } },
    h('input', {
      type: 'checkbox', checked: !!checked,
      onChange: (e) => onChange && onChange(e.target.checked),
      ...rest,
      style: { width: 14, height: 14, accentColor: TOKENS.brand, cursor: 'pointer' },
    }),
    label
  )
}

export function Field({ label, hint, children, style }) {
  return h('label', { style: { display: 'block', fontSize: 12, ...style } },
    h('div', { style: { marginBottom: 4, opacity: 0.85 } }, label),
    children,
    hint ? h('div', { style: { marginTop: 4, fontSize: 11, opacity: 0.55, lineHeight: 1.45 } }, hint) : null
  )
}

export function SectionTitle({ children, right }) {
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 8px' } },
    h('div', { style: { fontSize: 12, fontWeight: 650 } }, children),
    h('span', { style: { flex: 1 } }),
    right || null
  )
}

export function ProgressBar({ done = 0, total = 0, failed = 0, height = 8 }) {
  const safeTotal = Math.max(1, Number(total) || 0)
  const donePct = Math.min(100, (Number(done) || 0) / safeTotal * 100)
  const failPct = Math.min(100 - donePct, (Number(failed) || 0) / safeTotal * 100)
  return h('div', {
    style: { height, borderRadius: 999, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, overflow: 'hidden', display: 'flex' },
  },
    h('div', { style: { width: `${donePct}%`, background: TOKENS.success, transition: 'width .3s' } }),
    h('div', { style: { width: `${failPct}%`, background: TOKENS.error, transition: 'width .3s' } })
  )
}

export function Spinner({ size = 12 }) {
  return h('span', {
    style: {
      display: 'inline-block', width: size, height: size, borderRadius: 999,
      border: '2px solid rgba(127,127,127,.35)', borderTopColor: TOKENS.brand,
      animation: 'mxspin .8s linear infinite',
    },
  }, h('style', null, '@keyframes mxspin{to{transform:rotate(360deg)}}'))
}

/* ---------------- 弹窗 / 抽屉 ---------------- */

export function Modal({ title, children, onClose, footer, width = 520, testid }) {
  return h('div', {
    'data-testid': testid,
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
      h('div', { style: { padding: '14px 16px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: 8 } },
        h('div', { style: { flex: 1, fontSize: 14, fontWeight: 650 } }, title),
        h('button', {
          'data-testid': testid ? `${testid}-close` : undefined,
          onClick: onClose,
          style: { border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, opacity: 0.6, color: 'inherit' },
        }, '×')
      ),
      h('div', { style: { padding: 16 } }, children),
      footer ? h('div', { style: { padding: '10px 16px', borderTop: `1px solid ${TOKENS.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 } }, footer) : null
    )
  )
}

export function Drawer({ title, onClose, children, footer, width = 520, testid }) {
  return h('div', {
    'data-testid': testid,
    style: {
      position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1800,
      width, maxWidth: '96vw', display: 'flex', flexDirection: 'column',
      background: TOKENS.bg, color: TOKENS.text,
      borderLeft: `1px solid ${TOKENS.border}`, boxShadow: '-12px 0 40px rgba(0,0,0,.18)',
    },
  },
    h('div', { style: { padding: '12px 14px', borderBottom: `1px solid ${TOKENS.border}`, display: 'flex', alignItems: 'center', gap: 8 } },
      h('div', { style: { flex: 1, fontSize: 13.5, fontWeight: 650 } }, title),
      h('button', {
        'data-testid': testid ? `${testid}-close-icon` : undefined,
        onClick: onClose,
        style: { border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, opacity: 0.6, color: 'inherit' },
      }, '×')
    ),
    h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 14px' } }, children),
    footer ? h('div', { style: { padding: '10px 14px', borderTop: `1px solid ${TOKENS.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' } }, footer) : null
  )
}

export function ConfirmModal({ title = '确认操作', message, detail, confirmText = '确认', cancelText = '取消', danger, busy, onConfirm, onCancel, testid = 'modal-confirm' }) {
  return h(Modal, {
    title,
    onClose: busy ? () => {} : onCancel,
    width: 460,
    testid,
    footer: [
      h(Button, { key: 'no', 'data-testid': 'btn-confirm-no', onClick: onCancel, disabled: busy }, cancelText),
      h(Button, {
        key: 'yes',
        'data-testid': 'btn-confirm-yes',
        tone: danger ? 'danger' : 'primary',
        onClick: onConfirm,
        disabled: busy,
      }, busy ? '处理中…' : confirmText),
    ],
  },
    h('div', { style: { fontSize: 13, lineHeight: 1.6 } }, message),
    detail ? h('div', { style: { marginTop: 8, fontSize: 11.5, opacity: 0.65, lineHeight: 1.55 } }, detail) : null
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
  const color = toast.kind === 'error' ? TOKENS.error : toast.kind === 'success' ? TOKENS.success : TOKENS.brand
  return h('div', {
    'data-testid': 'toast',
    style: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
      padding: '9px 16px', borderRadius: 8, fontSize: 12.5, color: '#fff', background: color,
      boxShadow: '0 8px 24px rgba(0,0,0,.25)', maxWidth: '86vw',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    },
  },
    h('span', { 'data-testid': 'toast-text', style: { lineHeight: 1.55, wordBreak: 'break-all' } }, toast.text),
    toast.action
      ? h('button', {
        'data-testid': 'toast-action',
        onClick: (e) => {
          e.stopPropagation()
          if (toast.action && typeof toast.action.onClick === 'function') toast.action.onClick()
        },
        style: {
          height: 24, padding: '0 10px', borderRadius: 6, fontSize: 11.5, whiteSpace: 'nowrap',
          cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,.18)',
          border: '1px solid rgba(255,255,255,.55)',
        },
      }, toast.action.label)
      : null
  )
}
