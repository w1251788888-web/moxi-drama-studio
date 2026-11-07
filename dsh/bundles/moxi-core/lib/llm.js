/**
 * moxi-core · LLM 调用封装（走 DSH 自带 llm 服务，使用 profile 配置的 provider/model）
 *
 * 设计要点：
 * - 只依赖 ctx.llm.stream，不自己发 HTTP，因此自动复用 DSH 的密钥/路由/重试策略
 * - 支持任意 provider/model（配置项可改），默认 deepseek-official / deepseek-flash
 * - 统一超时、取消、token 记账；失败重试 1 次（指数退避）
 */
import { MoxiError } from './util.js'

const DEFAULTS = {
  provider: 'deepseek-official',
  model: 'deepseek-flash',
  maxTokens: 4096,
  temperature: 0.75,
  timeoutMs: 180000,
}

export class LlmClient {
  constructor({ ctx, getConfig }) {
    this.ctx = ctx
    this.getConfig = getConfig || (() => ({}))
    this.usage = { calls: 0, inputTokens: 0, outputTokens: 0, failures: 0 }
  }

  resolve(overrides = {}) {
    const cfg = this.getConfig() || {}
    return {
      provider: overrides.provider || cfg.llmProvider || DEFAULTS.provider,
      model: overrides.model || cfg.llmModel || DEFAULTS.model,
      maxTokens: Number(overrides.maxTokens || cfg.llmMaxTokens || DEFAULTS.maxTokens),
      temperature: Number(overrides.temperature ?? cfg.llmTemperature ?? DEFAULTS.temperature),
      timeoutMs: Number(cfg.llmTimeoutMs || DEFAULTS.timeoutMs),
    }
  }

  /** 单次补全：system + user 文本 → { text, usage, provider, model } */
  async complete({ system, user, maxTokens, temperature, reasoningEffort, signal, provider, model, purpose = 'moxi.generate' }) {
    const cfg = this.resolve({ maxTokens, temperature, provider, model })
    if (reasoningEffort) cfg.reasoningEffort = reasoningEffort
    const messages = [{ role: 'user', content: [{ type: 'text', text: user }] }]
    let attempt = 0
    let lastErr = null
    let budget = cfg.maxTokens
    while (attempt < 3) {
      attempt += 1
      const started = Date.now()
      try {
        const text = await this.streamOnce({ ...cfg, maxTokens: budget, reasoningEffort, messages, system, signal })
        this.usage.calls += 1
        return { text, provider: cfg.provider, model: cfg.model, ms: Date.now() - started, attempts: attempt }
      } catch (err) {
        lastErr = err
        this.usage.failures += 1
        if (signal && signal.aborted) throw err
        // 截断：放大输出预算后重试一次（reasoning 模型很常见）
        if (err && err.truncated) {
          budget = Math.min(16000, Math.round(budget * 1.8))
          await new Promise((r) => setTimeout(r, 300))
          continue
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
    const e = new MoxiError('E_LLM', `模型调用失败：${lastErr && lastErr.message ? lastErr.message : lastErr}`)
    throw e
  }

  async streamOnce({ provider, model, messages, system, maxTokens, temperature, reasoningEffort, timeoutMs, signal }) {
    if (!this.ctx.llm) throw new MoxiError('E_LLM', 'Host 未提供 llm 服务（profile 缺 llm 插件？）')
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(new Error('llm timeout')), timeoutMs)
    const onAbort = () => ac.abort(new Error('cancelled'))
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); throw new MoxiError('E_CANCELLED', '已取消') }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    let text = ''
    try {
      const base = {
        provider, model, messages, system,
        maxTokens, temperature,
        signal: ac.signal,
        purpose: 'moxi.generate',
      }
      if (reasoningEffort) base.reasoningEffort = reasoningEffort
      const stream = this.ctx.llm.stream(base)
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'usage') {
          this.usage.inputTokens += chunk.usage?.inputTokens || 0
          this.usage.outputTokens += chunk.usage?.outputTokens || 0
        } else if (chunk.type === 'finish') {
          const kind = chunk.reason && chunk.reason.kind
          if (kind === 'error') throw new MoxiError('E_LLM', (chunk.reason.failure && chunk.reason.failure.message) || '模型返回错误')
          if (kind === 'aborted') throw new MoxiError('E_CANCELLED', '调用被中止')
          if (kind === 'max-tokens') {
            // 截断一律视为失败，由调用方重试/续写；绝不让残稿当成品
            const e = new MoxiError('E_LLM', '模型输出被 max-tokens 截断')
            e.truncated = true
            e.partial = text
            throw e
          }
        }
      }
      if (!text.trim()) throw new MoxiError('E_LLM', '模型返回空内容')
      return text
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }

  stats() {
    return { ...this.usage }
  }
}
