import { Buffer } from 'buffer'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ClientNetwork } from '../../client/ClientNetwork'
import { AABB2D } from '../../server/channel/AABB2D'
import { AABB3D } from '../../server/channel/AABB3D'
import { EcsSpatialChannel2D } from '../../server/channel/EcsSpatialChannel2D'
import { EcsSpatialChannel3D } from '../../server/channel/EcsSpatialChannel3D'
import { PlannedEcsSpatialChannel2D } from '../../server/channel/PlannedEcsSpatialChannel2D'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'

enum NType {
    Body = 1,
    Transform = 2
}

type TransformEntity = {
    nid: number
    ntype: NType.Transform
    x: number
    y: number
}

type BodyEntity = {
    nid: number
    ntype: NType.Body
    hp: number
}

type Transform3DEntity = TransformEntity & {
    z: number
}

type Root3DRecord = {
    pid: number
    transform: Transform3DEntity
    body: BodyEntity
    alive: boolean
}

type RootRecord = {
    pid: number
    transform: TransformEntity
    body: BodyEntity
    alive: boolean
}

type SpatialChannelUnderTest = {
    createEntity(): number
    addSpatialComponent<T extends { nid: number, ntype: number }>(pid: number, component: T): T & { pid: number }
    addComponent<T extends { nid: number, ntype: number }>(pid: number, component: T): T & { pid: number }
    removeEntity(pid: number): number
    subscribe(user: User, view: AABB2D): void
    updateView(user: User, view: AABB2D): void
    createComponentWriter(ntype: number, schema: any): any
}

type Scenario = {
    context: Context
    instance: Instance
    channel: SpatialChannelUnderTest
    Transform: any
    Body: any
    users: User[]
    clients: ClientNetwork[]
    views: AABB2D[]
    records: RootRecord[]
}

type Scenario3D = {
    context: Context
    instance: Instance
    channel: EcsSpatialChannel3D
    Transform: any
    Body: any
    users: User[]
    clients: ClientNetwork[]
    views: AABB3D[]
    records: Root3DRecord[]
}

function createContext() {
    const context = new Context()
    context.register(NType.Transform, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y']
            }
        }
    }))
    context.register(NType.Body, defineEntitySchema({
        hp: Binary.UInt16
    }))
    return context
}

function createContext3D() {
    const context = new Context()
    context.register(NType.Transform, defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        $options: {
            updateGroups: {
                position: ['x', 'y', 'z']
            }
        }
    }))
    context.register(NType.Body, defineEntitySchema({
        hp: Binary.UInt16
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

function isVisibleByCoarseCell(transform: TransformEntity, view: AABB2D, cellSize: number) {
    const cellX = cellCoord(transform.x, cellSize)
    const cellY = cellCoord(transform.y, cellSize)
    return cellX >= cellCoord(view.x - view.halfWidth, cellSize) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, cellSize) &&
        cellY >= cellCoord(view.y - view.halfHeight, cellSize) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, cellSize)
}

function isVisibleByCoarseCell3D(transform: Transform3DEntity, view: AABB3D, cellSize: number) {
    const cellX = cellCoord(transform.x, cellSize)
    const cellY = cellCoord(transform.y, cellSize)
    const cellZ = cellCoord(transform.z, cellSize)
    return cellX >= cellCoord(view.x - view.halfWidth, cellSize) &&
        cellX <= cellCoordForEnd(view.x + view.halfWidth, cellSize) &&
        cellY >= cellCoord(view.y - view.halfHeight, cellSize) &&
        cellY <= cellCoordForEnd(view.y + view.halfHeight, cellSize) &&
        cellZ >= cellCoord(view.z - view.halfDepth, cellSize) &&
        cellZ <= cellCoordForEnd(view.z + view.halfDepth, cellSize)
}

function assertClientMatchesOracle(scenario: Scenario, clientIndex: number, label: string) {
    const client = scenario.clients[clientIndex]
    const view = scenario.views[clientIndex]
    const expectedRoots: number[] = []
    const expectedComponents: number[] = []

    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i]
        if (!record.alive || !isVisibleByCoarseCell(record.transform, view, 10)) {
            continue
        }
        expectedRoots.push(record.pid)
        expectedComponents.push(record.transform.nid, record.body.nid)
        expect(client.store.get(record.transform.nid)?.x).toBe(record.transform.x)
        expect(client.store.get(record.transform.nid)?.y).toBe(record.transform.y)
        expect(client.store.get(record.body.nid)?.hp).toBe(record.body.hp)
    }

    expect(sorted(client.store.ecsEntities)).toEqual(sorted(expectedRoots))
    expect(sorted(client.store.entities.keys())).toEqual(sorted(expectedComponents))
    if (client.latestFrame && client.latestFrame.channels.length > 0) {
        expect(client.latestFrame.channels.every(channel => channel.channelId === (scenario.channel as any).nid)).toBe(true)
    }
}

