import { Binary } from '../common/binary/Binary'
import { defineEntitySchema, defineMessageSchema } from '../common/binary/schema/defineSchema'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import { Context } from '../common/Context'
import { testBinaryAdapter } from '../testSupport/BufferBinary'
import { Client } from './Client'
import { ClientEntityMode } from './ClientEntityMode'
import { ClientReplica } from './ClientReplica'
import { Snapshot } from './Snapshot'

class MockAdapter {
    binary = testBinaryAdapter
    connect() {
        return Promise.resolve({ accepted: true })
    }
    flush() {
    }
}

function createClient() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: { type: Binary.Float64, interp: true },
        y: { type: Binary.Float64, interp: true },
        label: Binary.String
    }))
    context.register(2, defineMessageSchema({
        nid: Binary.UInt32
    }))
    context.register(3, defineEntitySchema({
        label: Binary.String
    }))
    return new Client(context, MockAdapter, 20)
}

function snapshot(args: Partial<Snapshot>): Snapshot {
    return {
        timestamp: -1,
        confirmedClientTick: -1,
        messages: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        ...args
    }
}

function applySnapshot(client: Client, data: Snapshot) {
    const receivedAt = data.timestamp === -1 ? 1000 + (client.network.getPendingFrameCount() * 50) : data.timestamp
    client.network.queueSnapshot(data, receivedAt)
    client.network.previousSnapshot = data
}

function channelOpen(channelId: number, header?: any, channelType = ChannelType.Channel) {
    return { channelId, header: createChannelHeader(channelId, channelType, header) }
}

