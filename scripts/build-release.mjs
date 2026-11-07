#!/usr/bin/env node
/**
 * 把 moxi-core / moxi-canvas / moxi-admin 打成**实验版发行包**（安装包 / 压缩包）。
 *
 * 发行包口径：
 *   - 打包编译后的 JS（host index.js、client client.js），方便不想自行构建的用户直接安装
 *   - 规则包 rules/v2 内嵌进 moxi-core 的 JS（lib/rules-bundle.js），安装后不依赖仓库目录
 *   - 许可证：MIT，附 LICENSE.txt；完整源码见 GitHub 仓库
 *   - 版本：0.1.0-exp.<n>，README 标注实验版与免责声明
 *
 * 产物：
 *   dist/experimental/packages/moxi-core/…
 *   dist/experimental/packages/moxi-canvas/…
 *   dist/experimental/packages/moxi-admin/…
 *   dist/experimental/tarballs/moxi-*-0.1.0-exp.*.tgz
 *   dist/experimental/{LICENSE.txt,NOTICE.txt,README-INSTALL.md,install-exp.sh}
 *
 * 用法：node scripts/build-release.mjs [--version 0.1.0-exp.2]
 */
import { promises as fs } from 'node:fs'
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const bundlesDir = join(repoRoot, 'dsh', 'bundles')
const distRoot = join(repoRoot, 'dist', 'experimental')
const pkgRoot = join(distRoot, 'packages')
const esbuildEntry = join(repoRoot, 'tooling', 'node_modules', 'esbuild', 'lib', 'main.js')
const argv = process.argv.slice(2)
const versionArg = argv.indexOf('--version')
const VERSION = versionArg >= 0 ? argv[versionArg + 1] : '0.1.0-exp.1'
const LICENSE = 'MIT'

const esbuild = await import(pathToFileURL(esbuildEntry).href)

const log = (...a) => console.log('[build-release]', ...a)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

/* ---------------- 1. 内嵌规则包 ---------------- */
async function collectRules() {
  const base = join(repoRoot, 'rules', 'v2')
  const out = {}
  const walk = async (dir, rel = '') => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      const abs = join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(abs, r)
      else if (e.name.endsWith('.md') || e.name.endsWith('.json')) out[r] = await fs.readFile(abs, 'utf8')
    }
  }
  await walk(base)
  return out
}

/* ---------------- 2. 打包工具 ---------------- */
async function bundleModule({ entry, outfile, platform, format, minify = true, jsx = false }) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform,
    format,
    target: ['node22'],
    jsx: jsx ? 'transform' : undefined,
    loader: jsx ? { '.js': 'jsx', '.jsx': 'jsx' } : {},
    external: ['node:*', 'react', 'react-dom', 'react-dom/client'],
    minify,
    legalComments: 'none',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'embed-rules',
      setup(build) {
        build.onResolve({ filter: /rules-bundle\.js$/ }, (args) => ({
          path: join(distTmp, 'rules-bundle.js'),
        }))
      },
    }],
  })
  await fs.mkdir(dirname(outfile), { recursive: true })
  await fs.writeFile(outfile, result.outputFiles[0].text, 'utf8')
  return Buffer.byteLength(result.outputFiles[0].text)
}

async function bundleClient({ entry, outfile, pkgName }) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'transform',
    loader: { '.js': 'jsx' },
    external: ['react', 'react-dom', 'react-dom/client'],
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const body = result.outputFiles[0].text
  const wrapped = `/* ${pkgName} @ ${VERSION} — minified build, source not included */
window.__ModuleLoader__.load({id:${JSON.stringify(pkgName)},factory(require){var module={exports:{}};var exports=module.exports;${body};var plugin=module.exports;if(plugin&&plugin.default)plugin=plugin.default;return plugin;}});
`
  await fs.mkdir(dirname(outfile), { recursive: true })
  await fs.writeFile(outfile, wrapped, 'utf8')
  return Buffer.byteLength(wrapped)
}

/* ---------------- 3. 包清单改写 ---------------- */
function rewritePkg(base, { name, description }) {
  const pkg = readJson(join(base, 'package.json'))
  delete pkg.devDependencies
  return {
    ...pkg,
    name,
    version: VERSION,
    private: true,
    license: LICENSE,
    description,
    scripts: undefined,
    files: undefined,
    exports: pkg.exports,
    dsh: pkg.dsh,
    author: '墨戏生花 (Moxi) contributors',
    repository: undefined,
    homepage: undefined,
  }
}

