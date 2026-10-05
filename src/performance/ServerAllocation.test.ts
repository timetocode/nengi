import { ClientNetwork } from '../client/ClientNetwork'
import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { buildScenario, readConfig } from './SnapshotPipeline.performance'
import createSnapshotBuffer from '../binary/snapshot/createSnapshotBuffer'

function fixture(scenario: Parameters<typeof readConfig>[0], entities = 3) {
    const config = {
        ...readConfig(scenario), users: 2, entities, moveFraction: 0, sharedUpdates: true,
        cellSize: 512, viewHalf: 1024, worldSize: 128, spatialDistribution: 'single-cell'
    }
    const { instance, adapter, users } = buildScenario(config)
    instance.network.snapshotPerformanceEnabled = false
    const channel = users[0].subscriptions.values().next().value as any
    const payloads = new Map<number, Buffer>()
    adapter.send = (user, payload) => { payloads.set(user.id, payload) }
    const clients = users.map(() => new ClientNetwork({
        context: instance.context, serverTickRate: 20,
        predictor: { getErrors: () => ({ entities: new Map() }), cleanUp: () => {} }
    } as any))
    function step() {
        instance.step()
        return clients.map((client, i) => {
            client.readSnapshot(testBinaryAdapter.createReader(payloads.get(users[i].id)!))
            return client.processNextFrame()!
        })
    }
    return { instance, users, clients, channel, step }
}

test.each(['manual-channel-2d', 'manual-channel-3d'] as const)(
    '%s reuses stable membership for update filtering without mutating retained sets', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 2)
        const [parent, other] = channel.entities.array
        const child = { ...parent, nid: 0 }
        instance.attachChild(parent, child)
        const anchor = channel.addEntity({ ...other, nid: 0, x: 600 })
        const writer = channel.createEntityWriter(parent.ntype, instance.context.getSchema(parent.ntype))
        step()
        const original = channel.visibilityStateByUser.get(users[0].id).visibleSet
        const originalNids = [...original]

        // Covers both the same-array fast path and movement between visible cells.
        for (const x of [parent.x + 1, 600]) {
            parent.x = x
            writer.props.x(parent, x)
            const snapshot = channel.getChannelSnapshot(users[0], instance.tick + 1)
            expect(snapshot.toCreate).toEqual([])
            expect(snapshot.toDelete).toEqual([])
            expect(snapshot.group.visibleNidSet).toBe(original)
            step()
            for (const client of clients) expect(client.store.get(parent.nid)!.x).toBe(Math.fround(x))
            expect([...original]).toEqual(originalNids)
        }

        const childNid = child.nid
        instance.detachChild(parent, child)
        step()
        const revised = channel.visibilityStateByUser.get(users[0].id).visibleSet
        expect(revised).not.toBe(original)
        expect(revised.has(childNid)).toBe(false)
        expect([...original]).toEqual(originalNids)
        for (const client of clients) expect(client.store.get(childNid)).toBeUndefined()

        channel.updateView(users[0], {
            x: 5000, y: 5000, z: 5000, halfWidth: 100, halfHeight: 100, halfDepth: 100
        })
        parent.x = 610
        writer.props.x(parent, 610)
        step()
        expect(clients[0].store.entities.size).toBe(0)
        expect(clients[1].store.get(parent.nid)!.x).toBe(610)
        expect([...revised].sort()).toEqual([parent.nid, other.nid, anchor.nid].sort())
        expect([...original]).toEqual(originalNids)
    }
)

