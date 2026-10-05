import { PerformanceObserver, performance } from 'node:perf_hooks'
import { Binary } from '../common/binary/Binary'
import { BinaryAdapter } from '../common/binary/BinaryAdapter'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Client } from '../client/Client'
import { Instance } from '../server/Instance'
import { User } from '../server/User'
import { ManualChannel } from '../server/channel/ManualChannel'
import { testBinaryAdapter } from '../testSupport/BufferBinary'

function positiveInteger(name: string, fallback: number) {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
    return value
}

async function main() {
    const population = positiveInteger('PROFILE_ENTITIES', 65)
    const moving = positiveInteger('PROFILE_MOVING', population)
    if (moving > population) throw new Error('PROFILE_MOVING must not exceed PROFILE_ENTITIES.')
    const warmup = positiveInteger('PROFILE_WARMUP', 1000)
    const iterations = positiveInteger('PROFILE_ITERATIONS', 5000)
    const historyOption = process.env.PROFILE_ENTITY_HISTORY ?? 'on'
    if (historyOption !== 'on' && historyOption !== 'off') throw new Error('Expected PROFILE_ENTITY_HISTORY on|off.')
    const entityHistory = historyOption === 'on'
    // Use the same backend in every comparison, preferably the official Buffer
    // backend. Capture/encoding is outside the measured client-only interval.
    const binary: BinaryAdapter<Buffer, Buffer> = process.env.PROFILE_BINARY_MODULE
        ? (await import(process.env.PROFILE_BINARY_MODULE)).bufferBinary
        : testBinaryAdapter
    if (!binary) throw new Error('PROFILE_BINARY_MODULE must export bufferBinary.')
    const context = new Context()
    const schema = defineEntitySchema({
        x: Binary.Float64, y: Binary.Float64, angle: Binary.Float64,
        vx: Binary.Float64, vy: Binary.Float64, angularVelocity: Binary.Float64,
        $options: { updateGroups: { pose: ['x', 'y', 'angle'], velocity: ['vx', 'vy', 'angularVelocity'] } }
    })
    context.register(1, schema)
    const instance = new Instance(context, { now: () => 0 })
    const packets: Buffer[] = []
    const user = new User(undefined, {
        binary,
        send: (_user: User, payload: Buffer) => { packets.push(payload) },
        disconnect: () => {}
    } as any)
    user.id = 1
    user.instance = instance
    user.lastPingSentAtMs = 0
    instance.connectedUsers.set(user.id, user)
    const channel = new ManualChannel(instance.localState)
    channel.subscribe(user)
    const bodies = Array.from({ length: population }, (_, i) => channel.addEntity({
        nid: 0, ntype: 1, x: i, y: i, angle: 0, vx: 0, vy: 0, angularVelocity: 0
    }))
    const writes = channel.createEntityWriter(1, schema)
    instance.step()
    for (const value of [1, 2]) {
        for (let i = 0; i < moving; i++) {
            writes.groups.pose(bodies[i], i + value, i + value * 2, value / 8)
            writes.groups.velocity(bodies[i], value, value * 2, value / 16)
        }
        instance.step()
    }
    if (packets.length !== 3) throw new Error('Expected one create and two update packets.')
    class ProfileAdapter {
        readonly clientAdapterVersion = 2 as const
        readonly binary = binary
        open() {}
        send() {}
        close() {}
    }
    const client = new Client(context, ProfileAdapter, 60, undefined, { entityHistory, now: () => 0 })
    const apply = (payload: Buffer) => {
        client.network.readSnapshot(binary.createReader(payload))
        return client.network.processNextFrame()!
    }
    apply(packets[0])
    for (let i = 0; i < warmup; i++) apply(packets[1 + i % 2])
    global.gc?.()
    await new Promise<void>(resolve => setImmediate(resolve))
    const retainedHeapBefore = process.memoryUsage().heapUsed
    const costs = new Array<number>(iterations)
    const gc: { start: number, duration: number }[] = []
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) gc.push({ start: entry.startTime, duration: entry.duration })
    })
    observer.observe({ entryTypes: ['gc'] })
    const measuredStart = performance.now()
    let checksum = 0
    for (let i = 0; i < iterations; i++) {
        const payload = packets[1 + (warmup + i) % 2]
        const start = performance.now()
        const frame = apply(payload)
        costs[i] = performance.now() - start
        checksum += frame.channels.reduce((count, channel) => count + channel.updateEntities.length, 0)
    }
    const measuredEnd = performance.now()
    const heapBeforeFinalGc = process.memoryUsage().heapUsed
    // GC entries arrive asynchronously. Filter by the measured interval so
    // explicit collections and setup are never presented as receive cost.
    await new Promise<void>(resolve => setImmediate(resolve))
    await new Promise<void>(resolve => setImmediate(resolve))
    observer.disconnect()
    global.gc?.()
    const retainedHeapAfter = process.memoryUsage().heapUsed
    const observedGc = gc.filter(entry => entry.start >= measuredStart && entry.start < measuredEnd)
    const value = 1 + (warmup + iterations - 1) % 2
    for (let i = 0; i < population; i++) {
        const body = client.network.store.get(bodies[i].nid)!
        const expected = i < moving ? value : 0
        if (body.x !== i + expected || body.y !== i + 2 * expected || body.angle !== expected / 8 ||
            body.vx !== expected || body.vy !== 2 * expected || body.angularVelocity !== expected / 16) {
            throw new Error(`Incorrect decoded body ${i}.`)
        }
    }
    if (checksum !== moving * 6 * iterations) throw new Error('Missing applied field changes.')
    const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length
    costs.sort((a, b) => a - b)
    console.log(JSON.stringify({
        runtime: process.version,
        binary: process.env.PROFILE_BINARY_MODULE ?? 'testBinaryAdapter',
        explicitGc: typeof global.gc === 'function',
        population, moving, warmup, iterations, entityHistory,
        groupsPerPublication: moving * 2,
        updatePacketBytes: packets[1].byteLength,
        elapsedMs: {
            mean, p50: costs[Math.floor(costs.length * 0.5)],
            p95: costs[Math.floor(costs.length * 0.95)], p99: costs[Math.floor(costs.length * 0.99)]
        },
        gc: { count: observedGc.length, durationMs: observedGc.reduce((sum, entry) => sum + entry.duration, 0) },
        history: client.network.store.history.getStats(),
        retainedHeapBefore, heapBeforeFinalGc, retainedHeapAfter, checksum
    }))
}

void main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
