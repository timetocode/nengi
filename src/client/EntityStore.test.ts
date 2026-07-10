import { Binary } from '../common/binary/Binary'
import { ChannelType, createChannelHeader } from '../common/ChannelHeader'
import { Context } from '../common/Context'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { EntityStore } from './EntityStore'
import type { Snapshot } from './Snapshot'

const NType = {
    Player: 1,
    InventoryItem: 2,
    InventoryHeader: 3
}

function createStore() {
    const context = new Context()
    context.register(NType.Player, defineEntitySchema({
        x: { type: Binary.Float64, interp: true },
        y: { type: Binary.Float64, interp: true },
        hp: Binary.UInt8
    }))
    context.register(NType.InventoryItem, defineEntitySchema({
        itemId: Binary.UInt16,
        quantity: Binary.UInt16
    }))
    context.register(NType.InventoryHeader, defineEntitySchema({
        inventoryId: Binary.UInt16,
        label: Binary.String
    }))
    return new EntityStore(context)
}

function snapshot(args: Partial<Snapshot>): Snapshot {
    return {
        serverTimeMs: 1000,
        confirmedCommandFrameNumber: -1,
        messages: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        ...args
    }
}

describe('EntityStore raw client surface', () => {
    it('applies regular channel creates, updates, deletes, and exposes channel facts', () => {
        const store = createStore()
        const frame1 = store.applySnapshot(snapshot({
            channelOpens: [{
                channelId: 50,
                header: createChannelHeader(50, ChannelType.Channel, {
                    nid: 50,
                    ntype: NType.InventoryHeader,
                    inventoryId: 7,
                    label: 'bag'
                })
            }],
            channels: [{
                channelId: 50,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [{ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 }],
                updateEntities: [],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 1)

        expect(store.get(10)).toEqual({ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 })
        expect(store.getEntityChannelId(10)).toBe(50)
        expect(store.getChannelHeaderById(50)?.inventoryId).toBe(7)
        expect(frame1.requireChannel(50).createEntities).toEqual([{ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 }])

        const frame2 = store.applySnapshot(snapshot({
            channels: [{
                channelId: 50,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [],
                updateEntities: [{ nid: 10, prop: 'quantity', value: 5 }],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 2)

        expect(store.get(10)?.quantity).toBe(5)
        expect(frame2.requireChannel(50).updateEntities).toEqual([{ nid: 10, prop: 'quantity', previous: 2, value: 5 }])

        const frame3 = store.applySnapshot(snapshot({
            channels: [{
                channelId: 50,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [],
                updateEntities: [],
                updateEntityGroups: [],
                deleteEntities: [10],
                messages: [],
                interpolatedMessages: []
            }]
        }), 3)

        expect(store.get(10)).toBeUndefined()
        expect(frame3.requireChannel(50).deletedEntities).toEqual([{
            nid: 10,
            entity: { nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 5 },
            channelId: 50
        }])
    })

    it('keeps latest raw state in the store while history provides sampled past state', () => {
        const store = createStore()
        store.applySnapshot(snapshot({
            channelOpens: [{
                channelId: 60,
                header: createChannelHeader(60, ChannelType.Channel, undefined, 'world')
            }],
            channels: [{
                channelId: 60,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [{ nid: 1, ntype: NType.Player, x: 0, y: 0, hp: 10 }],
                updateEntities: [],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 1)
        store.applySnapshot(snapshot({
            channels: [{
                channelId: 60,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [],
                updateEntities: [{ nid: 1, prop: 'x', value: 10 }],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 2)

        expect(store.get(1)?.x).toBe(10)
        expect(store.history.getAt(1, 1)?.x).toBe(0)
        expect(store.history.getAt(1, 2)?.x).toBe(10)
    })

    it('rejects top-level entity CRUD', () => {
        const store = createStore()

        expect(() => store.applySnapshot(snapshot({
            createEntities: [{ nid: 1, ntype: NType.Player, x: 0, y: 0, hp: 10 }]
        }), 1)).toThrow('EntityStore requires channel-scoped entity CRUD.')
    })

    it('applies a channel close before a same-id channel open and reused entity ids', () => {
        const store = createStore()

        store.applySnapshot(snapshot({
            channelOpens: [{
                channelId: 50,
                header: createChannelHeader(50, ChannelType.Channel, {
                    nid: 50,
                    ntype: NType.InventoryHeader,
                    inventoryId: 1,
                    label: 'old'
                })
            }],
            channels: [{
                channelId: 50,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [{ nid: 10, ntype: NType.InventoryItem, itemId: 3, quantity: 2 }],
                updateEntities: [],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 1)

        const frame = store.applySnapshot(snapshot({
            channelCloses: [{ channelId: 50 }],
            channelOpens: [{
                channelId: 50,
                header: createChannelHeader(50, ChannelType.Channel, {
                    nid: 50,
                    ntype: NType.InventoryHeader,
                    inventoryId: 2,
                    label: 'new'
                })
            }],
            channels: [{
                channelId: 50,
                ecsCreateEntities: [],
                ecsCreateComponents: [],
                ecsDeleteEntities: [],
                createEntities: [{ nid: 10, ntype: NType.InventoryItem, itemId: 9, quantity: 1 }],
                updateEntities: [],
                updateEntityGroups: [],
                deleteEntities: [],
                messages: [],
                interpolatedMessages: []
            }]
        }), 2)

        expect(frame.closedChannels).toEqual([{
            channelId: 50,
            header: expect.objectContaining({ inventoryId: 1, label: 'old' }),
            entityNids: [10]
        }])
        expect(frame.openedChannels).toEqual([{
            channelId: 50,
            header: expect.objectContaining({ inventoryId: 2, label: 'new' })
        }])
        expect(store.get(10)).toEqual({ nid: 10, ntype: NType.InventoryItem, itemId: 9, quantity: 1 })
        expect(store.getChannelHeaderById(50)).toEqual(expect.objectContaining({
            inventoryId: 2,
            label: 'new'
        }))
    })
})
