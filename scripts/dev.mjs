// Dev runner: API with --watch on 4317, Vite on 5477 proxying /api.
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const children = []

function run(label, args) {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })
  child.on('exit', (code) => {
    console.log(`[dev] ${label} exited (${code ?? 0})`)
    stop()
  })
  children.push(child)
  return child
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

run('api', ['--watch', join('server', 'index.mjs')])
run('web', [join('node_modules', 'vite', 'bin', 'vite.js')])