const distTmp = join(distRoot, '.tmp')
rmSync(distRoot, { recursive: true, force: true })
mkdirSync(distTmp, { recursive: true })
mkdirSync(pkgRoot, { recursive: true })

/* 内嵌规则 → 临时模块（随后被 esbuild 内联进 core） */
const rules = await collectRules()
const rulesModule = `/* 打包时生成，勿手改：内嵌规则包（rule count: ${Object.keys(rules).length}） */\nexport const RULES_BUNDLE = ${JSON.stringify(rules)};\n`
await fs.writeFile(join(distTmp, 'rules-bundle.js'), rulesModule, 'utf8')
log(`内嵌规则 ${Object.keys(rules).length} 个文件（${(rulesModule.length / 1024).toFixed(0)} KB）`)

/* ---------------- 4. moxi-core ---------------- */
{
  const dir = join(pkgRoot, 'moxi-core')
  mkdirSync(dir, { recursive: true })
  const bytes = await bundleModule({
    entry: join(bundlesDir, 'moxi-core', 'index.js'),
    outfile: join(dir, 'index.js'),
    platform: 'node', format: 'esm',
  })
  const pkg = rewritePkg(join(bundlesDir, 'moxi-core'), {
    name: 'moxi-core-bundle',
    description: '墨戏生花 · 业务内核（实验版）：项目读写、状态机、审计、确定性检查、导出、生成任务、可拍性报告',
  })
  pkg.files = ['index.js', 'cordis.patch.yml']
  await fs.writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  await fs.copyFile(join(bundlesDir, 'moxi-core', 'cordis.patch.yml'), join(dir, 'cordis.patch.yml'))
  log(`moxi-core/index.js ${(bytes / 1024).toFixed(1)} KB（已内联全部 lib + 规则表）`)
}

/* ---------------- 5. moxi-canvas / moxi-admin ---------------- */
for (const [name, pkgName, desc] of [
  ['moxi-canvas', 'moxi-canvas-bundle', '墨戏生花 · 无限画布（实验版）'],
  ['moxi-admin', 'moxi-admin-bundle', '墨戏生花 · 管理后台（实验版）'],
]) {
  const src = join(bundlesDir, name)
  const dir = join(pkgRoot, name)
  mkdirSync(dir, { recursive: true })
  const bytes = await bundleClient({ entry: join(src, 'src', 'client.jsx'), outfile: join(dir, 'client.js'), pkgName })
  // Host 半（空插件）：DSH 会 import 包主入口，必须存在
  const hostStub = `/* ${pkgName} @ ${VERSION} — host stub（无 Host 行为） */\nexport const name = ${JSON.stringify(pkgName.replace(/-bundle$/, ''))}\nexport function apply() {}\n`
  await fs.writeFile(join(dir, 'index.js'), hostStub, 'utf8')
  const pkg = rewritePkg(src, { name: pkgName, description: desc })
  pkg.files = ['index.js', 'client.js', 'cordis.patch.yml']
  await fs.writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  await fs.copyFile(join(src, 'cordis.patch.yml'), join(dir, 'cordis.patch.yml'))
  if (existsSync(join(src, 'icon.svg'))) await fs.copyFile(join(src, 'icon.svg'), join(dir, 'icon.svg'))
  log(`${name}/client.js ${(bytes / 1024).toFixed(1)} KB（打包产物；源码见 GitHub 仓库）`)
}

/* ---------------- 5b. Windows 图标 ---------------- */
const icoSrc = join(repoRoot, 'dsh', 'launcher', 'Moxi.ico')
if (existsSync(icoSrc)) await fs.copyFile(icoSrc, join(distRoot, 'Moxi.ico'))

/* ---------------- 6. 法律与安装文档 ---------------- */
await fs.writeFile(join(distRoot, 'LICENSE.txt'), `MIT License

Copyright (c) 2026 龙樆 / 墨戏生花 (Moxi) contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

第三方组件：本软件通过 DeepSeek Harness（DSH）运行时加载；DSH 及其依赖组件
（如 react 等）遵循其各自的许可证。本发行包不包含 DSH 本体。完整源码见 GitHub 仓库。
`, 'utf8')

