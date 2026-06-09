import { Binary } from '../../common/binary/Binary'
import { defineEntitySchema } from '../../common/binary/schema/defineSchema'
import { Context } from '../../common/Context'
import { EntityStore } from '../EntityStore'
import { PredictionLog, PredictionOperationStatus } from './PredictionLog'

function createStore() {
    const context = new Context()
    context.register(1, defineEntitySchema({
        x: Binary.Float64,
        open: Binary.Boolean
    }))
    return new EntityStore(context)
}

describe('PredictionLog', () => {
    it('keeps command predictions pending until their client tick is confirmed', () => {
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
        expect(log.confirmTick(6)).toEqual([])
        expect(log.getPendingCommands().map(op => op.id)).toEqual([operation.id])

        const frame = store.applySnapshot({
            timestamp: 1000,
            confirmedClientTick: 7,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }, 1)
        const resolutions = log.confirmTick(7, frame, store)

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

        const frame = store.applySnapshot({
            timestamp: 1000,
            confirmedClientTick: 10,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 1, open: false }],
            updateEntities: [],
            deleteEntities: []
        }, 1)
        const resolutions = log.confirmTick(10, frame, store)

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

        const frame = store.applySnapshot({
            timestamp: 1000,
            confirmedClientTick: 99,
            messages: [],
            createEntities: [{ nid: 1, ntype: 1, x: 0, open: false }],
            updateEntities: [],
            deleteEntities: []
        }, 1)

        expect(localSwitch.open).toBe(true)
        const commandResolutions = log.confirmTick(99, frame, store)
        expect(commandResolutions).toEqual([])
        expect(log.getPendingRequests()).toHaveLength(1)

        const resolution = log.resolveRequest(42, { accepted: false, open: false }, frame, store)

        expect(resolution?.accepted).toBe(false)
        expect(localSwitch.open).toBe(false)
        expect(log.getPendingRequests()).toEqual([])
    })
})
