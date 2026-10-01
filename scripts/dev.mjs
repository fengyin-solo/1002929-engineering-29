#!/usr/bin/env node
/**
 * 本地开发固定动作（零第三方依赖，仅用 Node >= 18 内置模块）。
 *
 *   node scripts/dev.mjs prepare [backend|frontend]
 *       按锁文件安装依赖。已装且与锁文件一致则直接跳过（幂等，不会重复装出第二份）；
 *       缺锁文件时先生成锁文件再按锁文件装。任一步失败立即停下并打印“从缺的那一步续装”的命令。
 *
 *   node scripts/dev.mjs doctor
 *       只检查、不改动：工具链 / 锁文件 / 依赖是否装好 / 端口占用 / 后端连通，逐项报清楚。
 *
 *   node scripts/dev.mjs preflight backend
 *   node scripts/dev.mjs preflight frontend
 *       起服务前的闸门：依赖没装好、端口被占、（前端）后端连不通，就非零退出并说明缺哪一步。
 *
 *   node scripts/dev.mjs print <key>
 *       打印唯一事实源 config/local-dev.json 解析后的值，供其它入口（shell/docker）取同一份配置。
 *       key: backend.host backend.port frontend.host frontend.port
 *            backend.url frontend.url health.url proxy.target
 *
 * 环境变量：
 *   DEV_CONFIG=path            指定另一份配置文件
 *   BACKEND_HOST/PORT、FRONTEND_HOST/PORT  覆盖配置里的对应字段
 *   SKIP_DEV_CONFIG=1          不读取配置文件（容器内使用，回退到内置默认值）
 *   SKIP_DEV_PREFLIGHT=1       跳过 preflight（容器内使用）
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = join(ROOT, 'frontend')
const BACKEND = join(ROOT, 'backend')
const CONFIG_PATH = process.env.DEV_CONFIG
  ? process.env.DEV_CONFIG
  : join(ROOT, 'config', 'local-dev.json')

// ---------- 输出 ----------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const ok = (s) => console.log(`${c('32', '✓')} ${s}`)
const info = (s) => console.log(`${c('36', '→')} ${s}`)
const fail = (s) => console.log(`${c('31', '✗')} ${s}`)
const step = (n, s) => console.log(`\n${c('1;33', `第 ${n} 步：${s}`)}`)
const die = (resumeCmd, ...lines) => {
  console.log(`\n${c('1;31', '已停下，没有继续。')}`)
  lines.forEach((l) => console.log(`  ${l}`))
  if (resumeCmd) console.log(`\n修好后从这一步接着跑：${c('1;32', resumeCmd)}`)
  process.exit(1)
}

// ---------- 配置：唯一事实源 ----------
function loadConfig({ allowFallback = false } = {}) {
  const defaults = {
    backend: { host: '127.0.0.1', port: 8000 },
    frontend: { host: '127.0.0.1', port: 5173 },
    healthPath: '/api/health',
    proxyPath: '/api',
  }
  if (process.env.SKIP_DEV_CONFIG === '1') {
    return { ...defaults, __source: '内置默认值（SKIP_DEV_CONFIG=1）' }
  }
  if (!existsSync(CONFIG_PATH)) {
    if (allowFallback) return { ...defaults, __source: `默认值（找不到 ${CONFIG_PATH}）` }
    die(
      null,
      `找不到唯一事实源配置：${CONFIG_PATH}`,
      '该文件应随仓库一起提交；也可用 DEV_CONFIG=/path/to.json 指定另一份。',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    die(null, `配置文件不是合法 JSON：${CONFIG_PATH}`, String(e.message || e))
  }
  const num = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined
  }
  const cfg = {
    backend: {
      host: process.env.BACKEND_HOST || parsed.backend?.host || defaults.backend.host,
      port: num(process.env.BACKEND_PORT) || num(parsed.backend?.port) || defaults.backend.port,
    },
    frontend: {
      host: process.env.FRONTEND_HOST || parsed.frontend?.host || defaults.frontend.host,
      port: num(process.env.FRONTEND_PORT) || num(parsed.frontend?.port) || defaults.frontend.port,
    },
    healthPath: parsed.healthPath || defaults.healthPath,
    proxyPath: parsed.proxyPath || defaults.proxyPath,
    __source: CONFIG_PATH,
  }
  return cfg
}

// 浏览器/探针访问用的主机名：监听 0.0.0.0 时，客户端仍应连 127.0.0.1
const clientHost = (h) => (h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h)
const cfgUrls = (cfg) => {
  const b = `http://${clientHost(cfg.backend.host)}:${cfg.backend.port}`
  const f = `http://${clientHost(cfg.frontend.host)}:${cfg.frontend.port}`
  return {
    backendUrl: b,
    frontendUrl: f,
    healthUrl: `${b}${cfg.healthPath}`,
    proxyTarget: b,
  }
}

// ---------- 小工具 ----------
function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'command', ['-v', cmd], {
    shell: true,
    encoding: 'utf8',
  })
  return r.status === 0
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts })
  if (r.error) return { status: 127, error: r.error }
  return { status: r.status ?? 1 }
}
function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
function portFree(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const srv = createServer()
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      try { srv.close() } catch { /* ignore */ }
      resolve(v)
    }
    srv.once('error', () => done(false))
    srv.listen(port, host, () => done(true))
    setTimeout(() => done(null), timeoutMs)
  })
}
async function httpOk(url, timeoutMs = 2000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return false
    const body = await res.json().catch(() => null)
    return body && body.ok === true
  } catch {
    clearTimeout(t)
    return false
  }
}
async function waitForHttp(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs
  let last = 0
  while (Date.now() < deadline) {
    if (await httpOk(url, 1500)) return true
    await new Promise((r) => setTimeout(r, 500))
    last += 1
  }
  return false
}
// 尽力找出占用端口的进程，仅用于报错提示
function portPidHint(port) {
  const cmds = [
    ['lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t']],
    ['ss', ['-ltnp', `sport = :${port}`]],
    ['netstat', ['-ltnp']],
  ]
  for (const [cmd, args] of cmds) {
    if (!which(cmd)) continue
    const r = runCapture(cmd, args)
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split('\n').slice(0, 3).join(' | ')
  }
  return ''
}

