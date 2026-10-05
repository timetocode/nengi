import { runClientHistoryProfile, HistoryScenario, HistoryValueShape } from './ClientHistoryWorkload'

const scenarios: HistoryScenario[] = ['stationary', 'sparse', 'dense', 'churn', 'ecs', 'selective']
const scenario = process.env.PROFILE_SCENARIO ?? 'sparse'
const phase = process.env.PROFILE_PHASE ?? 'prune'
const valueShape = process.env.PROFILE_VALUE_SHAPE ?? 'scalar'
const sampling = process.env.PROFILE_SAMPLING ?? 'allocate'
const selection = process.env.PROFILE_SELECTION ?? 'stable'
const entityHistory = process.env.PROFILE_ENTITY_HISTORY ?? 'on'
if (!scenarios.includes(scenario as HistoryScenario) || (phase !== 'prune' && phase !== 'sample')) {
    throw new Error(`Expected scenario ${scenarios.join('|')} and phase prune|sample.`)
}
if (valueShape !== 'scalar' && valueShape !== 'mutable') {
    throw new Error('Expected PROFILE_VALUE_SHAPE scalar|mutable.')
}
if (sampling !== 'allocate' && sampling !== 'reuse') throw new Error('Expected PROFILE_SAMPLING allocate|reuse.')
if (selection !== 'stable' && selection !== 'rotating') throw new Error('Expected PROFILE_SELECTION stable|rotating.')
if (entityHistory !== 'on' && entityHistory !== 'off') throw new Error('Expected PROFILE_ENTITY_HISTORY on|off.')
if (selection === 'rotating' && scenario !== 'selective') throw new Error('Rotating selection requires PROFILE_SCENARIO=selective.')
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
    valueShape: valueShape as HistoryValueShape,
    sampling,
    selection,
    entities: positiveInteger('PROFILE_ENTITIES'),
    historyFrames: positiveInteger('PROFILE_HISTORY_FRAMES'),
    entityHistory: entityHistory === 'on',
    warmup: positiveInteger('PROFILE_WARMUP'),
    iterations: positiveInteger('PROFILE_ITERATIONS'),
    collectGarbage: global.gc,
    heapUsed: () => process.memoryUsage().heapUsed
})
console.log(JSON.stringify({ runtime: process.version, explicitGc: typeof global.gc === 'function', ...result }))