// ClientReplica is retained as a legacy transition surface while userland moves
// to direct channel-scoped frame consumption.
describe.skip('ClientReplica legacy compatibility', () => {
    it('passes default channel headers to global entity bindings', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.bindEntity<{ nid: number, ntype: number, x: number, y: number, label: string }, { nid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: (entity, ctx) => {
                events.push(`create:${entity.nid}:channel:${ctx.channel?.id ?? 'none'}:header:${ctx.channel?.header?.ntype ?? 'none'}`)
                return { nid: entity.nid }
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42)],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'stone' }]
        }))

        replica.process()

        expect(events).toEqual(['create:1:channel:42:header:0'])
        expect(replica.entities.get(1)?.channel?.id).toBe(42)
        expect(replica.entities.get(1)?.channel?.open).toBe(true)
        expect(replica.entities.get(1)?.channel?.header.ntype).toBe(0)
    })

    it('uses the channel binding instead of the global binding when a channel header matches', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.bindEntity<{ nid: number, ntype: number, x: number, y: number, label: string }, { nid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: entity => {
                events.push(`global:create:${entity.nid}`)
                return { nid: entity.nid }
            }
        })
        replica.bindChannel<{ nid: number, ntype: number, label: string }>(3, {
            open: channel => events.push(`channel:open:${channel.id}:${channel.header.label}`),
            close: channel => events.push(`channel:close:${channel.id}:${channel.header.label}`)
        })
        replica.bindChannelEntity<
            { nid: number, ntype: number, label: string },
            { nid: number, ntype: number, x: number, y: number, label: string },
            { nid: number }
        >(3, 1, {
            mode: ClientEntityMode.Raw,
            create: (entity, ctx) => {
                events.push(`channel:create:${ctx.channel.id}:${ctx.channel.header.label}:${entity.nid}`)
                return { nid: entity.nid }
            },
            update: (entity, _local, ctx) => {
                events.push(`channel:update:${ctx.channel.id}:${ctx.update?.prop}:${entity.x}`)
            },
            destroy: (_local, ctx) => {
                events.push(`channel:destroy:${ctx.channel?.id ?? 'none'}:${ctx.nid}`)
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(10, { nid: 0, ntype: 3, label: 'inventory:10' }, ChannelType.Channel)],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'gem' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 6 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            deleteEntities: [1]
        }))

        replica.process()

        expect(events).toEqual([
            'channel:open:10:inventory:10',
            'channel:create:10:inventory:10:1',
            'channel:update:10:x:6',
            'channel:destroy:10:1'
        ])
    })

    it('purges default-header channel entities when the channel closes', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.bindEntity<{ nid: number, ntype: number, x: number, y: number, label: string }, { nid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: (entity, ctx) => {
                events.push(`create:${entity.nid}:channel:${ctx.channel?.id ?? 'none'}`)
                return { nid: entity.nid }
            },
            destroy: (_local, ctx) => {
                events.push(`destroy:${ctx.nid}:channel:${ctx.channel?.id ?? 'none'}:closed:${ctx.closedChannel?.channelId ?? 'none'}`)
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42, 'world')],
            createEntities: [{ nid: 1, ntype: 1, x: 5, y: 9, label: 'stone' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            channelCloses: [{ channelId: 42 }]
        }))

        const batch = replica.process()

        expect(events).toEqual([
            'create:1:channel:42',
            'destroy:1:channel:42:closed:42'
        ])
        expect(batch.deleteEntities).toEqual([])
        expect(batch.closedChannels).toEqual([
            {
                channelId: 42,
                header: createChannelHeader(42, ChannelType.Channel),
                entityNids: [1]
            }
        ])
        expect(replica.entities.has(1)).toBe(false)
        expect(replica.channels.has(42)).toBe(false)
    })

    it('creates ECS components once even though frames expose them as component and entity creates', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.bindEntity<{ nid: number, pid: number, ntype: number, x: number, y: number, label: string }, { nid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: entity => {
                events.push(`create:${entity.pid}:${entity.nid}`)
                return { nid: entity.nid }
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }))

        replica.process()

        expect(events).toEqual(['create:100:1'])
    })

    it('routes ECS roots and components through explicit ECS handlers', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.onEcsCreateEntity((pid, frame) => {
            events.push(`root:create:${pid}:tick:${frame.tick}`)
        })
        replica.onEcsDeleteEntity((pid, frame) => {
            events.push(`root:delete:${pid}:tick:${frame.tick}`)
        })
        replica.bindEcsComponent<{ nid: number, pid: number, ntype: number, x: number, y: number, label: string }, { pid: number, componentNid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: (component, ctx) => {
                events.push(`component:create:${ctx.pid}:${component.nid}:${component.x}`)
                return { pid: ctx.pid, componentNid: component.nid }
            },
            update: (component, local, ctx) => {
                events.push(`component:update:${local.pid}:${local.componentNid}:${ctx.pid}:${ctx.update?.prop}:${component.x}`)
            },
            destroy: (local, ctx) => {
                events.push(`component:destroy:${local.pid}:${local.componentNid}:${ctx.pid ?? 'none'}`)
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            updateEntities: [{ nid: 1, prop: 'x', value: 6 }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1100,
            ecsDeleteEntities: [100]
        }))

        const batch = replica.process()

        expect(events).toEqual([
            'root:create:100:tick:1',
            'component:create:100:1:5',
            'component:update:100:1:100:x:6',
            'component:destroy:100:1:100',
            'root:delete:100:tick:3'
        ])
        expect(batch.ecsCreateEntities).toEqual([100])
        expect(batch.ecsCreateComponents.map(component => component.nid)).toEqual([1])
        expect(batch.ecsDeleteEntities).toEqual([100])
    })

    it('purges ECS component bindings when their channel closes without treating it as a root delete', () => {
        const client = createClient()
        const replica = new ClientReplica(client)
        const events: string[] = []

        replica.onEcsCreateEntity(pid => {
            events.push(`root:create:${pid}`)
        })
        replica.onEcsDeleteEntity(pid => {
            events.push(`root:delete:${pid}`)
        })
        replica.bindEcsComponent<{ nid: number, pid: number, ntype: number, x: number, y: number, label: string }, { pid: number, componentNid: number }>(1, {
            mode: ClientEntityMode.Raw,
            create: (component, ctx) => {
                events.push(`component:create:${ctx.pid}:${component.nid}:channel:${ctx.channel?.id ?? 'none'}`)
                return { pid: ctx.pid, componentNid: component.nid }
            },
            destroy: (local, ctx) => {
                events.push(`component:destroy:${local.pid}:${local.componentNid}:channel:${ctx.channel?.id ?? 'none'}:closed:${ctx.closedChannel?.channelId ?? 'none'}`)
            }
        })

        applySnapshot(client, snapshot({
            timestamp: 1000,
            channelOpens: [channelOpen(42, 'ecs', ChannelType.EcsChannel)],
            ecsCreateEntities: [100],
            ecsCreateComponents: [{ nid: 1, pid: 100, ntype: 1, x: 5, y: 9, label: 'transform' }]
        }))
        applySnapshot(client, snapshot({
            timestamp: 1050,
            channelCloses: [{ channelId: 42 }]
        }))

        const batch = replica.process()

        expect(events).toEqual([
            'root:create:100',
            'component:create:100:1:channel:42',
            'component:destroy:100:1:channel:42:closed:42'
        ])
        expect(batch.closedChannels).toEqual([
            {
                channelId: 42,
                header: createChannelHeader(42, ChannelType.EcsChannel),
                entityNids: [100, 1]
            }
        ])
        expect(replica.entities.has(1)).toBe(false)
    })
})
