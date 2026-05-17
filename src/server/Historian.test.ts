import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { Context } from '../common/Context'
import { Historian } from './Historian'
import { NDictionary } from './NDictionary'

describe('Historian', () => {
    it('records cloned snapshots and computes interpolated historical state', () => {
        const context = new Context()
        context.register(1, defineEntitySchema({
            x: { type: Binary.Float64, interp: true },
            state: Binary.UInt8
        }))

        const entities = new NDictionary()
        const entity = { nid: 1, ntype: 1, x: 0, state: 0 }
        entities.add(entity)

        const historian = new Historian(context, 10, 3)
        historian.record(1, entities)

        entity.x = 10
        entity.state = 1
        historian.record(2, entities)

        entity.x = 999
        entity.state = 9

        expect(historian.history[1].get(1)).toEqual({
            nid: 1,
            ntype: 1,
            x: 0,
            state: 0
        })
        expect(historian.history[2].get(1)).toEqual({
            nid: 1,
            ntype: 1,
            x: 10,
            state: 1
        })

        const computed = historian.getComputedLagCompensatedState(150)
        expect(computed.get(1)?.x).toBe(5)
        expect(computed.get(1)?.state).toBe(1)
    })

    it('removes snapshots older than the configured retention window', () => {
        const context = new Context()
        context.register(1, defineEntitySchema({ x: Binary.Float64 }))

        const entities = new NDictionary()
        entities.add({ nid: 1, ntype: 1, x: 0 })

        const historian = new Historian(context, 10, 2)
        historian.record(1, entities)
        historian.record(2, entities)
        historian.record(3, entities)
        historian.record(4, entities)

        expect(historian.history[1]).toBeUndefined()
        expect(historian.history[2]).toBeDefined()
        expect(historian.history[3]).toBeDefined()
        expect(historian.history[4]).toBeDefined()
    })
})
