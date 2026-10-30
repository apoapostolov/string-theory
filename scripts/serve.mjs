#!/usr/bin/env node
// One server, two modes, one URL.
//
//   node scripts/serve.mjs              start in the configured mode
//   node scripts/serve.mjs --mode dev   override for this run
//   node scripts/serve.mjs status       what is running right now
//   node scripts/serve.mjs stop         stop the supervisor and its children
//   node scripts/serve.mjs restart      stop, then start again
//   node scripts/serve.mjs mode prod    write the mode the launcher will use
//   node scripts/serve.mjs open         open the browser, starting the server if needed
//
// dev  : Vite on 4317 with hot reload, API on 4318 behind the /api proxy.
// prod : this script starts the API server alone, serving dist/ and /api on 4317.
//
// The port is deliberately the same in both modes: banner, bookmark and attention
// do not have to change when the app is built for real.

import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_FILE = join(ROOT, 'serve.config.json')
const DATA_DIR = process.env.ST_DATA_DIR ? resolve(process.env.ST_DATA_DIR) : join(ROOT, 'data')
const LOG_FILE = join(DATA_DIR, 'server.log')
const PID_FILE = join(DATA_DIR, 'serve.pid')
const MAX_LOG_BYTES = 5 * 1024 * 1024

const WEB_PORT = Number(process.env.ST_WEB_PORT ?? 4317)
const DEV_API_PORT = Number(process.env.ST_DEV_API_PORT ?? 4318)
const URL_BASE = `http://127.0.0.1:${WEB_PORT}`
const HEALTH_URL = `${URL_BASE}/api/health`

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const command = argv.find((arg) => !arg.startsWith('-')) ?? 'start'
const flagMode = argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : undefined

// ---------------------------------------------------------------- config + log

const DEFAULTS = { mode: 'dev', open: false }

function readConfig() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch }
  writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

