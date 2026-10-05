import assert from 'node:assert/strict'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { Historian2D } from '../server/Historian2D'
import { Historian3D } from '../server/Historian3D'

type Body = { nid: number, x: number, y: number, z: number, radius: number }
type History = Historian2D | Historian3D

function bodies(count: number, span: number): Body[] {
    let seed = 412
    const coordinate = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 2 ** 32 * span - span / 2
    }
    return Array.from({ length: count }, (_, i) => ({ nid: i + 1, x: coordinate(), y: coordinate(), z: coordinate(), radius: 10 }))
}

function createHistory(dimensions: number, indexed: boolean, population: Body[]) {
    const options = { retentionMs: 200, spatialIndex: indexed ? { type: 'grid' as const, cellSize: 64 } : 'none' as const }
    const history = dimensions === 2 ? new Historian2D(options) : new Historian3D(options)
    for (const body of population) {
        if (history instanceof Historian2D) history.trackSpatial(body, { nid: 'nid', x: 'x', y: 'y', radius: 'radius' }, 0)
        else history.trackSpatial(body, { nid: 'nid', x: 'x', y: 'y', z: 'z', radius: 'radius' }, 0)
    }
    return history
}

function ray(history: History, body: Body, length: number) {
    return history instanceof Historian2D
        ? history.queryRayNearest(0, body.x - 20, body.y - 20, body.x + length, body.y + length)
        : history.queryRayNearest(0, body.x - 20, body.y - 20, body.z - 20, body.x + length, body.y + length, body.z + length)
}

function measure(run: () => number, warmup: number, trials: number, operations = 1) {
    warmup = Number(process.env.PROFILE_WARMUP ?? warmup)
    trials = Number(process.env.PROFILE_TRIALS ?? trials)
    assert.ok(Number.isInteger(warmup) && warmup >= 0)
    assert.ok(Number.isInteger(trials) && trials > 0)
    for (let i = 0; i < warmup; i++) run()
    const samples: number[] = []
    let checksum = 0
    for (let i = 0; i < trials; i++) {
        const start = performance.now()
        checksum += run()
        samples.push((performance.now() - start) / operations)
    }
    const sorted = samples.slice().sort((a, b) => a - b)
    return {
        warmup, trials, operationsPerTrial: operations, checksum,
        meanMs: samples.reduce((total, value) => total + value, 0) / trials,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
        samplesMs: samples
    }
}

function recordCase(dimensions: number, count: number, span: number, oversized: boolean, indexed: boolean) {
    const population = bodies(count, span)
    if (oversized) population[0].radius = dimensions === 2 ? 8192 : 1024
    const history = createHistory(dimensions, indexed, population)
    let tick = 0
    const result = measure(() => {
        history.record(++tick, tick * 50)
        return population.length
    }, oversized ? 2 : 20, oversized ? 7 : 60)
    const stats = history.getStats()
    assert.equal(stats.retainedSamples, stats.frames * count)
    assert.equal(history.getSpatialNearest(1, tick * 50)?.radius, population[0].radius)
    const query = history instanceof Historian2D
        ? history.queryCircleNearest(tick * 50, population[0].x, population[0].y, 1)
        : history.querySphereNearest(tick * 50, population[0].x, population[0].y, population[0].z, 1)
    assert.ok(query.some(sample => sample.nid === 1))
    return { dimensions, name: oversized ? 'record-oversized' : span === 128 ? 'record-dense' : 'record-spread', count, span, indexed, retainedIndexCells: stats.retainedIndexCells, ...result }
}

function queryCase(dimensions: number, count: number, span: number, long: boolean, indexed: boolean) {
    const population = bodies(count, span)
    const history = createHistory(dimensions, indexed, population)
    const scan = createHistory(dimensions, false, population)
    history.record(1, 0)
    scan.record(1, 0)
    const length = long ? dimensions === 2 ? 300000 : 10000 : 80
    const batch = long ? 1 : 128
    const hitIds = (h: History, body: Body) => ray(h, body, length).map(hit => hit.sample.nid).sort((a, b) => a - b)
    for (let i = 0; i < batch; i++) assert.deepEqual(hitIds(history, population[i % count]), hitIds(scan, population[i % count]))
    const result = measure(() => {
        let hits = 0
        for (let i = 0; i < batch; i++) hits += ray(history, population[i % count], length).length
        return hits
    }, long ? 1 : 5, long ? 3 : 15, batch)
    return { dimensions, name: long ? 'query-long' : span === 128 ? 'query-dense' : 'query-local', count, span, indexed, rayLengthPerAxis: length + 20, retainedIndexCells: history.getStats().retainedIndexCells, ...result }
}

const results = []
function selected(name: string, dimensions: number, count: number, indexed: boolean) {
    return !process.env.PROFILE_CASE || process.env.PROFILE_CASE === `${name}:${dimensions}:${count}:${indexed ? 'grid' : 'scan'}`
}
for (const dimensions of [2, 3]) {
    for (const indexed of [false, true]) {
        if (selected('record-spread', dimensions, 3000, indexed)) results.push(recordCase(dimensions, 3000, 20000, false, indexed))
        if (selected('record-dense', dimensions, 3000, indexed)) results.push(recordCase(dimensions, 3000, 128, false, indexed))
        if (selected('record-oversized', dimensions, 300, indexed)) results.push(recordCase(dimensions, 300, 2000, true, indexed))
        if (selected('query-local', dimensions, 12, indexed)) results.push(queryCase(dimensions, 12, 2000, false, indexed))
        if (selected('query-local', dimensions, 3000, indexed)) results.push(queryCase(dimensions, 3000, 20000, false, indexed))
        if (selected('query-dense', dimensions, 3000, indexed)) results.push(queryCase(dimensions, 3000, 128, false, indexed))
        if (selected('query-long', dimensions, 300, indexed)) results.push(queryCase(dimensions, 300, 2000, true, indexed))
    }
}
assert.ok(results.length > 0, 'PROFILE_CASE did not match a historian workload')
console.log(JSON.stringify({
    date: new Date().toISOString(), cpu: cpus()[0]?.model, node: process.version,
    scope: 'Tracked sample recording with 200ms retention, and nearest ray query batches. No sockets, snapshot replication, physics, input validation or renderer. Setup and hit-set/retention checks are outside timing. Query percentiles describe batch averages; no GC/allocation-rate claim.',
    results
}, null, 2))