test.each(['channel-2d', 'channel-3d', 'manual-channel-2d', 'manual-channel-3d'] as const)(
    '%s preserves subscriber cell versions through failed snapshots and cell recreation', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 2)
        const [parent, other] = channel.entities.array
        const child = { ...parent, nid: 0 }
        instance.attachChild(parent, child)
        step()
        step()
        const originalKey = channel.getRememberedCellKeys(users[0].id)[0]
        const original = channel.getRememberedCellNids(users[0].id, originalKey)
        const originalValues = original.slice()
        expect(channel.getRememberedCellNids(users[1].id, originalKey)).toBe(original)

        parent.x = 600
        channel.moveEntity(parent)
        if (channel.manualCellFragmentChannelMode) {
            channel.createEntityWriter(parent.ntype, instance.context.getSchema(parent.ntype)).props.x(parent, 600)
        }
        const binary = users[0].networkAdapter.binary
        const createWriter = binary.createWriter
        instance.tick++
        instance.cache.createCachesForTick(instance.tick)
        instance.network.resetSharedUpdateFragments()
        binary.createWriter = () => { throw new Error('encoding interrupted') }
        try {
            expect(() => createSnapshotBuffer(users[0], instance)).toThrow('encoding interrupted')
        } finally {
            binary.createWriter = createWriter
        }
        expect(channel.getRememberedCellNids(users[0].id, originalKey)).toBe(original)

        function send(index: number) {
            clients[index].readSnapshot(testBinaryAdapter.createReader(createSnapshotBuffer(users[index], instance)))
            expect(clients[index].processNextFrame()).toBeDefined()
        }
        send(1)
        expect(channel.getRememberedCellNids(users[0].id, originalKey)).toEqual(originalValues)
        expect(channel.getRememberedCellNids(users[1].id, originalKey)).toEqual([other.nid])
        expect(clients[1].store.get(parent.nid)!.x).toBe(600)
        send(0)
        for (const key of channel.getRememberedCellKeys(users[0].id)) {
            expect(channel.getRememberedCellNids(users[0].id, key)).toBe(channel.getRememberedCellNids(users[1].id, key))
        }
        expect(original).toEqual(originalValues)
        instance.cache.deleteCachesForTick(instance.tick)
        step()

        const childNid = child.nid
        instance.detachChild(parent, child)
        step()
        for (const client of clients) expect(client.store.get(childNid)).toBeUndefined()
        const movedKey = channel.getRememberedCellKeys(users[0].id).find((key: string) => key !== originalKey)
        const beforeRecreation = channel.getRememberedCellNids(users[0].id, movedKey)
        const parentNid = parent.nid
        channel.removeEntity(parent)
        step()
        for (const client of clients) expect(client.store.get(parentNid)).toBeUndefined()
        const replacement = { ...other, nid: 0, x: 600 }
        channel.addEntity(replacement)
        step()
        const recreated = channel.getRememberedCellNids(users[0].id, movedKey)
        expect(recreated).toEqual([replacement.nid])
        expect(recreated).not.toBe(beforeRecreation)
        expect(channel.getRememberedCellNids(users[1].id, movedKey)).toBe(recreated)
        for (const client of clients) expect(client.store.get(replacement.nid)!.x).toBe(600)

        channel.unsubscribe(users[1])
        step()
        expect(clients[1].store.entities.size).toBe(0)
        channel.subscribe(users[1], { x: 0, y: 0, z: 0, halfWidth: 1024, halfHeight: 1024, halfDepth: 1024 })
        step()
        expect(clients[1].store.entities.size).toBe(2)
        expect(channel.getRememberedCellNids(users[1].id, movedKey)).toBe(recreated)
    }
)

test.each(['ecs-channel-2d', 'ecs-channel-3d', 'manual-channel-2d', 'manual-channel-3d'] as const)(
    '%s shares an empty scan and invalidates it for later manual writes', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario)
        instance.network.snapshotPerformanceEnabled = true
        step()
        const readLog = jest.spyOn(channel, 'getManualCellUpdateLog')
        step()
        expect(readLog).toHaveBeenCalledTimes(1)

        // Materialize an empty output, then write in the same tick. The prepared
        // group must not hide the new write, even before Instance.step advances.
        channel.createSnapshotOutput(users[0], instance, instance.network.getProtocol())
        const target = channel.ecsCulledChannelMode
            ? channel.getComponent(channel.componentNids[0])
            : channel.entities.array[0]
        const writer = channel.ecsCulledChannelMode
            ? channel.createComponentWriter(target.ntype, instance.context.getSchema(target.ntype))
            : channel.createEntityWriter(target.ntype, instance.context.getSchema(target.ntype))
        target.x = 210
        writer.props.x(target, target.x)
        const updated = channel.createSnapshotOutput(users[0], instance, instance.network.getProtocol())
        expect(updated.stats.updateProps).toBe(1)
        step()
        for (const client of clients) expect(client.store.get(target.nid)!.x).toBe(210)

        readLog.mockClear()
        step()
        expect(readLog).toHaveBeenCalledTimes(1)
        readLog.mockRestore()
    }
)

