/**
 * moxi-canvas · Host 半
 *
 * 职责：注册 `/api/moxi/*` 数据路由，客户端半通过 fetch 访问。
 * 数据面：v2 项目工作区文件（projects/<projectId>/...）。
 * 本文件是 S1.3 spike 骨架：只有探活路由 + 最小项目读写。
 */

/** @type {import('@deepseek-ai/cordis').Plugin} */
export const name = 'moxi-canvas'

export function apply(ctx) {
  // 只在有 connection 服务（web / desktop 载体）时激活
  // moxi-canvas 的 Host 半不注册业务路由：数据通道统一走 moxi-core 的 /api/moxi/*。
  // 保留 apply 为空以免 bundle 依赖调整；如需 canvas 专属路由（如缩略图），在此处注册。
}