// ---------- 后端依赖 ----------
const VENV_DIR = join(BACKEND, '.venv')
const venvPython = () =>
  process.platform === 'win32'
    ? join(VENV_DIR, 'Scripts', 'python.exe')
    : join(VENV_DIR, 'bin', 'python')
const BACKEND_LOCK = join(BACKEND, 'requirements.lock')
const BACKEND_REQ = join(BACKEND, 'requirements.txt')
const BACKEND_MARKER = join(VENV_DIR, '.install-state')

function venvWorks() {
  if (!existsSync(venvPython())) return false
  const r = runCapture(venvPython(), ['-c', 'import sys; print(sys.version.split()[0])'])
  return r.status === 0 && !!r.stdout.trim()
}
async function backendDepsOk() {
  if (!venvWorks()) return false
  const r = runCapture(venvPython(), ['-c', 'import fastapi, uvicorn; print("ok")'])
  return r.status === 0 && r.stdout.trim() === 'ok'
}
function backendMarkerValid() {
  if (!venvWorks() || !existsSync(BACKEND_MARKER)) return false
  const lockFile = existsSync(BACKEND_LOCK) ? BACKEND_LOCK : BACKEND_REQ
  const expect = `${sha256(lockFile)}  ${lockFile.split('/').pop()}`
  return readFileSync(BACKEND_MARKER, 'utf8').trim() === expect
}
async function prepareBackend() {
  step(1, '后端依赖（Python 虚拟环境，按 requirements.lock 安装）')
  if (!which('python3')) die('node scripts/dev.mjs prepare backend', '未找到 python3，请先安装 Python 3.10+。')

  // venv 坏了（比如在别的系统上建的、解释器路径失效）直接重建，而不是带着坏环境往下走
  if (existsSync(VENV_DIR) && !venvWorks()) {
    info('.venv 已失效（解释器不可用，多半是在另一台机器上拷贝来的），删除重建')
    rmSync(VENV_DIR, { recursive: true, force: true })
  }
  if (!existsSync(VENV_DIR)) {
    info('创建虚拟环境 backend/.venv')
    let r = run('python3', ['-m', 'venv', '.venv'], { cwd: BACKEND })
    if (r.status !== 0) {
      // 精简系统（如 Debian 未装 python3-venv）带不带 pip 都建不了时，
      // 退回 --without-pip，再用官方 get-pip.py 引导，无需 root。
      info('常规 venv 创建失败，改用 --without-pip + get-pip.py 引导')
      r = run('python3', ['-m', 'venv', '--without-pip', '.venv'], { cwd: BACKEND })
      if (r.status !== 0) die('node scripts/dev.mjs prepare backend', 'python3 -m venv 创建虚拟环境失败，请安装 Python 3.10+（Debian/Ubuntu 可装 python3-venv）。')
      const getPip = join(VENV_DIR, 'get-pip.py')
      const dl = runCapture(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '-fsSL', 'https://bootstrap.pypa.io/get-pip.py', '-o', getPip,
      ])
      if (dl.status !== 0) {
        die('node scripts/dev.mjs prepare backend', '下载 get-pip.py 失败（需要网络）；或安装系统包 python3-venv 后重跑。')
      }
      r = run(venvPython(), [getPip])
      try { rmSync(getPip) } catch { /* ignore */ }
      if (r.status !== 0) die('node scripts/dev.mjs prepare backend', '用 get-pip.py 引导 pip 失败。')
    }
  }
  // 没有锁文件：先按 requirements.txt 装，再把实际解析出的精确版本冻结成锁文件
  if (!existsSync(BACKEND_LOCK)) {
    info('未发现 requirements.lock，先按 requirements.txt 安装')
    let r = run(venvPython(), ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: BACKEND })
    if (r.status !== 0) die('node scripts/dev.mjs prepare backend', 'pip 安装 requirements.txt 失败（检查网络/源）。')
    const fr = runCapture(venvPython(), ['-m', 'pip', 'freeze'])
    if (fr.status !== 0 || !fr.stdout.trim()) {
      die('node scripts/dev.mjs prepare backend', 'pip freeze 失败，无法生成 requirements.lock。')
    }
    writeFileSync(BACKEND_LOCK, fr.stdout.replace(/\r/g, ''))
    ok(`已生成锁文件 backend/requirements.lock（${fr.stdout.trim().split('\n').length} 个包，已提交，全机一致）`)
  } else if (!backendMarkerValid() || !(await backendDepsOk())) {
    info('按锁文件 requirements.lock 精确安装')
    const r = run(venvPython(), ['-m', 'pip', 'install', '-r', 'requirements.lock'], { cwd: BACKEND })
    if (r.status !== 0) {
      die('node scripts/dev.mjs prepare backend', '按 requirements.lock 安装失败；网络恢复后重跑本命令即可续装，已装的包不会重复下载。')
    }
  } else {
    ok('后端依赖已按锁文件装好，跳过')
    return
  }
  if (!(await backendDepsOk())) die('node scripts/dev.mjs prepare backend', '依赖装完仍无法 import fastapi/uvicorn，环境不完整。')
  writeFileSync(BACKEND_MARKER, `${sha256(BACKEND_LOCK)}  requirements.lock\n`)
  ok('后端依赖就绪')
}