test.each(['channel-2d', 'channel-3d', 'manual-channel-2d', 'manual-channel-3d'] as const)(
    '%s retains stable remembered cells and refreshes children, recreated cells and subscriptions', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 1)
        step()
        const remembered = channel.rememberedCells.get(users[0].id)
        step()
        expect(channel.rememberedCells.get(users[0].id)).toBe(remembered)

        const parent = channel.entities.array[0]
        const child = { ...parent, nid: 0 }
        channel.prepareVisibilityPlan?.(instance.tick)
        instance.attachChild(parent, child)
        step()
        for (const client of clients) expect(client.store.get(child.nid)).toBeDefined()
        const withChild = channel.rememberedCells.get(users[0].id)
        expect(withChild).not.toBe(remembered)
        const cellKey = channel.getVisibleCellKeys(users[0].id)[0]
        expect(channel.getRememberedCellNids(users[0].id, cellKey)).toContain(child.nid)
        step()
        expect(channel.rememberedCells.get(users[0].id)).toBe(withChild)

        const childNid = child.nid
        channel.prepareVisibilityPlan?.(instance.tick)
        instance.detachChild(parent, child)
        step()
        for (const client of clients) expect(client.store.get(childNid)).toBeUndefined()
        expect(channel.getRememberedCellNids(users[0].id, cellKey)).toEqual([parent.nid])

        // Removing the last root destroys its cell. Reusing the key must still
        // replace the old remembered membership.
        const replacement = { ...parent, nid: 0 }
        channel.removeEntity(parent)
        channel.addEntity(replacement)
        step()
        for (const client of clients) expect([...client.store.entities.keys()]).toEqual([replacement.nid])
        expect(channel.getRememberedCellNids(users[0].id, cellKey)).toEqual([replacement.nid])

        const away = { x: 5000, y: 5000, z: 5000, halfWidth: 100, halfHeight: 100, halfDepth: 100 }
        const home = { ...away, x: replacement.x, y: replacement.y, z: replacement.z }
        channel.updateView(users[0], away)
        step()
        expect(clients[0].store.entities.size).toBe(0)
        expect(clients[1].store.entities.size).toBe(1)
        channel.updateView(users[0], home)
        step()
        expect(clients[0].store.get(replacement.nid)).toBeDefined()
        channel.unsubscribe(users[0])
        step()
        channel.subscribe(users[0], home)
        step()
        expect(clients[0].store.get(replacement.nid)).toBeDefined()
    }
)

test.each(['manual-channel', 'ecs-channel'] as const)('%s sends queued messages after plan-free idle snapshots', scenario => {
    const { instance, users, channel, step } = fixture(scenario)
    instance.context.register(100, defineMessageSchema({ text: Binary.String }))
    step()
    step()
    channel.addMessage({ ntype: 100, text: 'all' })
    users[0].queueChannelMessage(channel.nid, { ntype: 100, text: 'private' })
    users[1].queueChannelInterpolatedMessage(channel.nid, { ntype: 100, text: 'effect' })
    const frames = step()
    expect(frames[0].requireChannel(channel.nid).messages.map(message => message.text)).toEqual(['all', 'private'])
    expect(frames[1].requireChannel(channel.nid).messages.map(message => message.text)).toEqual(['all'])
    expect(frames[1].requireChannel(channel.nid).interpolatedMessages.map(message => message.text)).toEqual(['effect'])
    for (const frame of step()) {
        expect(frame.getChannel(channel.nid)?.messages ?? []).toEqual([])
        expect(frame.getChannel(channel.nid)?.interpolatedMessages ?? []).toEqual([])
    }
})

