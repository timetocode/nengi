import { Buffer } from 'buffer'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ClientNetwork } from '../../client/ClientNetwork'
import { AABB2D } from '../../server/channel/AABB2D'
import { AABB3D } from '../../server/channel/AABB3D'
import { Channel } from '../../server/channel/Channel'
import { ManualChannel } from '../../server/channel/ManualChannel'
import { ManualSpatialChannel2D } from '../../server/channel/ManualSpatialChannel2D'
import { ManualSpatialChannel3D } from '../../server/channel/ManualSpatialChannel3D'
import { SpatialChannel2D } from '../../server/channel/SpatialChannel2D'
import { SpatialChannel3D } from '../../server/channel/SpatialChannel3D'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

enum NType {
    Entity = 1
}

type TestEntity = {
    nid: number
    ntype: NType.Entity
    x: number
    y: number
    z: number
    hp: number
}

type RecordState = {
    entity: TestEntity
    alive: boolean
}

type ObjectChannelUnderTest = {
    nid: number
    addEntity(entity: TestEntity): any
    removeEntity(entity: TestEntity): number
    subscribe(user: User, view?: any): void
    updateView?(user: User, view: any): void
    updateEntity?(entity: TestEntity): void
    createEntityWriter?(ntype: number, schema: any): any
}

type Scenario = {
    context: Context
    instance: Instance
    channel: ObjectChannelUnderTest
    writer: any
    users: User[]
    clients: ClientNetwork[]
    views: any[]
    records: RecordState[]
    visible(entity: TestEntity, view: any): boolean
    move(entity: TestEntity, x: number, y: number, z: number): void
    damage(entity: TestEntity, hp: number): void
}

function createContext() {
    const context = new Context()
    context.register(NType.Entity, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        hp: Binary.UInt16,
        $options: {
            updateGroups: {
                position: ['x', 'y', 'z']
            }
        }
    }))
    return context
}

function createUser(instance: Instance, id: number) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = id
    user.instance = instance
    instance.users.set(user.id, user)
    return user
}

function createClientNetwork(context: Context) {
    const client = {
        context,
        serverTickRate: 20,
        disconnectHandler: jest.fn(),
        websocketErrorHandler: jest.fn(),
        predictor: {
            getErrors: jest.fn(() => ({ entities: new Map() })),
            cleanUp: jest.fn()
        },
        network: undefined as unknown as ClientNetwork
    }
    const network = new ClientNetwork(client as any)
    client.network = network
    return network
}

function lastSentBuffer(user: User) {
    const send = user.networkAdapter.send as jest.Mock
    return send.mock.calls[send.mock.calls.length - 1][1] as Buffer
}

function sorted(values: Iterable<number>) {
    return Array.from(values).sort((a, b) => a - b)
}

function cellCoord(value: number, cellSize: number) {
    return Math.floor(value / cellSize)
}

function cellCoordForEnd(value: number, cellSize: number) {
    return Math.ceil(value / cellSize) - 1
}

function visible2D(entity: TestEntity, view: AABB2D) {
    const cellX = cellCoord(entity.x, 10)
    const cellY = cellCoord(entity.y, 10)
    return cellX >= cellCoord(view.x - view.halfWidth, 10) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, 10) &&
        cellY >= cellCoord(view.y - view.halfHeight, 10) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, 10)
}

function visible3D(entity: TestEntity, view: AABB3D) {
    const cellX = cellCoord(entity.x, 10)
    const cellY = cellCoord(entity.y, 10)
    const cellZ = cellCoord(entity.z, 10)
    return cellX >= cellCoord(view.x - view.halfWidth, 10) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, 10) &&
        cellY >= cellCoord(view.y - view.halfHeight, 10) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, 10) &&
        cellZ >= cellCoord(view.z - view.halfDepth, 10) &&
        cellZ <= cellCoordForEnd(view.z + view.halfDepth, 10)
}

function assertClientMatchesOracle(scenario: Scenario, clientIndex: number) {
    const client = scenario.clients[clientIndex]
    const view = scenario.views[clientIndex]
    const expected: number[] = []

    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i]
        if (!record.alive || !scenario.visible(record.entity, view)) {
            continue
        }
        expected.push(record.entity.nid)
        expect(client.store.get(record.entity.nid)?.x).toBe(record.entity.x)
        expect(client.store.get(record.entity.nid)?.y).toBe(record.entity.y)
        expect(client.store.get(record.entity.nid)?.z).toBe(record.entity.z)
        expect(client.store.get(record.entity.nid)?.hp).toBe(record.entity.hp)
    }

    expect(sorted(client.store.entities.keys())).toEqual(sorted(expected))
    if (client.latestFrame && client.latestFrame.channels.length > 0) {
        expect(client.latestFrame.channels.every(channel => channel.channelId === scenario.channel.nid)).toBe(true)
    }
}