// ---------- 前端依赖 ----------
const FE_LOCK = join(FRONTEND, 'package-lock.json')
const FE_PKG = join(FRONTEND, 'package.json')
const FE_MARKER = join(FRONTEND, 'node_modules', '.install-state')
function frontendDepsOk() {
  return ['node_modules/vue/package.json', 'node_modules/vite/package.json', 'node_modules/vue-router/package.json']
    .every((p) => existsSync(join(FRONTEND, p)))
}
function feMarkerValid() {
  if (!existsSync(FE_MARKER) || !existsSync(FE_LOCK)) return false
  return readFileSync(FE_MARKER, 'utf8').trim() === `${sha256(FE_LOCK)}  package-lock.json`
}
async function prepareFrontend() {
  step(existsSync(BACKEND) ? 2 : 1, '前端依赖（npm，按 package-lock.json 安装）')
  if (!which('npm')) die('node scripts/dev.mjs prepare frontend', '未找到 npm，请先安装 Node.js 18+。')

  if (!existsSync(FE_LOCK)) {
    info('未发现 package-lock.json，仅根据 package.json 解析生成锁文件（不碰 node_modules）')
    let r = run('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: FRONTEND })
    if (r.status !== 0) die('node scripts/dev.mjs prepare frontend', '生成 package-lock.json 失败（检查网络/registry）。')
  }
  if (feMarkerValid() && frontendDepsOk()) {
    ok('前端依赖已按锁文件装好，跳过')
    return
  }
  info('按锁文件执行 npm ci（node_modules 与锁不一致时整体对齐，不会留下新旧两套包）')
  const r = run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: FRONTEND })
  if (r.status !== 0) {
    die('node scripts/dev.mjs prepare frontend', 'npm ci 失败；修好网络后重跑本命令即可从这里续装。')
  }
  if (!frontendDepsOk()) die('node scripts/dev.mjs prepare frontend', 'npm ci 结束但关键依赖仍缺失。')
  writeFileSync(FE_MARKER, `${sha256(FE_LOCK)}  package-lock.json\n`)
  ok('前端依赖就绪')
}