describe.each([false, true])('stable spatial output, diagnostics=%s', diagnostic => {
    test.each(['channel-2d', 'channel-3d'] as const)('%s still detects mutable values and delivers messages', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 1)
        instance.network.diagnosticBinaryWrites = diagnostic
        instance.context.register(100, defineEntitySchema({
            position: Binary.Vector2,
            bytes: Binary.UInt8Array
        }))
        instance.context.register(101, defineMessageSchema({ text: Binary.String }))
        const parent = channel.entities.array[0]
        const child = { nid: 0, ntype: 100, position: { x: 1, y: 2 }, bytes: new Uint8Array([7]) }
        instance.attachChild(parent, child)
        step()
        step()

        // The cells and hierarchy stay fixed. Only values change, so a stable
        // visibility path must still inspect properties, including child values.
        parent.x = 210
        child.position.x = 15
        child.bytes[0] = 9
        users[0].queueChannelMessage(channel.nid, { ntype: 101, text: 'private' })
        users[1].queueChannelInterpolatedMessage(channel.nid, { ntype: 101, text: 'effect' })
        channel.skipInterpolation(parent)
        const frames = step()
        for (const client of clients) {
            expect(client.store.get(parent.nid)!.x).toBe(210)
            expect(client.store.get(child.nid)!.position).toEqual({ x: 15, y: 2 })
            expect(Array.from(client.store.get(child.nid)!.bytes)).toEqual([9])
        }
        expect(frames[0].requireChannel(channel.nid).messages.map(message => message.text)).toEqual(['private'])
        expect(frames[1].requireChannel(channel.nid).interpolatedMessages.map(message => message.text)).toEqual(['effect'])
        for (const frame of frames) expect(frame.skipInterpolationNids.has(parent.nid)).toBe(true)

        // A returning subscriber needs creates while its peer can keep using
        // the stable path in the same tick.
        channel.unsubscribe(users[1])
        step()
        channel.subscribe(users[1], { x: 210, y: 0, z: 0, halfWidth: 1024, halfHeight: 1024, halfDepth: 1024 })
        child.position.y = 25
        const mixedFrames = step()
        expect(mixedFrames[1].requireChannel(channel.nid).createEntities.map(entity => entity.nid)).toContain(child.nid)
        for (const client of clients) expect(client.store.get(child.nid)!.position).toEqual({ x: 15, y: 25 })
    })
})

test.each(['channel-2d', 'channel-3d'] as const)(
    '%s keeps unchanged views stable during distant cell crossings and additions', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 2)
        const [near, far] = channel.entities.array
        const view = (x: number, halfWidth = 128) => ({
            x, y: 8, z: 8, halfWidth, halfHeight: 128, halfDepth: 128
        })
        for (const [entity, x] of [[near, 8], [far, 4096]]) {
            Object.assign(entity, { x, y: 8, z: 8 })
            channel.moveEntity(entity)
        }
        channel.updateView(users[0], view(8))
        channel.updateView(users[1], view(4096, 1024))
        const child = instance.attachChild(near, { ...near, nid: 0 })
        step()
        const collect = jest.spyOn(channel, 'collectSnapshotVisibility')
        try {
            far.x += 520
            channel.moveEntity(far)
            child.x = 123
            step()
            expect(collect.mock.calls.map(call => call[0])).toEqual([users[1].id])
            expect([...clients[0].store.entities.keys()].sort()).toEqual([near.nid, child.nid].sort())
            expect(clients[0].store.get(child.nid)!.x).toBe(123)
            expect(clients[1].store.get(far.nid)!.x).toBe(far.x)

            collect.mockClear()
            const extra = channel.addEntity({ ...far, nid: 0 })
            near.y = 321
            channel.moveEntity(near)
            step()
            expect(collect.mock.calls.map(call => call[0])).toEqual([users[1].id])
            expect(clients[0].store.get(near.nid)!.y).toBe(321)
            expect(clients[0].store.get(extra.nid)).toBeUndefined()
            expect([...clients[1].store.entities.keys()].sort()).toEqual([far.nid, extra.nid].sort())
        } finally {
            collect.mockRestore()
        }
    }
)

