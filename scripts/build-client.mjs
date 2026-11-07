#!/usr/bin/env node
/**
 * 把各 bundle 的 src/client.jsx 打包成 DSH Client 产物（client.js）。
 *
 * 产物形态（宿主模块表约定，见 docs/选型/画布-集成面勘察.md §1.6）：
 *   window.__ModuleLoader__.load({ id: '<包名>', factory(require) { ...cjs 内容...; return plugin } })
 *
 * 依赖：esbuild（已随仓库 tooling/node_modules 提供，离线可用）
 * 用法：node scripts/build-client.mjs [bundle 名...]   # 缺省构建全部
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const bundlesDir = join(repoRoot, 'dsh', 'bundles')
const esbuildEntry = join(repoRoot, 'tooling', 'node_modules', 'esbuild', 'lib', 'main.js')

if (!existsSync(esbuildEntry)) {
  console.error('[build-client] 找不到 esbuild：', esbuildEntry)
  process.exit(1)
}
const esbuild = await import(pathToFileURL(esbuildEntry).href)

const only = process.argv.slice(2)
const targets = readdirSync(bundlesDir).filter((name) => {
  if (only.length && !only.includes(name)) return false
  return existsSync(join(bundlesDir, name, 'src', 'client.jsx'))
})
if (!targets.length) {
  console.error('[build-client] 没有找到含 src/client.jsx 的 bundle')
  process.exit(1)
}

let failed = 0
for (const name of targets) {
  const dir = join(bundlesDir, name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const entry = join(dir, 'src', 'client.jsx')
  const out = join(dir, 'client.js')
  const started = Date.now()
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'cjs',
      target: ['es2020'],
      platform: 'browser',
      jsx: 'transform',
      loader: { '.js': 'jsx' },
      external: ['react', 'react-dom', 'react-dom/client'],
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' },
      minify: false,
      legalComments: 'none',
    })
    const body = result.outputFiles[0].text
    const wrapped = `/* ${pkg.name} @ ${pkg.version} — 由 scripts/build-client.mjs 生成，勿手改 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    var plugin = module.exports;
    if (plugin && plugin.default) plugin = plugin.default;
    return plugin;
  },
});
`
    writeFileSync(out, wrapped, 'utf8')
    const kb = (Buffer.byteLength(wrapped) / 1024).toFixed(1)
    console.log(`[build-client] ✓ ${name} → client.js (${kb} KB, ${Date.now() - started}ms)`)
  } catch (err) {
    failed += 1
    console.error(`[build-client] ✗ ${name}:`, err && err.message ? err.message : err)
  }
}
process.exit(failed ? 1 : 0)