// ---------- doctor ----------
function checkManifest() {
  const problems = []
  const manifest = join(FRONTEND, 'src', 'nav', 'manifest.ts')
  if (!existsSync(manifest)) {
    problems.push('缺 src/nav/manifest.ts（菜单与路由的唯一清单）')
    return problems
  }
  const text = readFileSync(manifest, 'utf8')
  const entries = [...text.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])
  if (new Set(entries).size !== entries.length) problems.push('清单中存在重复 path')
  if (!entries.includes('/')) problems.push("清单缺少首页 '/'")
  const views = [...text.matchAll(/view:\s*'([^']+)'/g)].map((m) => m[1])
  for (const v of views) {
    const file = v === 'Dashboard' ? join(FRONTEND, 'src', 'views', `${v}.vue`)
      : join(FRONTEND, 'src', 'views', v, 'index.vue')
    if (!existsSync(file)) problems.push(`清单引用了不存在的页面：${file.replace(ROOT + '/', '')}`)
  }
  return problems
}
async function doctor() {
  const cfg = loadConfig()
  const u = cfgUrls(cfg)
  console.log(c('1', `配置来源：${cfg.__source}`))
  console.log(`  后端 ${u.backendUrl}   前端 ${u.frontendUrl}   健康检查 ${u.healthUrl}`)

  let bad = 0
  const check = async (name, fn) => {
    try {
      const r = await fn()
      if (r === true || r?.ok) ok(name)
      else { bad++; fail(`${name}${r?.msg ? '：' + r.msg : ''}`) }
    } catch (e) { bad++; fail(`${name}：${e.message || e}`) }
  }

  step(1, '工具链')
  await check('node >= 18', () => {
    if (!which('node')) return { ok: false, msg: '未安装 Node.js' }
    const major = Number(runCapture('node', ['-v']).stdout.replace(/^v/, '').split('.')[0])
    return major >= 18 ? true : { ok: false, msg: `Node 版本过低（${major}），需要 18+` }
  })
  await check('npm', () => (which('npm') ? true : { ok: false, msg: '未找到 npm' }))
  await check('python3 >= 3.10', () => {
    if (!which('python3')) return { ok: false, msg: '未找到 python3' }
    const v = runCapture('python3', ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])']).stdout.trim()
    const [maj, min] = v.split('.').map(Number)
    return maj > 3 || (maj === 3 && min >= 10) ? true : { ok: false, msg: `Python ${v} 过低，需要 3.10+` }
  })

  step(2, '锁文件')
  await check('backend/requirements.lock 已提交', () =>
    existsSync(BACKEND_LOCK) ? true : { ok: false, msg: '不存在，prepare 时会生成，生成后请提交' })
  await check('frontend/package-lock.json 已提交', () =>
    existsSync(FE_LOCK) ? true : { ok: false, msg: '不存在，prepare 时会生成，生成后请提交' })

  step(3, '依赖是否已按锁文件装好')
  await check('后端 .venv 可导入 fastapi/uvicorn', async () =>
    ((await backendDepsOk()) ? true : { ok: false, msg: '未装好，执行 node scripts/dev.mjs prepare backend' }))
  await check('后端安装标记与锁文件一致', () =>
    (backendMarkerValid() ? true : { ok: false, msg: '锁文件已更新或未安装，重跑 prepare backend 即可' }))
  await check('前端 node_modules 关键包就位', () =>
    (frontendDepsOk() ? true : { ok: false, msg: '未装好，执行 node scripts/dev.mjs prepare frontend' }))
  await check('前端安装标记与锁文件一致', () =>
    (feMarkerValid() ? true : { ok: false, msg: '锁文件已更新或未安装，重跑 prepare frontend 即可' }))

  step(4, '菜单清单（导航与路由的唯一来源）')
  const manifestProblems = checkManifest()
  if (manifestProblems.length === 0) ok('manifest 条目 path 唯一、引用页面都存在')
  else manifestProblems.forEach((p) => { bad++; fail(p) })

  step(5, '端口与后端连通')
  const bpFree = await portFree(cfg.backend.host, cfg.backend.port)
  const bpHealth = await httpOk(u.healthUrl)
  if (bpHealth) ok(`后端端口 ${cfg.backend.port} 已被本服务占用且健康检查通过（服务已在跑）`)
  else if (bpFree) ok(`后端端口 ${cfg.backend.port} 空闲`)
  else { bad++; fail(`后端端口 ${cfg.backend.port} 被占用且不是本服务${portPidHint(cfg.backend.port) ? '（' + portPidHint(cfg.backend.port) + '）' : ''}`) }

  const fpFree = await portFree(cfg.frontend.host, cfg.frontend.port)
  if (fpFree) ok(`前端端口 ${cfg.frontend.port} 空闲`)
  else { bad++; fail(`前端端口 ${cfg.frontend.port} 被占用${portPidHint(cfg.frontend.port) ? '（' + portPidHint(cfg.frontend.port) + '）' : ''}`) }

  if (bpFree || bpHealth) {
    if (bpHealth) ok(`后端连通：GET ${u.healthUrl} 返回 ok`)
    else info(`后端当前未启动，起来后应可访问 GET ${u.healthUrl}`)
  } else {
    bad++
    fail(`后端端口被占且健康检查不通：GET ${u.healthUrl}`)
  }

  console.log(bad === 0 ? `\n${c('32', '全部检查通过。')}` : `\n${c('1;31', `${bad} 项未通过，按上面的提示补齐后可从断点续装。`)}`)
  process.exit(bad === 0 ? 0 : 1)
}

