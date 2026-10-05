import { Binary } from '../common/binary/Binary'
import { Context } from '../common/Context'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import { Client } from '../client/Client'
import { EntityHistory } from '../client/EntityHistory'
import { FixedStepInterpolator } from '../client/FixedStepInterpolator'
import { InterpolationOutput } from '../client/InterpolationOutput'
import { Snapshot } from '../client/Snapshot'

export type HistoryScenario = 'stationary' | 'sparse' | 'dense' | 'churn' | 'ecs' | 'selective'
export type HistoryValueShape = 'scalar' | 'mutable'
export type HistoryProfileOptions = {
    scenario: HistoryScenario
    phase: 'prune' | 'sample'
    valueShape?: HistoryValueShape
    sampling?: 'allocate' | 'reuse'
    selection?: 'stable' | 'rotating'
    entities?: number
    historyFrames?: number
    entityHistory?: boolean
    warmup?: number
    iterations?: number
    collectGarbage?: () => void
    heapUsed?: () => number
}

// No transport participates: these profiles isolate receive-side state/history
// and sampling. All data comes through the real EntityStore frame application.
class ProfileAdapter {
    binary: any
    readonly clientAdapterVersion = 2 as const
    open() {}
    send() {}
    close() {}
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
    const valueShape = options.valueShape ?? 'scalar'
    const sampling = options.sampling ?? 'allocate'
    const selection = options.selection ?? 'stable'
    const entityHistory = options.entityHistory ?? true
    if (phase === 'sample' && !entityHistory) throw new Error('Sampling requires entity history.')
    const mutable = valueShape === 'mutable'
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
        label: Binary.String,
        ...(mutable ? {
            position: { type: Binary.Vector3, interp: true },
            bytes: Binary.UInt8Array
        } : {})
    }))
    const client = new Client(context, ProfileAdapter, 20, undefined, { entityHistory })
    client.network.maxFrameHistory = historyFrames
    const history = client.network.store.history
    const interpolator = phase === 'sample' ? new FixedStepInterpolator(client) : null
    const mutableValues = (nid: number, tick: number) => ({
        position: { x: tick, y: nid, z: tick + nid },
        bytes: new Uint8Array(64).fill(tick % 256)
    })
    const entity = (nid: number, tick: number) => ({
        nid, ntype: 1, x: tick, y: nid, health: 100, label: 'state',
        ...(mutable ? mutableValues(nid, tick) : {})
    })
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
                    if (mutable) {
                        const values = mutableValues(nid, tick)
                        channel.updateEntities.push(
                            { nid, prop: 'position', value: values.position },
                            { nid, prop: 'bytes', value: values.bytes }
                        )
                    }
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
        const output = new InterpolationOutput()
        // Three render samples per server frame: 60 Hz rendering, 20 Hz receive.
        // Fixed history lets sampling cost stay separate from frame application.
        const sample = (i: number) => {
            if (selection === 'rotating') {
                for (let j = 0; j < selected.length; j++) {
                    const index = (i * 50 + j) % population
                    selected[j] = ecs ? componentId(index, 0) : rootId(index)
                }
            }
            interpolator!.resetTimeline()
            const now = warmupFrames * 50
            interpolator!.getSampleDiagnostics(100, now)
            const start = performance.now()
            const sampleTime = now + (i % 3) * (1000 / 60)
            const result = sampling === 'reuse'
                ? interpolator!.sampleEntitiesInto(scenario === 'selective' ? selected : history.timelines.keys(), output, 100, sampleTime)
                : scenario === 'selective'
                    ? interpolator!.sampleEntities(selected, 100, sampleTime)
                    : interpolator!.sample(100, sampleTime)
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
        scenario, phase, valueShape, sampling, selection, population, components, fraction, historyFrames, entityHistory, warmup, iterations,
        serverHz: 20, renderHz: 60, elapsedMs: distribution(costs),
        pruneMs: pruneCosts.length ? distribution(pruneCosts) : null,
        history: history.getStats(), expirationIndex: indexStats(history),
        retainedHeapBefore, heapBeforeFinalGc, retainedHeapAfter, checksum
    }
}
