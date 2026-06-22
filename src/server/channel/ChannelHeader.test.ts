import { Buffer } from 'buffer'
import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ClientNetwork } from '../../client/ClientNetwork'
import { Instance } from '../Instance'
import { User } from '../User'
import { testBinaryAdapter } from '../../testSupport/BufferBinary'
import { Channel } from './Channel'
import { ManualChannel } from './ManualChannel'
import { Channel2D } from './Channel2D'
import { Channel3D } from './Channel3D'
import { ManualChannel2D } from './ManualChannel2D'
import { ManualChannel3D } from './ManualChannel3D'
import { EcsChannel } from './EcsChannel'
import { EcsChannel2D } from './EcsChannel2D'
import { EcsChannel3D } from './EcsChannel3D'

enum NType {
    Entity = 1,
    Component = 2
}

function createContext() {
    const context = new Context()
    const schema = defineEntitySchema({
        x: Binary.Float64,
        y: Binary.Float64,
        z: Binary.Float64,
        label: Binary.String
    })
    context.register(NType.Entity, schema)
    context.register(NType.Component, schema)
    return context
}

function createUser(instance: Instance) {
    const user = new User(undefined, {
        binary: testBinaryAdapter,
        send: jest.fn(),
        disconnect: jest.fn()
    } as any)
    user.id = 1
    user.instance = instance
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

function createEntity(ntype = NType.Entity) {
    return {
        nid: 0,
        ntype,
        x: 1,
        y: 2,
        z: 3,
        label: 'created'
    }
}

describe('channel headers', () => {
    const cases: Array<{
        name: string
        setup(instance: Instance, user: User, header: any): number[]
    }> = [
        {
            name: 'Channel',
            setup(instance, user, header) {
                const channel = new Channel(instance.localState, { header })
                channel.subscribe(user)
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'ManualChannel',
            setup(instance, user, header) {
                const channel = new ManualChannel(instance.localState, { header })
                channel.subscribe(user)
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'Channel2D',
            setup(instance, user, header) {
                const channel = new Channel2D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'Channel3D',
            setup(instance, user, header) {
                const channel = new Channel3D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'ManualChannel2D',
            setup(instance, user, header) {
                const channel = new ManualChannel2D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'ManualChannel3D',
            setup(instance, user, header) {
                const channel = new ManualChannel3D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
                const entity = channel.addEntity(createEntity())
                return [entity.nid]
            }
        },
        {
            name: 'EcsChannel',
            setup(instance, user, header) {
                const channel = new EcsChannel(instance.localState, { header })
                channel.subscribe(user)
                const pid = channel.createEntity()
                const component = channel.addComponent(pid, createEntity(NType.Component))
                return [pid, component.nid]
            }
        },
        {
            name: 'EcsChannel2D',
            setup(instance, user, header) {
                const channel = new EcsChannel2D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, halfWidth: 10, halfHeight: 10 })
                const pid = channel.createEntity()
                const component = channel.addSpatialComponent(pid, createEntity(NType.Component))
                return [pid, component.nid]
            }
        },
        {
            name: 'EcsChannel3D',
            setup(instance, user, header) {
                const channel = new EcsChannel3D(instance.localState, 10, { header })
                channel.subscribe(user, { x: 0, y: 0, z: 0, halfWidth: 10, halfHeight: 10, halfDepth: 10 })
                const pid = channel.createEntity()
                const component = channel.addSpatialComponent(pid, createEntity(NType.Component))
                return [pid, component.nid]
            }
        }
    ]

    it.each(cases)('tags creates and exposes the header for $name', ({ setup, name }) => {
        const context = createContext()
        const instance = new Instance(context)
        const user = createUser(instance)
        const clientNetwork = createClientNetwork(context)
        const header = { ...createEntity(), label: name }
        instance.users.set(user.id, user)

        const nids = setup(instance, user, header)

        instance.step()
        clientNetwork.readSnapshot(testBinaryAdapter.createReader(lastSentBuffer(user)))
        clientNetwork.processNextFrame()

        for (let i = 0; i < nids.length; i++) {
            expect(clientNetwork.store.getChannelHeader(nids[i])).toMatchObject({
                ntype: NType.Entity,
                label: name
            })
        }
    })
})
