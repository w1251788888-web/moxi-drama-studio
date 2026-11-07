/**
 * moxi-admin · Client 半入口
 * 挂载：sidebar.panellist（侧栏 id=moxi-admin）+ main（keyed）
 */
import React from 'react'
import App from './App.jsx'

function SidebarIcon(props) {
  const size = (props && props.size) || 20
  const active = !!(props && props.active)
  return React.createElement('svg', {
    viewBox: '0 0 24 24', width: size, height: size,
    'aria-hidden': true, style: { display: 'block' },
    fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2 : 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  },
    React.createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
    React.createElement('path', { d: 'M3 9h18M9 21V9' })
  )
}

export default {
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: 'moxi-admin',
      order: 40,
      label: '墨戏后台',
    }, SidebarIcon))
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: 'moxi-admin',
    }, App))
  },
}