await fs.writeFile(join(distRoot, 'NOTICE.txt'), `墨戏生花 v${VERSION}（实验版）发行说明

包含：
  moxi-core-bundle    业务内核（Host 插件，已内联全部逻辑与规则表）
  moxi-canvas-bundle  无限画布（Client 插件，打包产物）
  moxi-admin-bundle   管理后台（Client 插件，打包产物）

说明：
  本包为安装用打包产物；完整源码、规则 Markdown、技能源码见 GitHub 仓库。

版本兼容：DeepSeek Harness 0.2.1-rc.5+
`, 'utf8')

await fs.writeFile(join(distRoot, 'README-INSTALL.md'), `# 墨戏生花 · DeepSeek 插件（实验版 v${VERSION}）

> 实验版：功能可用但不保证稳定，可能变更或改数据。建议先备份 \`~/Documents/Moxi/projects\`。

## 安装

### Windows（PowerShell，推荐）

\`\`\`powershell
Expand-Archive moxi-studio-exp-${VERSION}.tar.gz -DestinationPath .
cd moxi-studio-exp-${VERSION}
powershell -ExecutionPolicy Bypass -File .\install-exp.ps1
\`\`\`

或解压后双击 \`install-exp.cmd\`。

### macOS / Linux

\`\`\`bash
tar xzf moxi-studio-exp-${VERSION}.tar.gz
cd moxi-studio-exp-${VERSION}
bash install-exp.sh
\`\`\`

> profile 默认 \`moxi-exp\`；macOS/Linux 可用 \`MOXI_PROFILE=xxx\`、Windows 可用 \`-Profile xxx\` 改名。

安装脚本会：
1. 用 DSH 的 web 模板创建/复用 profile（默认 \`moxi-exp\`）
2. 把三个插件包装进该 profile（本地 tarball 安装，不联网）
3. 校验三个 bundle 已挂载，并打印启动命令

## 启动

\`\`\`bash
dsh --profile moxi-exp
\`\`\`

首次启动会打印带 token 的地址；左侧栏出现「墨戏画布」「墨戏后台」。
生成需要 DeepSeek API 密钥（在 profile 的 \`cordis.patch.yml\` 中配置 \`llm-deepseek-*\`，或沿用本机已登录的 DSH 账户）。

## 使用

1. 墨戏画布 → 新开一部剧（填剧名/集数/受众/题材/一句话故事）
2. 点「⚡ 生成」→ 选起止集 → 进度抽屉实时看；可取消/续跑
3. 生成完点「可拍性」→ 看逐集时长/角色/钩子，逐集签收
4. 满意后点「人工放行」→「导出」docx

## 卸载

\`\`\`bash
dsh plugin --profile moxi-exp remove moxi-core-bundle moxi-canvas-bundle moxi-admin-bundle
\`\`\`
项目数据不会被删除：\`~/Documents/Moxi/projects\`（可用 \`MOXI_PROJECTS_ROOT\` 改）。

## 授权

本发行包遵循 MIT 许可；完整源码见 GitHub 仓库。详见 LICENSE.txt。
`, 'utf8')

/* ---------------- 7. 安装脚本 ---------------- */
await fs.writeFile(join(distRoot, 'install-exp.sh'), `#!/usr/bin/env bash
# 墨戏生花 · 实验版安装脚本
# 用法：bash install-exp.sh          # 默认 profile: moxi-exp
#       MOXI_PROFILE=moxi bash install-exp.sh
set -euo pipefail
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROFILE="\${MOXI_PROFILE:-moxi-exp}"
say() { printf '\\033[1;36m[moxi-exp]\\033[0m %s\\n' "$*"; }
command -v dsh >/dev/null || { echo "缺少 dsh（DeepSeek Harness CLI）"; exit 1; }

say "profile: $PROFILE"
if [ ! -d "\${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE" ]; then
  say "创建 profile（web 模板）"
  dsh --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null
fi

TGZ="$HERE/tarballs"
PKGS=$(ls "$TGZ"/*.tgz)
say "安装插件包"
dsh plugin --profile "$PROFILE" add $PKGS

say "校验"
for b in moxi-core-bundle moxi-canvas-bundle moxi-admin-bundle; do
  dsh --profile "$PROFILE" --dump-config | grep -q "$b" || { echo "✗ $b 未挂载"; exit 1; }
  echo "  ✓ $b"
done
say "完成。启动：dsh --profile $PROFILE"
say "数据目录：\${MOXI_PROJECTS_ROOT:-$HOME/Documents/Moxi/projects}"
`, 'utf8')
await fs.chmod(join(distRoot, 'install-exp.sh'), 0o755)

