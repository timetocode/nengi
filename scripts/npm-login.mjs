import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registry = 'https://registry.npmjs.org/'

function isWsl() {
    if (process.platform !== 'linux') {
        return false
    }
    try {
        return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'))
    } catch {
        return false
    }
}

const env = { ...process.env }
if (isWsl() && !env.BROWSER) {
    env.BROWSER = path.join(root, 'scripts', 'open-windows-browser.mjs')
}

const login = spawnSync(
    'npm',
    ['login', '--auth-type=web', '--registry', registry],
    { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' }
)
if (login.status !== 0) {
    process.exit(login.status ?? 1)
}

const whoami = spawnSync(
    'npm',
    ['whoami', '--registry', registry],
    { cwd: root, env, encoding: 'utf8', shell: process.platform === 'win32' }
)
if (whoami.status !== 0) {
    process.stderr.write(whoami.stdout ?? '')
    process.stderr.write(whoami.stderr ?? '')
    process.exit(whoami.status ?? 1)
}

console.log(`Authenticated as ${whoami.stdout.trim()}.`)
