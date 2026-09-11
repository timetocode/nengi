import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
// Use the bundler already required by the package's tsx development runtime.
const { buildSync } = createRequire(require.resolve('tsx/package.json'))('esbuild')
const chromium = process.env.PROFILE_CHROMIUM_PATH
if (!chromium) throw new Error('Set PROFILE_CHROMIUM_PATH to a local Chromium executable.')
const sourceRoot = path.resolve(process.env.PROFILE_SOURCE_ROOT ?? root)
const scenario = process.env.PROFILE_SCENARIO ?? 'sparse'
const phase = process.env.PROFILE_PHASE ?? 'prune'
if (!['stationary', 'sparse', 'dense', 'churn', 'ecs', 'selective'].includes(scenario) || !['prune', 'sample'].includes(phase)) {
    throw new Error('Invalid PROFILE_SCENARIO or PROFILE_PHASE.')
}
function positiveInteger(name) {
    if (process.env[name] === undefined) return undefined
    const value = Number(process.env[name])
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
    return value
}
const options = {
    scenario, phase,
    entities: positiveInteger('PROFILE_ENTITIES'),
    historyFrames: positiveInteger('PROFILE_HISTORY_FRAMES'),
    warmup: positiveInteger('PROFILE_WARMUP'),
    iterations: positiveInteger('PROFILE_ITERATIONS')
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nengi-history-browser-'))
let browser
try {
    buildSync({
        entryPoints: [path.join(sourceRoot, 'src/performance/ClientHistoryWorkload.ts')],
        outfile: path.join(scratch, 'workload.js'), bundle: true, platform: 'browser',
        format: 'iife', globalName: 'HistoryProfile'
    })
    browser = spawn(chromium, [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--disable-background-networking', '--disable-component-update',
        '--disable-extensions', '--disable-sync', '--remote-debugging-pipe',
        '--enable-precise-memory-info', '--js-flags=--expose-gc',
        `--user-data-dir=${path.join(scratch, 'profile')}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
    let stderr = ''
    browser.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    let sequence = 0
    let pendingText = ''
    const pending = new Map()
    const fail = error => { for (const request of pending.values()) request.reject(error) }
    browser.on('error', fail)
    browser.on('exit', code => fail(new Error(`Chromium exited (${code}): ${stderr}`)))
    browser.stdio[4].on('data', chunk => {
        pendingText += chunk.toString()
        let end
        while ((end = pendingText.indexOf('\0')) !== -1) {
            const message = JSON.parse(pendingText.slice(0, end))
            pendingText = pendingText.slice(end + 1)
            const request = pending.get(message.id)
            if (request) {
                pending.delete(message.id)
                if (message.error) request.reject(new Error(JSON.stringify(message.error)))
                else request.resolve(message.result)
            }
        }
    })
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++sequence
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)) }, 180000)
        pending.set(id, {
            resolve: value => { clearTimeout(timer); resolve(value) },
            reject: error => { clearTimeout(timer); reject(error) }
        })
        browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0')
    })
    const version = await call('Browser.getVersion')
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
    const bundle = fs.readFileSync(path.join(scratch, 'workload.js'), 'utf8')
    const result = await call('Runtime.evaluate', {
        expression: `${bundle}\nJSON.stringify({ explicitGc: typeof globalThis.gc === 'function', ...HistoryProfile.runClientHistoryProfile({
            ...${JSON.stringify(options)}, collectGarbage: globalThis.gc,
            heapUsed: () => performance.memory.usedJSHeapSize
        }) })`,
        returnByValue: true
    }, sessionId)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    console.log(JSON.stringify({ runtime: version.product, ...JSON.parse(result.result.value) }))
    await call('Browser.close')
} finally {
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
        browser.kill()
        await new Promise(resolve => browser.once('exit', resolve))
    }
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