/* ---------------- 7a. Windows 启动器与排障 ---------------- */
await fs.writeFile(join(distRoot, 'start-moxi.cmd'), `@echo off
chcp 65001 >nul
setlocal
set PROFILE=moxi-exp
title 墨戏生花
where dsh >nul 2>nul
if errorlevel 1 (
  echo.
  echo [墨戏生花] 未找到 dsh（DeepSeek Harness CLI）。
  echo 请先安装 DeepSeek Harness，并确认在命令行里输入 dsh 能运行。
  echo 装好后重新双击本文件。
  echo.
  pause
  exit /b 1
)
echo [墨戏生花] 正在启动本地服务（首次约 15 秒）…
echo 浏览器会自动打开；本窗口不要关，关掉即停止服务。
echo.
dsh --profile %PROFILE%
echo.
echo [墨戏生花] 服务已结束。
pause
`, 'utf8')

await fs.writeFile(join(distRoot, 'DIAGNOSE.bat'), `@echo off
chcp 65001 >nul
setlocal
set OUT=%USERPROFILE%\Desktop\moxi-diagnose.txt
echo 墨戏生花排障报告 > "%OUT%"
echo 生成时间: %DATE% %TIME% >> "%OUT%"
echo ===== >> "%OUT%"
echo [dsh] >> "%OUT%"
where dsh >> "%OUT%" 2>&1
dsh --version >> "%OUT%" 2>&1
echo ===== >> "%OUT%"
echo [profiles] >> "%OUT%"
dsh --profile moxi-exp --dump-config 2>&1 | findstr /C:"moxi-core" /C:"moxi-canvas" /C:"moxi-admin" /C:"error" >> "%OUT%"
echo ===== >> "%OUT%"
echo [node] >> "%OUT%"
where node >> "%OUT%" 2>&1
node --version >> "%OUT%" 2>&1
echo ===== >> "%OUT%"
echo [python] >> "%OUT%"
where python >> "%OUT%" 2>&1
where py >> "%OUT%" 2>&1
echo ===== >> "%OUT%"
echo [dir] >> "%OUT%"
dir "%~dp0" >> "%OUT%" 2>&1
echo.
echo 报告已写到桌面：moxi-diagnose.txt
echo 把它发给提供者即可定位问题。
pause
`, 'utf8')