// ---------- preflight（起服务前的闸门） ----------
async function preflightBackend() {
  const cfg = loadConfig()
  const u = cfgUrls(cfg)
  const problems = []
  if (!(await backendDepsOk())) {
    problems.push('后端依赖没装好')
  }
  const free = await portFree(cfg.backend.host, cfg.backend.port)
  if (free === false) {
    if (await httpOk(u.healthUrl)) {
      problems.push(`后端已经在 ${u.backendUrl} 跑着了，不用再起一遍；要重启请先停掉占用 ${cfg.backend.port} 端口的进程`)
    } else {
      const hint = portPidHint(cfg.backend.port)
      problems.push(`端口 ${cfg.backend.port} 已被其它程序占用${hint ? '（' + hint + '）' : ''}：释放端口，或在 config/local-dev.json 改 backend.port 后两处自动同步`)
    }
  }
  finishPreflight(problems)
}
async function preflightFrontend() {
  const cfg = loadConfig()
  const u = cfgUrls(cfg)
  const problems = []
  if (!frontendDepsOk()) problems.push('前端依赖没装好')
  const free = await portFree(cfg.frontend.host, cfg.frontend.port)
  if (free === false) {
    const served = await httpOk(u.frontendUrl).catch(() => false)
    problems.push(served
      ? `前端 dev server 已在 ${u.frontendUrl} 运行，不要重复启动`
      : `端口 ${cfg.frontend.port} 已被其它程序占用：释放端口，或在 config/local-dev.json 改 frontend.port 后两处自动同步`)
  }
  if (!(await backendDepsOk())) {
    problems.push('后端依赖也没装好（前端起来也拿不到数据）')
  }
  if (!(await waitForHttp(u.healthUrl, 3000))) {
    problems.push(`后端连不通：GET ${u.healthUrl} 没有返回 ok——请另开一个终端先跑「make backend」（或 node scripts/dev.mjs prepare backend && make backend）`)
  }
  finishPreflight(problems)
}
function finishPreflight(problems) {
  if (problems.length === 0) {
    ok('预检通过，可以起服务')
    process.exit(0)
  }
  console.log(`\n${c('1;31', '预检未过，已停止启动。缺的步骤：')}`)
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
  console.log(`\n补齐依赖从断点续装：${c('1;32', 'node scripts/dev.mjs prepare')}（或 ${c('1;32', 'make install')}）`)
  console.log(`只复查不改动：${c('1;32', 'node scripts/dev.mjs doctor')}（或 ${c('1;32', 'make check')}）`)
  process.exit(1)
}

