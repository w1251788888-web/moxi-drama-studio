/**
 * moxi-admin · Host 半（空）
 * 后台所需数据全部由 moxi-core 的 /api/moxi/admin/* 路由提供；
 * 本 bundle 只负责客户端界面，避免出现第二个业务入口。
 */
export const name = 'moxi-admin'
export function apply() { /* 无 Host 行为 */ }