/* ---------------- 7b. Windows 安装脚本 ---------------- */
await fs.writeFile(join(distRoot, 'install-exp.ps1'), `# 墨戏生花 · 实验版安装脚本（Windows PowerShell）
# 用法： powershell -ExecutionPolicy Bypass -File .\\install-exp.ps1
#        powershell -ExecutionPolicy Bypass -File .\\install-exp.ps1 -Profile moxi-exp
param(
  [string]$Profile = 'moxi-exp'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "[moxi-exp] profile: $Profile" -ForegroundColor Cyan

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  Write-Error '缺少 dsh（DeepSeek Harness CLI）。请先安装 DSH，并确认 dsh 在 PATH 中。'
  exit 1
}
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshHome "profiles\\$Profile"
if (-not (Test-Path $profileDir)) {
  Write-Host '[moxi-exp] 创建 profile（web 模板）' -ForegroundColor Cyan
  dsh --profile $Profile --from-default-profile web --dump-config | Out-Null
}

$tgz = Get-ChildItem (Join-Path $here 'tarballs') -Filter *.tgz | ForEach-Object { $_.FullName }
if (-not $tgz) { Write-Error '找不到 tarballs/*.tgz（请先完整解压压缩包）'; exit 1 }
Write-Host '[moxi-exp] 安装插件包' -ForegroundColor Cyan
& dsh plugin --profile $Profile add @tgz
if ($LASTEXITCODE -ne 0) { Write-Error 'dsh plugin add 失败'; exit 1 }

Write-Host '[moxi-exp] 校验' -ForegroundColor Cyan
$conf = & dsh --profile $Profile --dump-config
foreach ($b in @('moxi-core-bundle', 'moxi-canvas-bundle', 'moxi-admin-bundle')) {
  if ($conf -match [regex]::Escape($b)) { Write-Host "  OK $b" } else { Write-Error "缺少 $b"; exit 1 }
}
# 创建桌面与开始菜单快捷方式（双击启动，不需要记命令）
$launcher = Join-Path $here 'start-moxi.cmd'
$icon = Join-Path $here 'Moxi.ico'
try {
  $ws = New-Object -ComObject WScript.Shell
  $targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) '墨戏生花.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) '墨戏生花.lnk')
  )
  foreach ($lnkPath in $targets) {
    $sc = $ws.CreateShortcut($lnkPath)
    $sc.TargetPath = $launcher
    $sc.WorkingDirectory = $here
    $sc.WindowStyle = 1
    $sc.Description = '墨戏生花 · 短剧创作工作台'
    if (Test-Path $icon) { $sc.IconLocation = $icon }
    $sc.Save()
  }
  Write-Host '[moxi-exp] 已在桌面和开始菜单创建「墨戏生花」快捷方式' -ForegroundColor Green
} catch {
  Write-Warning "创建快捷方式失败（可手动双击 start-moxi.cmd）：$($_.Exception.Message)"
}

Write-Host "[moxi-exp] 完成。以后双击桌面「墨戏生花」即可打开。" -ForegroundColor Green
Write-Host "[moxi-exp] 命令行启动： dsh --profile $Profile"
Write-Host "[moxi-exp] 数据目录： $env:USERPROFILE\\Documents\\Moxi\\projects"
`, 'utf8')

await fs.writeFile(join(distRoot, 'install-exp.cmd'), `@echo off
REM 墨戏生花 · 实验版安装（双击运行）
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-exp.ps1" %*
if errorlevel 1 (
  echo.
  echo 安装失败，请把上面的错误信息发给提供者。
  pause
  exit /b 1
)
echo.
echo 安装完成。启动命令：dsh --profile moxi-exp
pause
`, 'utf8')

/* ---------------- 8. 打 tarball ---------------- */
const tarballsDir = join(distRoot, 'tarballs')
mkdirSync(tarballsDir, { recursive: true })
for (const name of ['moxi-core', 'moxi-canvas', 'moxi-admin']) {
  const cwd = join(pkgRoot, name)
  execFileSync('npm', ['pack', '--pack-destination', tarballsDir, '--silent'], { cwd, stdio: 'pipe' })
  log(`tarball ${name}`)
}
rmSync(distTmp, { recursive: true, force: true })

/* ---------------- 9. 汇总 ---------------- */
const list = (await fs.readdir(tarballsDir)).sort()
let total = 0
for (const f of list) total += (await fs.stat(join(tarballsDir, f))).size
const archiveName = join(distRoot, `moxi-studio-exp-${VERSION}.tar.gz`)
execFileSync('tar', ['czf', archiveName, '-C', distRoot, '.'], { stdio: 'pipe' })
const archiveBytes = (await fs.stat(archiveName)).size
// Windows 友好：额外产出 zip（排除已打的 tar.gz，避免自我嵌套）
const zipName = join(repoRoot, 'dist', `moxi-studio-exp-${VERSION}.zip`)
execFileSync('zip', ['-qr', zipName, '.', '-x', '*.tar.gz'], { cwd: distRoot, stdio: 'pipe' })
await fs.rename(zipName, join(distRoot, `moxi-studio-exp-${VERSION}.zip`)).catch(() => {})
log(`zip: moxi-studio-exp-${VERSION}.zip (${((await fs.stat(join(distRoot, `moxi-studio-exp-${VERSION}.zip`))).size / 1024 / 1024).toFixed(1)} MB)`)
log(`tarballs: ${list.join(', ')}`)
log(`安装包: ${relative(repoRoot, archiveName)} (${(archiveBytes / 1024 / 1024).toFixed(1)} MB)`)
log(`版本 ${VERSION} · 开源（MIT）· 安装包`)
