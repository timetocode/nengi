import { Binary } from '../common/binary/Binary'
import { Context } from '../common/Context'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import { Client } from '../client/Client'
import { EntityHistory } from '../client/EntityHistory'
import { FixedStepInterpolator } from '../client/FixedStepInterpolator'
import { Snapshot } from '../client/Snapshot'

export type HistoryScenario = 'stationary' | 'sparse' | 'dense' | 'churn' | 'ecs' | 'selective'
export type HistoryProfileOptions = {
    scenario: HistoryScenario
    phase: 'prune' | 'sample'
    entities?: number
    historyFrames?: number
    warmup?: number
    iterations?: number
    collectGarbage?: () => void
    heapUsed?: () => number
}

// No transport participates: these profiles isolate receive-side state/history
// and sampling. All data comes through the real EntityStore frame application.
class ProfileAdapter {
    binary: any
    connect() { return Promise.resolve({ accepted: true }) }
    flush() { /* No outbound work in this profile. */ }
}

function distribution(values: number[]) {
    const sorted = values.slice().sort((a, b) => a - b)
    return {
        p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
        p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
        p99: sorted[Math.floor((sorted.length - 1) * 0.99)],
        max: sorted[sorted.length - 1]
    }
}

function indexStats(history: EntityHistory) {
    // Profile-only inspection, deliberately absent from the public API. A
    // baseline checkout without this index reports zero metadata entries.
    const index = (history as any).expirationNids as Map<number, { count: number }> | undefined
    let ids = 0
    index?.forEach(bucket => { ids += bucket.count })
    return { frames: index?.size ?? 0, ids }
}

export function runClientHistoryProfile(options: HistoryProfileOptions) {
    const { scenario, phase } = options
    const population = options.entities ?? (scenario === 'dense' || scenario === 'ecs' ? 10000 : 50000)
    const historyFrames = options.historyFrames ?? 240
    const warmup = options.warmup ?? 60
    const iterations = options.iterations ?? 120
    const ecs = scenario === 'ecs'
    const components = ecs ? 3 : 1
    const fraction = scenario === 'stationary' ? 0 : scenario === 'dense' ? 1 : 0.01
    const changed = Math.max(scenario === 'stationary' ? 0 : 1, Math.floor(population * fraction))
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: { type: Binary.Float64, interp: true },
        y: { type: Binary.Float64, interp: true },
        health: Binary.UInt16,
        label: Binary.String
    }))
    const client = new Client(context, ProfileAdapter, 20)
    client.network.maxFrameHistory = historyFrames
    const history = client.network.store.history
    const interpolator = new FixedStepInterpolator(client)
    const entity = (nid: number, tick: number) => ({ nid, ntype: 1, x: tick, y: nid, health: 100, label: 'state' })
    const rootId = (i: number) => 100 + i * (components + 1)
    const componentId = (i: number, component: number) => rootId(i) + component + 1
    const costs: number[] = []
    const pruneCosts: number[] = []
    let measuring = false
    let checksum = 0
    const originalPrune = history.pruneBefore.bind(history)
    history.pruneBefore = tick => {
        const start = performance.now()
        originalPrune(tick)
        if (measuring) pruneCosts.push(performance.now() - start)
    }
    const snapshotAt = (tick: number): Snapshot => {
        const channel = {
            channelId: 1, messages: [], interpolatedMessages: [],
            createEntities: [] as any[], updateEntities: [] as any[], deleteEntities: [] as number[],
            updateEntityGroups: [], ecsCreateEntities: [] as number[], ecsCreateComponents: [] as any[],
            ecsDeleteEntities: [] as number[]
        }
        const opens = tick === 1 || (scenario === 'churn' && tick % 60 === 1)
        const count = opens ? population : changed
        for (let i = 0; i < count; i++) {
            const index = opens ? i : ((tick - 2) * changed + i) % population
            if (opens) {
                if (ecs) channel.ecsCreateEntities.push(rootId(index))
                for (let component = 0; component < components; component++) {
                    const nid = ecs ? componentId(index, component) : rootId(index)
                    if (ecs) channel.ecsCreateComponents.push({ ...entity(nid, tick), pid: rootId(index) })
                    else channel.createEntities.push(entity(nid, tick))
                }
            } else if (scenario === 'churn') {
                // Alternating deletion/recreation reuses the same IDs without
                // pretending that a same-channel create-before-delete is valid.
                const pairIndex = (Math.floor((tick - 2) / 2) * changed + i) % population
                if (tick % 2 === 0) channel.deleteEntities.push(rootId(pairIndex))
                else channel.createEntities.push(entity(rootId(pairIndex), tick))
            } else {
                for (let component = 0; component < components; component++) {
                    const nid = ecs ? componentId(index, component) : rootId(index)
                    channel.updateEntities.push({ nid, prop: 'x', value: tick }, { nid, prop: 'y', value: tick + nid })
                }
            }
        }
        return {
            serverTimeMs: tick * 50, confirmedCommandFrameNumber: -1, messages: [],
            createEntities: [], updateEntities: [], deleteEntities: [], channels: [channel],
            channelOpens: opens ? [{ channelId: 1, header: createChannelHeader(1, ecs ? ChannelType.EcsChannel : ChannelType.Channel) }] : [],
            channelCloses: opens && tick > 1 ? [{ channelId: 1 }] : []
        }
    }
    const apply = (tick: number) => {
        const snapshot = snapshotAt(tick)
        client.network.queueSnapshot(snapshot, tick * 50)
        const start = performance.now()
        const frame = client.network.processNextFrame()!
        if (measuring) costs.push(performance.now() - start)
        checksum += frame.tick
    }
    const warmupFrames = historyFrames + warmup
    for (let tick = 1; tick <= warmupFrames; tick++) apply(tick)
    options.collectGarbage?.()
    const retainedHeapBefore = options.heapUsed?.() ?? null
    if (phase === 'prune') {
        measuring = true
        for (let i = 1; i <= iterations; i++) apply(warmupFrames + i)
    } else {
        const selected = Array.from({ length: Math.min(500, population) }, (_, i) => ecs ? componentId(i, 0) : rootId(i))
        // Three render samples per server frame: 60 Hz rendering, 20 Hz receive.
        // Fixed history lets sampling cost stay separate from frame application.
        const sample = (i: number) => {
            interpolator.resetTimeline()
            const now = warmupFrames * 50
            interpolator.getSampleDiagnostics(100, now)
            const start = performance.now()
            const result = scenario === 'selective'
                ? interpolator.sampleEntities(selected, 100, now + (i % 3) * (1000 / 60))
                : interpolator.sample(100, now + (i % 3) * (1000 / 60))
            checksum += result.entities.size
            return performance.now() - start
        }
        for (let i = 0; i < warmup; i++) sample(i)
        options.collectGarbage?.()
        for (let i = 0; i < iterations; i++) costs.push(sample(i))
    }
    const heapBeforeFinalGc = options.heapUsed?.() ?? null
    options.collectGarbage?.()
    const retainedHeapAfter = options.heapUsed?.() ?? null
    return {
        scenario, phase, population, components, fraction, historyFrames, warmup, iterations,
        serverHz: 20, renderHz: 60, elapsedMs: distribution(costs),
        pruneMs: pruneCosts.length ? distribution(pruneCosts) : null,
        history: history.getStats(), expirationIndex: indexStats(history),
        retainedHeapBefore, heapBeforeFinalGc, retainedHeapAfter, checksum
    }
}
