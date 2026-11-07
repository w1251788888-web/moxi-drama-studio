/**
 * 墨戏 · 皮肤（墨稿创作台）
 *
 * 设计口径：宣纸底、墨色字、朱砂点睛、笺纸卡片、宋体标题。
 * 通过 DSH 主题 API（ctx.theme.register）覆盖 14 个 alias token，
 * 再注入少量版式 CSS（不改宿主组件结构、不读宿主 DOM）。
 */
import React from 'react'

const h = React.createElement

export const SKIN_KEY = 'moxi:skin' // 'ink' | 'host'

/* ---------------- 墨稿调色板 ---------------- */

export const INK = {
  paper: '#F4F0E7',
  paperDeep: '#EAE3D6',
  card: '#FBF8F1',
  ink: '#252A2B',
  inkSoft: '#5B6163',
  inkFaint: '#8C9194',
  accent: '#A44736',
  accentSoft: '#C4705C',
  border: '#D8CEC0',
  borderSoft: '#E7DFD2',
  gold: '#B08A4A',
}

export const INK_DARK = {
  paper: '#191A1B',
  paperDeep: '#202224',
  card: '#232628',
  ink: '#EDE6DA',
  inkSoft: '#A9A29A',
  inkFaint: '#7C7873',
  accent: '#D2765F',
  accentSoft: '#B9634E',
  border: '#3A3630',
  borderSoft: '#2C2A26',
  gold: '#C9A46A',
}

/** 两个方案的 alias token 覆盖（宿主只认 --dsw-alias-*） */
export function tokensOf(c) {
  return {
    '--dsw-alias-bg-base': c.paper,
    '--dsw-alias-bg-layer-1': c.card,
    '--dsw-alias-bg-layer-2': c.paperDeep,
    '--dsw-alias-bg-overlay': c.card,
    '--dsw-alias-border-l1': c.borderSoft,
    '--dsw-alias-border-l2': c.border,
    '--dsw-alias-brand-primary': c.accent,
    '--dsw-alias-label-primary': c.ink,
    '--dsw-alias-label-secondary': c.inkSoft,
    '--dsw-alias-state-error-primary': '#B23A32',
    '--dsw-alias-state-idle-primary': c.inkFaint,
    '--dsw-alias-state-success-primary': '#4E7A4B',
    '--dsw-alias-state-warn-primary': c.gold,
    '--dsw-specific-sidebar-fill': c.paperDeep,
  }
}

/** 版式：宋体标题 / 笺纸纹理 / 墨线滚动条。只作用于产品自己的容器与全局排版。 */
export function inkCss(c) {
  return `
  :root {
    --moxi-paper: ${c.paper};
    --moxi-card: ${c.card};
    --moxi-ink: ${c.ink};
    --moxi-ink-soft: ${c.inkSoft};
    --moxi-accent: ${c.accent};
    --moxi-border: ${c.border};
    --moxi-serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif;
    --moxi-sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif;
  }
  body.moxi-skin { font-family: var(--moxi-sans); }
  body.moxi-skin .moxi-app,
  body.moxi-skin .moxi-panel { font-family: var(--moxi-sans); color: var(--moxi-ink); }
  body.moxi-skin .moxi-serif { font-family: var(--moxi-serif); letter-spacing: .02em; }
  body.moxi-skin .moxi-title { font-family: var(--moxi-serif); font-weight: 600; letter-spacing: .04em; }
  body.moxi-skin .moxi-paper-bg {
    background-color: var(--moxi-paper);
    background-image:
      radial-gradient(1200px 600px at 15% -10%, rgba(164,71,54,.05), transparent 60%),
      radial-gradient(900px 500px at 110% 10%, rgba(176,138,74,.06), transparent 60%),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.035'/></svg>");
  }
  body.moxi-skin .moxi-card {
    background: var(--moxi-card);
    border: 1px solid var(--moxi-border);
    box-shadow: 0 1px 0 rgba(37,42,43,.04), 0 8px 24px -18px rgba(37,42,43,.35);
  }
  body.moxi-skin .moxi-stamp {
    font-family: var(--moxi-serif); color: var(--moxi-accent);
    border: 1px solid var(--moxi-accent); border-radius: 4px;
    padding: 1px 6px; font-size: 10px; letter-spacing: .12em; opacity: .9;
  }
  body.moxi-skin .moxi-hairline { background: linear-gradient(90deg, transparent, var(--moxi-border), transparent); height: 1px; }
  body.moxi-skin ::-webkit-scrollbar { width: 9px; height: 9px; }
  body.moxi-skin ::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 9px; border: 2px solid ${c.paper}; }
  body.moxi-skin ::-webkit-scrollbar-track { background: transparent; }
  @media (prefers-reduced-motion: reduce) { body.moxi-skin * { transition-duration: .01ms !important; animation-duration: .01ms !important; } }
  `
}

/* ---------------- 装置 ---------------- */

function ensureStyle(id, css) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = css
  return el
}

/**
 * 安装皮肤。返回 { setSkin, getSkin, dispose }。
 * 皮肤开关存 localStorage：'ink'（默认）| 'host'（恢复宿主外观）。
 */