function rotateLog() {
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      renameSync(LOG_FILE, LOG_FILE.replace(/\.log$/, '.1.log'))
    }
  } catch {
    /* rotation is best effort */
  }
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`
  process.stdout.write(`${line}\n`)
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    rotateLog()
    appendFileSync(LOG_FILE, `${line}\n`)
  } catch {
    /* the console still has it */
  }
}

function logChunk(name, chunk) {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    log(`[${name}] ${line}`)
  }
}

// ---------------------------------------------------------------- probing

async function probe(timeoutMs = 1200) {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return { reachable: true, ours: false, status: response.status }
    const body = await response.json()
    return { reachable: true, ours: body?.ok === true, version: body?.version, dataDir: body?.dataDir }
  } catch (error) {
    return { reachable: false, ours: false, refused: error?.cause?.code === 'ECONNREFUSED' }
  }
}

function readPid() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killTree(pid) {
  if (!pid) return
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
}

function killPort(port) {
  const script = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
}

function openBrowser() {
  log(`opening ${URL_BASE}`)
  spawn('cmd', ['/c', 'start', '', URL_BASE], { windowsHide: true, detached: true, stdio: 'ignore' }).unref()
}

// Starting a supervisor from a console would hold the shell (and, worse, die
// with it), so restarts go through the same hidden launcher the logon task uses.
const HIDDEN_LAUNCHER = join(ROOT, 'scripts', 'serve-hidden.vbs')

function launchDetached(extraArgs = []) {
  log(`launching the supervisor detached (${['dev', 'prod'].includes(extraArgs[0]) ? extraArgs[0] : 'config mode'})`)
  spawn('wscript.exe', [HIDDEN_LAUNCHER, ...extraArgs], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref()
}

// ---------------------------------------------------------------- commands

async function status() {
  const config = readConfig()
  const pid = readPid()
  const health = await probe()
  const running = alive(pid) || health.ours
  const apiPort = config.mode === 'prod' ? WEB_PORT : DEV_API_PORT

  log(`mode      ${config.mode}`)
  log(`url       ${URL_BASE}`)
  log(`api       ${apiPort}${config.mode === 'dev' ? ' (behind the Vite /api proxy)' : ' (serving dist/)'}`)
  log(`pid       ${pid ?? 'none'}${pid && !alive(pid) ? ' (stale)' : ''}`)
  log(`health    ${health.ours ? `ok, version ${health.version}` : health.reachable ? 'port answers, not String Theory' : 'down'}`)
  log(`log       ${LOG_FILE}`)
  log(`running   ${running ? 'yes' : 'no'}`)
  if (!running) process.exitCode = 1
}

async function stop() {
  const pid = readPid()
  const health = await probe(800)
  if (!pid && !health.ours && !health.reachable) {
    log('not running')
    try {
      unlinkSync(PID_FILE)
    } catch {
      /* nothing to clean */
    }
    return
  }

  if (alive(pid)) {
    log(`stopping supervisor ${pid}`)
    killTree(pid)
  }
  // Anything still holding the ports is a leftover child or a stray npm start.
  killPort(WEB_PORT)
  killPort(DEV_API_PORT)

  try {
    unlinkSync(PID_FILE)
  } catch {
    /* already gone */
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const check = await probe(400)
    if (!check.reachable) {
      log('stopped')
      return
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  log('warning: something still answers on the port')
}

// ---------------------------------------------------------------- supervisor

const children = new Map()
let stopping = false
let backoff = 500

function startChild(name, args, env, onReady) {
  if (stopping) return
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  children.set(name, child)
  log(`${name} started, pid ${child.pid}`)

  const aliveSince = Date.now()
  child.stdout?.on('data', (chunk) => logChunk(name, chunk))
  child.stderr?.on('data', (chunk) => logChunk(name, chunk))

  child.on('error', (error) => log(`${name} failed to spawn: ${error.message}`))

  child.on('exit', (code, signal) => {
    children.delete(name)
    if (stopping) return
    const lived = Date.now() - aliveSince
    if (lived > 30_000) backoff = 500
    const wait = backoff
    backoff = Math.min(backoff * 2, 10_000)
    log(`${name} exited (${code ?? signal}) after ${Math.round(lived / 1000)}s, restarting in ${wait}ms`)
    setTimeout(() => startChild(name, args, env, onReady), wait)
  })

  return child
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  log('shutting down')
  for (const [name, child] of children) {
    log(`stopping ${name} ${child.pid}`)
    child.kill()
  }
  setTimeout(() => {
    for (const child of children.values()) {
      if (!child.killed) killTree(child.pid)
    }
    try {
      unlinkSync(PID_FILE)
    } catch {
      /* already gone */
    }
    process.exit(code)
  }, 1500).unref()
}

async function waitReady(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const health = await probe(600)
    if (health.ours) return health
    await new Promise((done) => setTimeout(done, 400))
  }
  return null
}

async function start() {
  const config = readConfig()
  const requested = flagMode ?? process.env.ST_MODE ?? config.mode
  const mode = requested === 'prod' ? 'prod' : 'dev'

  const health = await probe(900)
  if (health.ours) {
    log(`already running on ${URL_BASE} (version ${health.version})`)
    if (flag('open') || config.open) openBrowser()
    return
  }
  if (health.reachable && !health.ours) {
    log(`port ${WEB_PORT} answers but not with a String Theory health payload; refusing to start`)
    process.exit(1)
  }

  if (mode === 'prod' && !existsSync(join(ROOT, 'dist', 'index.html'))) {
    log('prod mode needs a build: run npm run build first')
    process.exit(1)
  }

  stopping = false
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(PID_FILE, String(process.pid))
  log(`supervisor ${process.pid} starting in ${mode} mode on ${URL_BASE}`)

  if (mode === 'dev') {
    startChild('api', ['--watch', join('server', 'index.mjs')], { ST_PORT: String(DEV_API_PORT), ST_MODE: 'dev' })
    startChild('web', [join('node_modules', 'vite', 'bin', 'vite.js')], {
      ST_WEB_PORT: String(WEB_PORT),
      ST_API_PORT: String(DEV_API_PORT)
    })
  } else {
    startChild('api', [join('server', 'index.mjs')], { ST_PORT: String(WEB_PORT), ST_MODE: 'prod' })
  }

  const ready = await waitReady()
  if (ready) log(`ready on ${URL_BASE} (version ${ready.version})`)
  else log('warning: health did not answer within 45s, check the log above')

  if (flag('open') || config.open) openBrowser()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
process.on('uncaughtException', (error) => {
  log(`uncaught: ${error.stack ?? error.message}`)
  shutdown(1)
})

switch (command) {
  case 'status':
    await status()
    break
  case 'stop':
    await stop()
    break
  case 'restart': {
    await stop()
    launchDetached(flagMode ? [flagMode] : [])
    const ready = await waitReady(30_000)
    log(ready ? `ready on ${URL_BASE} (version ${ready.version})` : 'warning: restarted, but health did not answer within 30s')
    break
  }
  case 'mode': {
    const next = argv[1] === 'prod' ? 'prod' : argv[1] === 'dev' ? 'dev' : null
    if (!next) {
      log('usage: node scripts/serve.mjs mode <dev|prod>')
      process.exit(1)
    }
    writeConfig({ mode: next })
    log(`launcher mode set to ${next}. Run: node scripts/serve.mjs restart`)
    break
  }
  case 'open': {
    if (!(await probe(900)).ours) {
      launchDetached(flagMode ? [flagMode] : [])
      const ready = await waitReady(30_000)
      if (!ready) log('warning: the server did not answer; the browser will show a connection error')
    }
    openBrowser()
    break
  }
  case 'start':
  default:
    await start()
}