function stepAndAssert(scenario: Scenario) {
    scenario.instance.step()
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])))
        scenario.clients[i].processNextFrame()
        assertClientMatchesOracle(scenario, i)
    }
}

function sentCounts(scenario: Scenario) {
    return scenario.users.map(user => (user.networkAdapter.send as jest.Mock).mock.calls.length)
}

function readAndDrainNewFrames(scenario: Scenario, startCounts: number[]) {
    for (let i = 0; i < scenario.users.length; i++) {
        const send = scenario.users[i].networkAdapter.send as jest.Mock
        for (let j = startCounts[i]; j < send.mock.calls.length; j++) {
            scenario.clients[i].readSnapshot(testBinaryAdapter.createReader(send.mock.calls[j][1] as Buffer))
        }
        expect(scenario.clients[i].drainFrames()).toHaveLength(send.mock.calls.length - startCounts[i])
        assertClientMatchesOracle(scenario, i)
    }
}

function addEntity(scenario: Scenario, x: number, y: number, z: number, hp: number) {
    const entity = scenario.channel.addEntity({ nid: 0, ntype: NType.Entity, x, y, z, hp })
    const record = { entity, alive: true }
    scenario.records.push(record)
    return record
}

function removeEntity(scenario: Scenario, record: RecordState) {
    scenario.channel.removeEntity(record.entity)
    record.alive = false
}

function createRandom(seed: number) {
    let value = seed >>> 0
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0
        return value / 0x100000000
    }
}

function runObjectScenario(scenario: Scenario) {
    const a = addEntity(scenario, 5, 5, 5, 100)
    const b = addEntity(scenario, 105, 5, 5, 200)
    const c = addEntity(scenario, 500, 500, 500, 300)

    stepAndAssert(scenario)

    scenario.views[0].x = 105
    scenario.views[0].y = 5
    scenario.views[0].z = 5
    scenario.channel.updateView?.(scenario.users[0], scenario.views[0])
    stepAndAssert(scenario)

    scenario.move(c.entity, 105, 5, 5)
    scenario.damage(c.entity, 275)
    stepAndAssert(scenario)

    scenario.views[1].x = 500
    scenario.views[1].y = 500
    scenario.views[1].z = 500
    scenario.channel.updateView?.(scenario.users[1], scenario.views[1])
    stepAndAssert(scenario)

    scenario.move(b.entity, 500, 500, 500)
    stepAndAssert(scenario)

    const d = addEntity(scenario, 105, 5, 5, 400)
    scenario.damage(d.entity, 390)
    stepAndAssert(scenario)

    const e = addEntity(scenario, 900, 900, 900, 500)
    stepAndAssert(scenario)

    removeEntity(scenario, c)
    stepAndAssert(scenario)

    removeEntity(scenario, e)
    stepAndAssert(scenario)

    scenario.move(a.entity, 106, 6, 6)
    scenario.damage(a.entity, 90)
    stepAndAssert(scenario)
}