function stepAndAssert(scenario: Scenario, label: string) {
    scenario.instance.step()
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])))
        scenario.clients[i].processNextFrame()
        assertClientMatchesOracle(scenario, i, `${label}:user${i + 1}`)
    }
}

function assertClientMatches3DOracle(scenario: Scenario3D, clientIndex: number) {
    const client = scenario.clients[clientIndex]
    const view = scenario.views[clientIndex]
    const expectedRoots: number[] = []
    const expectedComponents: number[] = []

    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i]
        if (!record.alive || !isVisibleByCoarseCell3D(record.transform, view, 10)) {
            continue
        }
        expectedRoots.push(record.pid)
        expectedComponents.push(record.transform.nid, record.body.nid)
        expect(client.store.get(record.transform.nid)?.x).toBe(record.transform.x)
        expect(client.store.get(record.transform.nid)?.y).toBe(record.transform.y)
        expect(client.store.get(record.transform.nid)?.z).toBe(record.transform.z)
        expect(client.store.get(record.body.nid)?.hp).toBe(record.body.hp)
    }

    expect(sorted(client.store.ecsEntities)).toEqual(sorted(expectedRoots))
    expect(sorted(client.store.entities.keys())).toEqual(sorted(expectedComponents))
}

function stepAndAssert3D(scenario: Scenario3D) {
    scenario.instance.step()
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])))
        scenario.clients[i].processNextFrame()
        assertClientMatches3DOracle(scenario, i)
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
        const frames = scenario.clients[i].drainFrames()
        expect(frames.length).toBe(send.mock.calls.length - startCounts[i])
        assertClientMatchesOracle(scenario, i, `queued:user${i + 1}`)
    }
}

function addRoot(scenario: Scenario, x: number, y: number, hp: number) {
    const pid = scenario.channel.createEntity()
    const transform = scenario.channel.addSpatialComponent(pid, {
        nid: 0,
        ntype: NType.Transform,
        x,
        y
    }) as TransformEntity
    const body = scenario.channel.addComponent(pid, {
        nid: 0,
        ntype: NType.Body,
        hp
    }) as BodyEntity
    const record = { pid, transform, body, alive: true }
    scenario.records.push(record)
    return record
}

function addRoot3D(scenario: Scenario3D, x: number, y: number, z: number, hp: number) {
    const pid = scenario.channel.createEntity()
    const transform = scenario.channel.addSpatialComponent(pid, {
        nid: 0,
        ntype: NType.Transform,
        x,
        y,
        z
    }) as Transform3DEntity
    const body = scenario.channel.addComponent(pid, {
        nid: 0,
        ntype: NType.Body,
        hp
    }) as BodyEntity
    const record = { pid, transform, body, alive: true }
    scenario.records.push(record)
    return record
}

function moveRoot(scenario: Scenario, record: RootRecord, x: number, y: number) {
    record.transform.x = x
    record.transform.y = y
    scenario.Transform.position(record.transform, x, y)
}

function damageRoot(scenario: Scenario, record: RootRecord, hp: number) {
    record.body.hp = hp
    scenario.Body.props.hp(record.body, hp)
}

function removeRoot(scenario: Scenario, record: RootRecord) {
    scenario.channel.removeEntity(record.pid)
    record.alive = false
}

function moveRoot3D(scenario: Scenario3D, record: Root3DRecord, x: number, y: number, z: number) {
    record.transform.x = x
    record.transform.y = y
    record.transform.z = z
    scenario.Transform.position(record.transform, x, y, z)
}

function damageRoot3D(scenario: Scenario3D, record: Root3DRecord, hp: number) {
    record.body.hp = hp
    scenario.Body.props.hp(record.body, hp)
}

function removeRoot3D(scenario: Scenario3D, record: Root3DRecord) {
    scenario.channel.removeEntity(record.pid)
    record.alive = false
}

function createRandom(seed: number) {
    let value = seed >>> 0
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0
        return value / 0x100000000
    }
}