test.each(['channel-2d', 'channel-3d'] as const)(
    '%s detects a different occupant when movement recreates the same visible cell', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 2)
        const [near, replacement] = channel.entities.array
        // Start in a newly created cell, not one left over from fixture setup.
        // A per-cell counter would then repeat revision 1 on recreation.
        const homeX = 1032
        for (const [entity, x] of [[near, homeX], [replacement, 2048]]) {
            Object.assign(entity, { x, y: 8, z: 8 })
            channel.moveEntity(entity)
        }
        for (const user of users) {
            channel.updateView(user, { x: homeX, y: 8, z: 8, halfWidth: 128, halfHeight: 128, halfDepth: 128 })
        }
        const child = instance.attachChild(near, { ...near, nid: 0 })
        step()
        const treeVersion = instance.localState.entityTreeVersion
        const cellKeys = channel.getVisibleCellKeys(users[0].id).slice()

        // No hierarchy invalidation can rescue a stale cell signature here:
        // movement alone empties the cell and refills it with a different root.
        near.x = 2048
        channel.moveEntity(near)
        replacement.x = homeX
        channel.moveEntity(replacement)
        expect(instance.localState.entityTreeVersion).toBe(treeVersion)
        expect(channel.getVisibleCellKeys(users[0].id)).toEqual(cellKeys)
        step()
        for (const client of clients) {
            expect([...client.store.entities.keys()]).toEqual([replacement.nid])
            expect(client.store.get(replacement.nid)!.x).toBe(homeX)
            expect(client.store.get(child.nid)).toBeUndefined()
        }
    }
)

test.each([false, true])('envelopes isolate late queues, initially nonempty=%s', initiallyNonempty => {
    const { instance, users, channel, step } = fixture('ecs-channel')
    instance.context.register(101, defineMessageSchema({ text: Binary.String }))
    step()
    if (initiallyNonempty) {
        users[0].queueMessage({ ntype: 101, text: 'current' })
        users[0].queueInterpolatedMessage({ ntype: 101, text: 'current-effect' })
    }
    const createOutput = channel.createSnapshotOutput.bind(channel)
    let queued = false
    channel.createSnapshotOutput = (user: any, ...args: any[]) => {
        if (user === users[0] && !queued) {
            queued = true
            user.queueMessage({ ntype: 101, text: 'next' })
            user.queueInterpolatedMessage({ ntype: 101, text: 'next-effect' })
        }
        return createOutput(user, ...args)
    }
    const current = step()
    expect(current[0].messages.map(message => message.text)).toEqual(initiallyNonempty ? ['current'] : [])
    expect(current[0].interpolatedMessages.map(message => message.text)).toEqual(initiallyNonempty ? ['current-effect'] : [])
    expect(current[1].messages).toEqual([])
    expect(current[1].interpolatedMessages).toEqual([])
    const next = step()
    expect(next[0].messages.map(message => message.text)).toEqual(['next'])
    expect(next[0].interpolatedMessages.map(message => message.text)).toEqual(['next-effect'])
    for (const frame of step()) {
        expect(frame.messages).toEqual([])
        expect(frame.interpolatedMessages).toEqual([])
    }
})