export function installSkin(ctx) {
  const disposeTheme = ctx.theme.register({
    id: 'moxi-ink', colorScheme: 'light', tokens: tokensOf(INK),
  })
  const disposeThemeDark = ctx.theme.register({
    id: 'moxi-ink-dark', colorScheme: 'dark', tokens: tokensOf(INK_DARK),
  })

  let scheme = 'light'
  let hostPreference = null // 记为「宿主原本的偏好」，切回宿主外观时还原
  const apply = (skin) => {
    try { window.localStorage.setItem(SKIN_KEY, skin) } catch { /* ignore */ }
    const dark = scheme === 'dark'
    if (skin === 'ink') {
      document.body.classList.add('moxi-skin')
      ensureStyle('moxi-ink-style', inkCss(dark ? INK_DARK : INK))
      // 只在首次切到墨稿时记住宿主偏好（system 也要记住，切回时还原）
      if (hostPreference == null) {
        try {
          const snap = ctx.theme.getTheme()
          hostPreference = (snap && snap.preference) || 'system'
        } catch { hostPreference = 'system' }
      }
      ctx.theme.setTheme(dark ? 'moxi-ink-dark' : 'moxi-ink')
    } else {
      document.body.classList.remove('moxi-skin')
      const el = document.getElementById('moxi-ink-style')
      if (el) el.remove()
      // 只有"本次会话从墨稿切回"才还原偏好；页面加载时直接用宿主现状，绝不改写用户主题设置
      if (hostPreference != null) {
        ctx.theme.setTheme(hostPreference)
        hostPreference = null
      }
    }
  }

  const readSkin = () => {
    try { return window.localStorage.getItem(SKIN_KEY) || 'ink' } catch { return 'ink' }
  }

  // 跟随宿主外观偏好（light / dark / system）
  const syncScheme = () => {
    try {
      const snap = ctx.theme.getTheme()
      scheme = snap && snap.active ? snap.active.colorScheme : 'light'
    } catch { scheme = 'light' }
  }

  syncScheme()
  apply(readSkin())

  const onTheme = () => { syncScheme(); if (readSkin() === 'ink') apply('ink') }
  ctx.effect(() => ctx.on('theme/change', onTheme))
  // 系统外观切换（light/dark）时同步墨稿方案：墨稿皮肤"跟随系统"，不锁死
  ctx.effect(() => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      scheme = mq.matches ? 'dark' : 'light'
      if (readSkin() === 'ink') apply('ink')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  })

  const api = {
    getSkin: readSkin,
    setSkin: (s) => apply(s === 'host' ? 'host' : 'ink'),
  }
  try { window.__moxiSkin = api } catch { /* ignore */ }
  return api
}

/* ---------------- 品牌位 ---------------- */

/** 墨滴 × 场记板 */
export function BrandMark(props) {
  const size = (props && props.size) || 26
  const mark = INK.accent
  return h('svg', {
    viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': true,
    style: { display: 'block' },
  },
    // 墨滴
    h('path', {
      d: 'M9 6.2c2.6 2.4 4.2 4.4 4.2 6.4a4.2 4.2 0 1 1-8.4 0c0-2 1.6-4 4.2-6.4z',
      fill: mark, opacity: 0.92,
    }),
    // 场记板
    h('g', { transform: 'translate(15.5 12)' },
      h('rect', { x: 0, y: 0, width: 14, height: 11, rx: 2, fill: 'none', stroke: mark, strokeWidth: 1.6 }),
      h('path', { d: 'M0 3.6h14', stroke: mark, strokeWidth: 1.4 }),
      h('path', { d: 'M2.6 0.8l2.2 2.6M7.4 0.8l2.2 2.6M12 0.8l1.6 2.4', stroke: mark, strokeWidth: 1.1, opacity: 0.75 })
    ),
    // 底部墨线
    h('path', { d: 'M6 28.5c5.5-1.6 14.5-1.6 20 0', stroke: mark, strokeWidth: 1.3, opacity: 0.35, fill: 'none' })
  )
}

/** 侧栏品牌位（替换宿主 logo）：mark + name 两个 slot */
export function registerBrandMark(ctx) {
  if (!ctx.slots) return
  const visible = () => { try { return (window.localStorage.getItem(SKIN_KEY) || 'ink') === 'ink' } catch { return true } }

  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, (props) => {
      if (!visible()) return null
      return h(BrandMark, { size: (props && props.size) || 26 })
    })
    yield ctx.slots.register({ name: 'sidebar.brand.name' }, () => {
      if (!visible()) return null
      return h('div', {
        className: 'moxi-serif',
        style: { display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' },
      },
        h('span', { style: { fontSize: 15, letterSpacing: '.16em', color: 'var(--moxi-ink, #252A2B)' } }, '墨戏生花'),
        h('span', { style: { fontSize: 9.5, letterSpacing: '.22em', opacity: 0.55, color: 'var(--moxi-ink, #252A2B)' } }, 'MOXI')
      )
    })
  }))
}
