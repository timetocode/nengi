import { Buffer } from 'buffer'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ClientNetwork } from '../../client/ClientNetwork'
import { EcsChannel } from '../../server/channel/EcsChannel'
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

type RootRecord = {
    pid: number
    transform: TransformEntity
    body: BodyEntity
    alive: boolean
}

type Scenario = {
    context: Context
    instance: Instance
    channel: EcsChannel
    Transform: any
    Body: any
    users: User[]
    clients: ClientNetwork[]
    records: RootRecord[]
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

function createScenario(): Scenario {
    const context = createContext()
    const instance = new Instance(context)
    const channel = new EcsChannel(instance.localState, { name: 'ecs-correctness' })
    const Transform = channel.createComponentWriter(NType.Transform, context.getSchema(NType.Transform)!)
    const Body = channel.createComponentWriter(NType.Body, context.getSchema(NType.Body)!)
    const users = [createUser(instance, 1), createUser(instance, 2)]
    const clients = [createClientNetwork(context), createClientNetwork(context)]
    channel.subscribe(users[0])
    channel.subscribe(users[1])
    return { context, instance, channel, Transform, Body, users, clients, records: [] }
}

function addRoot(scenario: Scenario, x: number, y: number, hp: number) {
    const pid = scenario.channel.createEntity()
    const transform = scenario.channel.addComponent(pid, { nid: 0, ntype: NType.Transform, x, y }) as TransformEntity
    const body = scenario.channel.addComponent(pid, { nid: 0, ntype: NType.Body, hp }) as BodyEntity
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

function assertClientMatchesOracle(scenario: Scenario, client: ClientNetwork) {
    const expectedRoots: number[] = []
    const expectedComponents: number[] = []
    for (let i = 0; i < scenario.records.length; i++) {
        const record = scenario.records[i]
        if (!record.alive) {
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
}

function stepAndAssert(scenario: Scenario) {
    scenario.instance.step()
    for (let i = 0; i < scenario.users.length; i++) {
        scenario.clients[i].readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(scenario.users[i])))
        scenario.clients[i].processNextFrame()
        assertClientMatchesOracle(scenario, scenario.clients[i])
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
        assertClientMatchesOracle(scenario, scenario.clients[i])
    }
}

describe('EcsChannel snapshot correctness', () => {
    it('keeps all-visible ECS clients synchronized', () => {
        const scenario = createScenario()
        const a = addRoot(scenario, 5, 5, 100)
        const b = addRoot(scenario, 100, 100, 200)

        stepAndAssert(scenario)

        moveRoot(scenario, a, 6, 7)
        damageRoot(scenario, b, 180)
        stepAndAssert(scenario)

        const c = addRoot(scenario, 50, 60, 300)
        damageRoot(scenario, c, 275)
        stepAndAssert(scenario)

        removeRoot(scenario, b)
        stepAndAssert(scenario)
    })

    it('stays synchronized when ECS snapshots are drained later', () => {
        const scenario = createScenario()
        const a = addRoot(scenario, 5, 5, 100)
        const b = addRoot(scenario, 100, 100, 200)
        stepAndAssert(scenario)
        const startCounts = sentCounts(scenario)

        moveRoot(scenario, a, 10, 10)
        scenario.instance.step()
        damageRoot(scenario, b, 150)
        scenario.instance.step()
        removeRoot(scenario, a)
        addRoot(scenario, 200, 200, 300)
        scenario.instance.step()

        readAndDrainNewFrames(scenario, startCounts)
    })
})