describe.each([false, true])('manual spatial prepared fragments, shared=%s', shared => {
    test.each(['manual-channel-2d', 'manual-channel-3d'] as const)('%s refreshes writes, widths, membership and cleanup', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 2)
        instance.network.sharedUpdateFragmentsEnabled = shared
        const [parent, other] = channel.entities.array
        const child = { ...parent, nid: 0 }
        instance.attachChild(parent, child)
        step()
        step()
        const writer = channel.createEntityWriter(parent.ntype, instance.context.getSchema(parent.ntype))
        function writeX(entity: any, x: number) {
            entity.x = x
            writer.props.x(entity, x)
        }
        function send(index: number) {
            const buffer = createSnapshotBuffer(users[index], instance)
            clients[index].readSnapshot(testBinaryAdapter.createReader(buffer))
            return clients[index].processNextFrame()!
        }

        writeX(parent, 210)
        writeX(other, 220)
        writeX(child, 211)
        send(0)

        // Width changes in another part of the world must invalidate a cached
        // payload even when this channel's membership and log stay unchanged.
        for (let i = 0; i < 300; i++) instance.localState.nextNetworkId()
        send(1)
        expect(clients[1].store.get(parent.nid)!.x).toBe(210)

        // Coalescing can replace a value without changing the log's length.
        writeX(parent, 340)
        send(1)
        expect(clients[1].store.get(parent.nid)!.x).toBe(340)

        const childNid = child.nid
        const otherNid = other.nid
        instance.detachChild(parent, child)
        channel.removeEntity(other)
        writeX(parent, 350)
        const removed = send(1).requireChannel(channel.nid)
        expect(clients[1].store.get(childNid)).toBeUndefined()
        expect(clients[1].store.get(otherNid)).toBeUndefined()
        expect(clients[1].store.get(parent.nid)!.x).toBe(350)
        expect(removed.updateEntities.some(update => update.nid === childNid || update.nid === otherNid)).toBe(false)

        writeX(parent, 600)
        send(1)
        expect(clients[1].store.get(parent.nid)!.x).toBe(600)
        channel.clearSnapshotDeltas()
        const clean = send(1).getChannel(channel.nid)
        expect(clean?.updateEntities ?? []).toEqual([])
    })
})

describe.each([false, true])('snapshot statistics, shared=%s', shared => {
    test.each(['ecs-channel', 'manual-channel', 'ecs-channel-2d', 'manual-channel-2d'] as const)('%s preserves enabled metrics and state', scenario => {
        const { instance, users, clients, channel, step } = fixture(scenario, 1)
        instance.network.sharedUpdateFragmentsEnabled = shared
        step()
        const target = channel.ecsChannelMode || channel.ecsCulledChannelMode
            ? channel.getComponent(channel.componentNids[0])
            : channel.entities.array[0]
        const schema = instance.context.getSchema(target.ntype)!
        const writer = channel.ecsChannelMode || channel.ecsCulledChannelMode
            ? channel.createComponentWriter(target.ntype, schema)
            : channel.createEntityWriter(target.ntype, schema)
        const group = schema.updateGroups[0]
        const createOutput = channel.createSnapshotOutput.bind(channel)
        const observedStats: any[] = []
        channel.createSnapshotOutput = (...args: any[]) => {
            const output = createOutput(...args)
            observedStats.push(output.stats)
            return output
        }
        for (const metrics of [false, true]) {
            instance.network.snapshotPerformanceEnabled = metrics
            observedStats.length = 0
            target.x += 1
            writer.groups[group.name](target, ...group.props.map(prop => target[prop.prop]))
            step()
            for (const client of clients) expect(client.store.get(target.nid)!.x).toBe(Math.fround(target.x))
            if (metrics) {
                expect(instance.network.snapshotPerformance.snapshots).toBe(users.length)
                expect(instance.network.snapshotPerformance.updateGroupsTotal).toBe(users.length)
                expect(instance.network.snapshotPerformance.groupedUpdatePropsTotal).toBe(users.length * group.props.length)
                expect(observedStats.every(stats => stats.updateGroups === 1)).toBe(true)
            } else {
                expect(instance.network.snapshotPerformance.snapshots).toBe(0)
                expect(observedStats).toEqual([null, null])
            }
        }
    })
})
