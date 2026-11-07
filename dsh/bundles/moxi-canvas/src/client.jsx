/**
 * moxi-canvas · Client 半入口
 * 挂载：sidebar.panellist（侧栏图标）+ main（keyed 面板）+ sidebar.brand.mark（品牌位）
 * 皮肤：注册「墨稿」主题（明/暗）+ 注入版式 CSS；可在界面内切回宿主外观。
 */
import React from 'react'
import App from './App.jsx'
import { installSkin, registerBrandMark, BrandMark } from './skin.js'

function SidebarIcon(props) {
  const size = (props && props.size) || 20
  const active = !!(props && props.active)
  return React.createElement('svg', {
    viewBox: '0 0 24 24', width: size, height: size,
    'aria-hidden': true, style: { display: 'block' },
    fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2 : 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  },
    React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
    React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
    React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
    React.createElement('path', { d: 'M14 17.5h7M17.5 14v7' })
  )
}

export default {
  inject: ['slots', 'theme'],
  apply(ctx) {
    // 皮肤：墨稿主题 + 版式（失败不阻塞插件）
    try { installSkin(ctx) } catch (err) { console.warn('[moxi] skin failed:', err) }
    try { registerBrandMark(ctx) } catch (err) { try { window.__moxiBrandErr = String((err && err.message) || err) } catch {} }

    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: 'moxi-canvas',
      order: 30,
      label: '墨戏画布',
    }, SidebarIcon))
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: 'moxi-canvas',
    }, App))
  },
}