function createScenario(createChannel: (instance: Instance) => SpatialChannelUnderTest): Scenario {
    const context = createContext()
    const instance = new Instance(context)
    const channel = createChannel(instance)
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body)!)
    const users = [createUser(instance, 1), createUser(instance, 2)]
    const clients = [createClientNetwork(context), createClientNetwork(context)]
    const views = [
        new AABB2D(5, 5, 10, 10),
        new AABB2D(105, 5, 10, 10)
    ]

    channel.subscribe(users[0], views[0])
    channel.subscribe(users[1], views[1])

    return { context, instance, channel, Transform, Body, users, clients, views, records: [] }
}

function createScenario3D(): Scenario3D {
    const context = createContext3D()
    const instance = new Instance(context)
    const channel = new EcsSpatialChannel3D(instance.localState, 10, { name: 'ecs-spatial-3d-correctness' })
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body)!)
    const users = [createUser(instance, 1), createUser(instance, 2)]
    const clients = [createClientNetwork(context), createClientNetwork(context)]
    const views = [
        new AABB3D(5, 5, 5, 10, 10, 10),
        new AABB3D(105, 5, 5, 10, 10, 10)
    ]

    channel.subscribe(users[0], views[0])
    channel.subscribe(users[1], views[1])

    return { context, instance, channel, Transform, Body, users, clients, views, records: [] }
}

function runScriptedCorrectnessScenario(createChannel: (instance: Instance) => SpatialChannelUnderTest) {
    const scenario = createScenario(createChannel)
    const a = addRoot(scenario, 5, 5, 100)
    const b = addRoot(scenario, 105, 5, 200)
    const c = addRoot(scenario, 500, 500, 300)

    stepAndAssert(scenario, 'initial creates')

    scenario.views[0].x = 105
    scenario.channel.updateView(scenario.users[0], scenario.views[0])
    stepAndAssert(scenario, 'viewer moves toward entity')

    moveRoot(scenario, c, 105, 5)
    damageRoot(scenario, c, 275)
    stepAndAssert(scenario, 'entity moves into view with update')

    scenario.views[1].x = 500
    scenario.channel.updateView(scenario.users[1], scenario.views[1])
    stepAndAssert(scenario, 'viewer moves away')

    moveRoot(scenario, b, 500, 500)
    stepAndAssert(scenario, 'entity moves away')

    const d = addRoot(scenario, 105, 5, 400)
    damageRoot(scenario, d, 390)
    stepAndAssert(scenario, 'spawn and update inside view')

    const e = addRoot(scenario, 900, 900, 500)
    stepAndAssert(scenario, 'spawn outside view')

    removeRoot(scenario, c)
    stepAndAssert(scenario, 'remove visible entity')

    removeRoot(scenario, e)
    stepAndAssert(scenario, 'remove invisible entity')

    moveRoot(scenario, a, 106, 6)
    damageRoot(scenario, a, 90)
    stepAndAssert(scenario, 'previously invisible entity re-enters')
}

function runDeterministicFuzzScenario(createChannel: (instance: Instance) => SpatialChannelUnderTest) {
    const scenario = createScenario(createChannel)
    const random = createRandom(0xdecafbad)

    for (let i = 0; i < 24; i++) {
        addRoot(
            scenario,
            Math.floor(random() * 260) - 40,
            Math.floor(random() * 180) - 40,
            1000 + i
        )
    }
    stepAndAssert(scenario, 'fuzz initial')

    for (let tick = 1; tick <= 80; tick++) {
        scenario.views[0].x = 20 + ((tick * 9) % 180)
        scenario.views[0].y = 10 + ((tick * 5) % 120)
        scenario.views[1].x = 190 - ((tick * 7) % 180)
        scenario.views[1].y = 110 - ((tick * 3) % 120)
        scenario.channel.updateView(scenario.users[0], scenario.views[0])
        scenario.channel.updateView(scenario.users[1], scenario.views[1])

        for (let i = 0; i < scenario.records.length; i++) {
            const record = scenario.records[i]
            if (!record.alive) {
                continue
            }
            if (random() < 0.35) {
                const x = Math.floor(random() * 300) - 50
                const y = Math.floor(random() * 220) - 50
                moveRoot(scenario, record, x, y)
            }
            if (random() < 0.45) {
                damageRoot(scenario, record, Math.floor(random() * 5000))
            }
        }

        if (tick % 6 === 0) {
            const x = tick % 12 === 0 ? scenario.views[0].x : Math.floor(random() * 360) - 80
            const y = tick % 12 === 0 ? scenario.views[0].y : Math.floor(random() * 260) - 80
            const record = addRoot(scenario, x, y, 3000 + tick)
            if (tick % 12 === 0) {
                damageRoot(scenario, record, 2900 + tick)
            }
        }

        if (tick % 9 === 0) {
            const alive = scenario.records.filter(record => record.alive)
            if (alive.length > 0) {
                removeRoot(scenario, alive[Math.floor(random() * alive.length)])
            }
        }

        stepAndAssert(scenario, `fuzz tick ${tick}`)
    }
}