function runDeterministicChurnScenario(scenario: Scenario, options: { spatial: boolean, is3D: boolean }) {
    const random = createRandom(0xfeed1234)
    for (let i = 0; i < 24; i++) {
        addEntity(
            scenario,
            Math.floor(random() * 260) - 40,
            Math.floor(random() * 180) - 40,
            options.is3D ? Math.floor(random() * 160) - 40 : 5,
            1000 + i
        )
    }
    stepAndAssert(scenario)

    for (let tick = 1; tick <= 80; tick++) {
        if (options.spatial) {
            scenario.views[0].x = 20 + ((tick * 9) % 180)
            scenario.views[0].y = 10 + ((tick * 5) % 120)
            scenario.views[1].x = 190 - ((tick * 7) % 180)
            scenario.views[1].y = 110 - ((tick * 3) % 120)
            if (options.is3D) {
                scenario.views[0].z = 10 + ((tick * 4) % 100)
                scenario.views[1].z = 130 - ((tick * 6) % 120)
            }
            scenario.channel.updateView?.(scenario.users[0], scenario.views[0])
            scenario.channel.updateView?.(scenario.users[1], scenario.views[1])
        }

        for (let i = 0; i < scenario.records.length; i++) {
            const record = scenario.records[i]
            if (!record.alive) {
                continue
            }
            if (random() < 0.35) {
                scenario.move(
                    record.entity,
                    Math.floor(random() * 300) - 50,
                    Math.floor(random() * 220) - 50,
                    options.is3D ? Math.floor(random() * 220) - 50 : record.entity.z
                )
            }
            if (random() < 0.45) {
                scenario.damage(record.entity, Math.floor(random() * 5000))
            }
        }

        if (tick % 6 === 0) {
            const x = options.spatial && tick % 12 === 0 ? scenario.views[0].x : Math.floor(random() * 360) - 80
            const y = options.spatial && tick % 12 === 0 ? scenario.views[0].y : Math.floor(random() * 260) - 80
            const z = options.is3D ? (options.spatial && tick % 12 === 0 ? scenario.views[0].z : Math.floor(random() * 260) - 80) : 5
            const record = addEntity(scenario, x, y, z, 3000 + tick)
            if (tick % 12 === 0) {
                scenario.damage(record.entity, 2900 + tick)
            }
        }

        if (tick % 9 === 0) {
            const alive = scenario.records.filter(record => record.alive)
            if (alive.length > 0) {
                removeEntity(scenario, alive[Math.floor(random() * alive.length)])
            }
        }

        stepAndAssert(scenario)
    }
}

function runQueuedSnapshotScenario(scenario: Scenario, options: { spatial: boolean, is3D: boolean }) {
    const a = addEntity(scenario, 5, 5, options.is3D ? 5 : 0, 100)
    const b = addEntity(scenario, 500, 500, options.is3D ? 500 : 0, 200)
    stepAndAssert(scenario)
    const startCounts = sentCounts(scenario)

    scenario.move(a.entity, 500, 500, options.is3D ? 500 : a.entity.z)
    scenario.instance.step()

    scenario.move(b.entity, 105, 5, options.is3D ? 5 : b.entity.z)
    scenario.damage(b.entity, 180)
    scenario.instance.step()

    const c = addEntity(
        scenario,
        options.spatial ? scenario.views[0].x : 25,
        options.spatial ? scenario.views[0].y : 25,
        options.is3D && options.spatial ? scenario.views[0].z : 0,
        300
    )
    scenario.damage(c.entity, 275)
    removeEntity(scenario, a)
    scenario.instance.step()

    if (options.spatial) {
        scenario.views[0].x = 105
        scenario.views[0].y = 5
        if (options.is3D) {
            scenario.views[0].z = 5
        }
        scenario.channel.updateView?.(scenario.users[0], scenario.views[0])
    }
    scenario.instance.step()

    readAndDrainNewFrames(scenario, startCounts)
}

function createScenario(
    channelFactory: (instance: Instance) => ObjectChannelUnderTest,
    views: any[],
    visible: (entity: TestEntity, view: any) => boolean,
    manual: boolean
) {
    const context = createContext()
    const instance = new Instance(context)
    const channel = channelFactory(instance)
    const writer = channel.createEntityWriter?.(NType.Entity, context.getSchema(NType.Entity)!)
    const users = [createUser(instance, 1), createUser(instance, 2)]
    const clients = [createClientNetwork(context), createClientNetwork(context)]

    channel.subscribe(users[0], views[0])
    channel.subscribe(users[1], views[1])

    const move = (entity: TestEntity, x: number, y: number, z: number) => {
        entity.x = x
        entity.y = y
        entity.z = z
        if (manual) {
            writer.groups.position(entity, x, y, z)
        } else {
            channel.updateEntity?.(entity)
        }
    }
    const damage = (entity: TestEntity, hp: number) => {
        entity.hp = hp
        if (manual) {
            writer.props.hp(entity, hp)
        }
    }

    return { context, instance, channel, writer, users, clients, views, records: [], visible, move, damage }
}

function allVisible(entity: TestEntity, view: any) {
    return true
}

