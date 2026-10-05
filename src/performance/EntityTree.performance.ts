import assert from 'node:assert/strict'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { LocalState } from '../server/LocalState'

type Scenario = {
    name: string
    count: number
    existing: number
    depth: number
    cached: boolean
    remove: boolean
}

const scenarios: Scenario[] = [
    ...[64, 512, 4096].map(count => ({
        name: `attach-${count}`, count, existing: 0, depth: 0, cached: false, remove: false
    })),
    { name: 'cached-4096-add-64', count: 64, existing: 4096, depth: 0, cached: true, remove: false },
    { name: 'nested-16-add-512', count: 512, existing: 0, depth: 16, cached: true, remove: false },
    { name: 'remove-4096', count: 4096, existing: 0, depth: 0, cached: true, remove: true }
]

function run(scenario: Scenario, instrument = false) {
    const state = new LocalState()
    const root = { nid: 0, ntype: 1 }
    state.registerEntity(root, 123)
    let parent = root
    for (let i = 0; i < scenario.depth; i++) {
        parent = state.addChild(parent, { nid: 0, ntype: 1 })
    }
    for (let i = 0; i < scenario.existing; i++) {
        state.addChild(parent, { nid: 0, ntype: 2 })
    }
    const children = Array.from({ length: scenario.count }, () => ({ nid: 0, ntype: 2 }))
    if (scenario.remove) {
        for (const child of children) state.addChild(parent, child)
    }
    if (scenario.cached) {
        state.getEntityTree(root.nid)
        state.getEntityTreeDeletes(root.nid)
        state.getEntityTree(parent.nid)
        state.getEntityTreeDeletes(parent.nid)
    }

    // Count traversals on a separate disposable instance, outside timing runs.
    let visits = 0
    if (instrument) {
        const diagnostic = state as unknown as { invalidateEntityTreeSubtree(nid: number): void }
        const original = diagnostic.invalidateEntityTreeSubtree
        diagnostic.invalidateEntityTreeSubtree = function (nid) {
            visits++
            original.call(this, nid)
        }
    }
    const start = performance.now()
    if (scenario.remove) state.unregisterEntity(root, 123)
    else for (const child of children) state.addChild(parent, child)
    const ms = performance.now() - start

    // Construction, cache population, and verification are outside the interval.
    if (scenario.remove) {
        assert.equal(state._entities.size, 0)
        assert.ok(children.every(child => child.nid === 0))
    } else {
        const tree = state.getEntityTree(root.nid)
        assert.equal(tree.length, 1 + scenario.depth + scenario.existing + scenario.count)
        assert.equal(new Set(tree).size, tree.length)
        assert.equal(state.getEntityTreeDeletes(root.nid).at(-1), root.nid)
        assert.ok(children.every(child => state.getRootNid(child.nid) === root.nid))
    }
    return { ms, visits }
}

const trials = Number(process.env.PROFILE_TRIALS || 7)
const warmup = Number(process.env.PROFILE_WARMUP || 2)
assert.ok(Number.isInteger(trials) && trials > 0)
assert.ok(Number.isInteger(warmup) && warmup >= 0)
const results = scenarios.map(scenario => {
    for (let i = 0; i < warmup; i++) run(scenario)
    const samples = Array.from({ length: trials }, () => run(scenario).ms)
    const sorted = samples.slice().sort((a, b) => a - b)
    return {
        ...scenario,
        samplesMs: samples,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        invalidationVisits: run(scenario, true).visits
    }
})

console.log(JSON.stringify({
    date: new Date().toISOString(),
    cpu: cpus()[0]?.model,
    node: process.version,
    trials,
    warmup,
    scope: 'Preallocated child attachment or root removal only. Setup, cache population and verification excluded. No snapshots, sockets, physics or GC claims. Traversal counts use separate untimed diagnostic instances.',
    results
}, null, 2))