function runQueuedSnapshotScenario(createChannel: (instance: Instance) => SpatialChannelUnderTest) {
    const scenario = createScenario(createChannel)
    const a = addRoot(scenario, 5, 5, 100)
    const b = addRoot(scenario, 500, 500, 200)

    stepAndAssert(scenario, 'queued initial')
    const startCounts = sentCounts(scenario)

    moveRoot(scenario, a, 500, 500)
    scenario.instance.step()

    moveRoot(scenario, b, 105, 5)
    damageRoot(scenario, b, 180)
    scenario.instance.step()

    const c = addRoot(scenario, scenario.views[0].x, scenario.views[0].y, 300)
    damageRoot(scenario, c, 275)
    removeRoot(scenario, a)
    scenario.instance.step()

    scenario.views[0].x = 105
    scenario.views[0].y = 5
    scenario.channel.updateView(scenario.users[0], scenario.views[0])
    scenario.instance.step()

    readAndDrainNewFrames(scenario, startCounts)
}

function run3DCorrectnessScenario() {
    const scenario = createScenario3D()
    const a = addRoot3D(scenario, 5, 5, 5, 100)
    const b = addRoot3D(scenario, 105, 5, 5, 200)
    const c = addRoot3D(scenario, 500, 500, 500, 300)

    stepAndAssert3D(scenario)

    scenario.views[0].x = 105
    scenario.channel.updateView(scenario.users[0], scenario.views[0])
    stepAndAssert3D(scenario)

    moveRoot3D(scenario, c, 105, 5, 5)
    damageRoot3D(scenario, c, 275)
    stepAndAssert3D(scenario)

    scenario.views[1].z = 500
    scenario.channel.updateView(scenario.users[1], scenario.views[1])
    stepAndAssert3D(scenario)

    moveRoot3D(scenario, b, 500, 500, 500)
    stepAndAssert3D(scenario)

    const d = addRoot3D(scenario, 105, 5, 5, 400)
    damageRoot3D(scenario, d, 390)
    stepAndAssert3D(scenario)

    const e = addRoot3D(scenario, 900, 900, 900, 500)
    stepAndAssert3D(scenario)

    removeRoot3D(scenario, c)
    stepAndAssert3D(scenario)

    removeRoot3D(scenario, e)
    stepAndAssert3D(scenario)

    moveRoot3D(scenario, a, 106, 6, 6)
    damageRoot3D(scenario, a, 90)
    stepAndAssert3D(scenario)
}

describe('ECS spatial snapshot correctness', () => {
    it('keeps EcsSpatialChannel2D clients synchronized with the cell-coarse oracle', () => {
        runScriptedCorrectnessScenario(instance => new EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-correctness' }))
    })

    it('keeps EcsSpatialChannel2D synchronized during deterministic spatial churn', () => {
        runDeterministicFuzzScenario(instance => new EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-fuzz' }))
    })

    it('keeps EcsSpatialChannel2D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(instance => new EcsSpatialChannel2D(instance.localState, 10, { name: 'optimized-queued' }))
    })

    it('keeps PlannedEcsSpatialChannel2D clients synchronized with the cell-coarse oracle', () => {
        runScriptedCorrectnessScenario(instance => new PlannedEcsSpatialChannel2D(instance.localState, 10, { name: 'planned-ecs-spatial-correctness' }))
    })

    it('keeps PlannedEcsSpatialChannel2D synchronized during deterministic spatial churn', () => {
        runDeterministicFuzzScenario(instance => new PlannedEcsSpatialChannel2D(instance.localState, 10, { name: 'planned-ecs-spatial-fuzz' }))
    })

    it('keeps PlannedEcsSpatialChannel2D synchronized when queued snapshots are drained later', () => {
        runQueuedSnapshotScenario(instance => new PlannedEcsSpatialChannel2D(instance.localState, 10, { name: 'planned-ecs-spatial-queued' }))
    })

    it('keeps EcsSpatialChannel3D clients synchronized with the cell-coarse oracle', () => {
        run3DCorrectnessScenario()
    })
})