// ---------- print（供其它入口取同一份配置） ----------
function printValue(key) {
  const cfg = loadConfig({ allowFallback: true })
  const u = cfgUrls(cfg)
  const table = {
    'backend.host': cfg.backend.host,
    'backend.port': cfg.backend.port,
    'frontend.host': cfg.frontend.host,
    'frontend.port': cfg.frontend.port,
    'backend.url': u.backendUrl,
    'frontend.url': u.frontendUrl,
    'health.url': u.healthUrl,
    'proxy.target': u.proxyTarget,
    'health.path': cfg.healthPath,
    'proxy.path': cfg.proxyPath,
  }
  if (!(key in table)) die(null, `未知配置键：${key}`, `可选：${Object.keys(table).join(', ')}`)
  process.stdout.write(String(table[key]))
}

// ---------- 入口 ----------
const [cmd, arg] = process.argv.slice(2)
if (process.env.SKIP_DEV_PREFLIGHT === '1' && cmd === 'preflight') {
  info('已设置 SKIP_DEV_PREFLIGHT=1，跳过预检')
  process.exit(0)
}
switch (cmd) {
  case 'prepare':
    if (!arg || arg === 'all') {
      await prepareBackend()
      await prepareFrontend()
      console.log(`\n${c('32', '依赖全部就绪。')} 起后端 make backend，起前端 make frontend`)
    } else if (arg === 'backend') await prepareBackend()
    else if (arg === 'frontend') await prepareFrontend()
    else die(null, `未知目标：${arg}（可选 backend | frontend）`)
    break
  case 'doctor':
    await doctor()
    break
  case 'preflight':
    if (arg === 'backend') await preflightBackend()
    else if (arg === 'frontend') await preflightFrontend()
    else die(null, '用法：node scripts/dev.mjs preflight <backend|frontend>')
    break
  case 'print':
    if (!arg) die(null, '用法：node scripts/dev.mjs print <key>')
    printValue(arg)
    break
  default:
    console.log('用法: node scripts/dev.mjs <prepare|doctor|preflight|print> [参数]')
    process.exit(cmd ? 1 : 0)
}