describe('object channel snapshot correctness', () => {
    it('keeps Channel clients synchronized', () => {
        runObjectScenario(createScenario(
            instance => new Channel(instance.localState, { name: 'channel-correctness' }),
            [{}, {}],
            allVisible,
            false
        ))
    })

    it('keeps ManualChannel clients synchronized', () => {
        runObjectScenario(createScenario(
            instance => new ManualChannel(instance.localState, { name: 'manual-correctness' }),
            [{}, {}],
            allVisible,
            true
        ))
    })

    it('keeps SpatialChannel2D clients synchronized with the cell-coarse oracle', () => {
        runObjectScenario(createScenario(
            instance => new SpatialChannel2D(instance.localState, 10, { name: 'spatial-2d-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            false
        ))
    })

    it('keeps ManualSpatialChannel2D clients synchronized with the cell-coarse oracle', () => {
        runObjectScenario(createScenario(
            instance => new ManualSpatialChannel2D(instance.localState, 10, { name: 'manual-spatial-2d-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            true
        ))
    })

    it('keeps SpatialChannel3D clients synchronized with the cell-coarse oracle', () => {
        runObjectScenario(createScenario(
            instance => new SpatialChannel3D(instance.localState, 10, { name: 'spatial-3d-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            false
        ))
    })

    it('keeps ManualSpatialChannel3D clients synchronized with the cell-coarse oracle', () => {
        runObjectScenario(createScenario(
            instance => new ManualSpatialChannel3D(instance.localState, 10, { name: 'manual-spatial-3d-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            true
        ))
    })

    it('keeps Channel synchronized during deterministic churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new Channel(instance.localState, { name: 'channel-churn-correctness' }),
            [{}, {}],
            allVisible,
            false
        ), { spatial: false, is3D: false })
    })

    it('keeps ManualChannel synchronized during deterministic churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new ManualChannel(instance.localState, { name: 'manual-churn-correctness' }),
            [{}, {}],
            allVisible,
            true
        ), { spatial: false, is3D: false })
    })

    it('keeps SpatialChannel2D synchronized during deterministic spatial churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new SpatialChannel2D(instance.localState, 10, { name: 'spatial-2d-churn-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            false
        ), { spatial: true, is3D: false })
    })

    it('keeps ManualSpatialChannel2D synchronized during deterministic spatial churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new ManualSpatialChannel2D(instance.localState, 10, { name: 'manual-spatial-2d-churn-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            true
        ), { spatial: true, is3D: false })
    })

    it('keeps SpatialChannel3D synchronized during deterministic spatial churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new SpatialChannel3D(instance.localState, 10, { name: 'spatial-3d-churn-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            false
        ), { spatial: true, is3D: true })
    })

    it('keeps ManualSpatialChannel3D synchronized during deterministic spatial churn', () => {
        runDeterministicChurnScenario(createScenario(
            instance => new ManualSpatialChannel3D(instance.localState, 10, { name: 'manual-spatial-3d-churn-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            true
        ), { spatial: true, is3D: true })
    })

    it('keeps Channel synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new Channel(instance.localState, { name: 'channel-queued-correctness' }),
            [{}, {}],
            allVisible,
            false
        ), { spatial: false, is3D: false })
    })

    it('keeps ManualChannel synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new ManualChannel(instance.localState, { name: 'manual-queued-correctness' }),
            [{}, {}],
            allVisible,
            true
        ), { spatial: false, is3D: false })
    })

    it('keeps SpatialChannel2D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new SpatialChannel2D(instance.localState, 10, { name: 'spatial-2d-queued-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            false
        ), { spatial: true, is3D: false })
    })

    it('keeps ManualSpatialChannel2D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new ManualSpatialChannel2D(instance.localState, 10, { name: 'manual-spatial-2d-queued-correctness' }),
            [new AABB2D(5, 5, 10, 10), new AABB2D(105, 5, 10, 10)],
            visible2D,
            true
        ), { spatial: true, is3D: false })
    })

    it('keeps SpatialChannel3D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new SpatialChannel3D(instance.localState, 10, { name: 'spatial-3d-queued-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            false
        ), { spatial: true, is3D: true })
    })

    it('keeps ManualSpatialChannel3D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(createScenario(
            instance => new ManualSpatialChannel3D(instance.localState, 10, { name: 'manual-spatial-3d-queued-correctness' }),
            [new AABB3D(5, 5, 5, 10, 10, 10), new AABB3D(105, 5, 5, 10, 10, 10)],
            visible3D,
            true
        ), { spatial: true, is3D: true })
    })
})
