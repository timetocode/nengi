import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { ChannelType, createChannelHeader } from '../../common/ChannelHeader'
import { EntityStore } from '../EntityStore'
import type { Snapshot } from '../Snapshot'
import { PredictionLog, PredictionOperationStatus } from './PredictionLog'

const TEST_CHANNEL_ID = 1

function createStore() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        open: Binary.Boolean
    }))
    return new EntityStore(context)
}

function snapshot(args: Partial<Snapshot>): Snapshot {
    const createEntities = args.createEntities || []
    const updateEntities = args.updateEntities || []
    const deleteEntities = args.deleteEntities || []
    const hasEntityCrud = createEntities.length > 0 || updateEntities.length > 0 || deleteEntities.length > 0
    return {
        serverTimeMs: 0,
        confirmedCommandFrameNumber: -1,
        messages: [],
        ...args,
        channelOpens: hasEntityCrud
            ? [{ channelId: TEST_CHANNEL_ID, header: createChannelHeader(TEST_CHANNEL_ID, ChannelType.Channel) }]
            : [],
        channels: hasEntityCrud ? [{
            channelId: TEST_CHANNEL_ID,
            messages: [],
            interpolatedMessages: [],
            ecsCreateEntities: [],
            ecsCreateComponents: [],
            ecsDeleteEntities: [],
            createEntities,
            updateEntities,
            updateEntityGroups: [],
            deleteEntities
        }] : [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: []
    }
}

describe('PredictionLog', () => {
    it('keeps command predictions pending until their command frame number is confirmed', () => {
        const store = createStore()
        const log = new PredictionLog()
        const local = { x: 0 }
        const events: string[] = []

        const operation = log.addCommand({ dx: 1 }, 7, {
            affected: [{ nid: 1, props: ['x'] }],
            applyLocal: () => {
                local.x += 1
            },
            validate: ({ store }) => store!.get(1)?.x === local.x,
            reconcile: ({ accepted }) => {
                events.push(accepted ? 'accepted' : 'rejected')
            }
        })

        expect(local.x).toBe(1)
        expect(log.confirmCommandFrameNumber(6)).toEqual([])
        expect(log.getPendingCommands().map(op => op.id)).toEqual([operation.id])

        const frame = store.applySnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 7,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1)
        const resolutions = log.confirmCommandFrameNumber(7, frame, store)

        expect(resolutions).toHaveLength(1)
        expect(resolutions[0].accepted).toBe(true)
        expect(operation.status).toBe(PredictionOperationStatus.Confirmed)
        expect(log.getPendingCommands()).toEqual([])
        expect(events).toEqual(['accepted'])
    })

    it('lets command reconciliation correct local state from authority', () => {
        const store = createStore()
        const log = new PredictionLog()
        const local = { x: 0 }

        log.addCommand({ dx: 2 }, 10, {
            affected: [{ nid: 1, props: ['x'] }],
            applyLocal: () => {
                local.x = 2
            },
            validate: ({ store }) => store!.get(1)?.x === local.x,
            reconcile: ({ accepted, store }) => {
                if (!accepted) {
                    local.x = store!.get(1)!.x
                }
            }
        })

        const frame = store.applySnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 10,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1)
        const resolutions = log.confirmCommandFrameNumber(10, frame, store)

        expect(resolutions[0].accepted).toBe(false)
        expect(local.x).toBe(1)
    })

    it('resolves request predictions by request id instead of confirmed tick alone', () => {
        const store = createStore()
        const log = new PredictionLog()
        const localSwitch = { open: false }

        log.addRequest<{ accepted: boolean, open: boolean }>(42, 8, { nid: 1, open: true }, 3, {
            affected: [{ nid: 1, props: ['open'] }],
            applyLocal: () => {
                localSwitch.open = true
            },
            validate: ({ response }) => response!.accepted,
            reconcile: ({ accepted, response }) => {
                if (!accepted) {
                    localSwitch.open = response!.open
                }
            }
        })

        const frame = store.applySnapshot(snapshot({
            serverTimeMs: 1000,
            confirmedCommandFrameNumber: 99,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, open: false }],
            updateEntities: [],
            deleteEntities: []
        }), 1)

        expect(localSwitch.open).toBe(true)
        const commandResolutions = log.confirmCommandFrameNumber(99, frame, store)
        expect(commandResolutions).toEqual([])
        expect(log.getPendingRequests()).toHaveLength(1)

        const resolution = log.resolveRequest(42, { accepted: false, open: false }, frame, store)

        expect(resolution?.accepted).toBe(false)
        expect(localSwitch.open).toBe(false)
        expect(log.getPendingRequests()).toEqual([])
        expect(log.operations.size).toBe(0)
        expect(log.byRequestId.size).toBe(0)
    })

    it('removes rejected request predictions immediately after reconciliation', () => {
        const log = new PredictionLog()
        const events: string[] = []

        log.addRequest(42, 8, { open: true }, 3, {
            reconcile: ({ accepted, error }) => {
                events.push(`${accepted}:${error.message}`)
            }
        })

        const resolution = log.rejectRequest(42, new Error('denied'))

        expect(resolution?.accepted).toBe(false)
        expect(events).toEqual(['false:denied'])
        expect(log.getPendingRequests()).toEqual([])
        expect(log.operations.size).toBe(0)
        expect(log.byRequestId.size).toBe(0)
    })
})
