import { runClientHistoryProfile, HistoryScenario } from './ClientHistoryWorkload'

const scenarios: HistoryScenario[] = ['stationary', 'sparse', 'dense', 'churn', 'ecs', 'selective']
const scenario = process.env.PROFILE_SCENARIO ?? 'sparse'
const phase = process.env.PROFILE_PHASE ?? 'prune'
if (!scenarios.includes(scenario as HistoryScenario) || (phase !== 'prune' && phase !== 'sample')) {
    throw new Error(`Expected scenario ${scenarios.join('|')} and phase prune|sample.`)
}
function positiveInteger(name: string) {
    const value = process.env[name]
    if (value === undefined) return undefined
    const number = Number(value)
    if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer.`)
    return number
}
const result = runClientHistoryProfile({
    scenario: scenario as HistoryScenario,
    phase,
    entities: positiveInteger('PROFILE_ENTITIES'),
    historyFrames: positiveInteger('PROFILE_HISTORY_FRAMES'),
    warmup: positiveInteger('PROFILE_WARMUP'),
    iterations: positiveInteger('PROFILE_ITERATIONS'),
    collectGarbage: global.gc,
    heapUsed: () => process.memoryUsage().heapUsed
})
console.log(JSON.stringify({ runtime: process.version, explicitGc: typeof global.gc === 'function', ...result }))
