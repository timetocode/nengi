import { Binary } from '../common/binary/Binary'
import { defineEntitySchema } from '../common/binary/schema/defineSchema'
import { EntityCache } from './EntityCache'

describe('EntityCache', () => {
    it('clones cached objects and keeps same-tick diffs stable', () => {
        const schema = defineEntitySchema({
            position: { type: Binary.Vector2, interp: true }
        })

        const entity = {
            nid: 1,
            ntype: 1,
            position: { x: 1, y: 2 }
        }

        const cache = new EntityCache()
        cache.cacheify(1, entity, schema)

        entity.position.x = 10

        cache.createCachesForTick(2)
        const firstDiffs = cache.getAndDiff(2, entity, schema)

        expect(firstDiffs).toHaveLength(1)
        expect(firstDiffs[0].nschema).toBe(schema)
        expect(firstDiffs[0]).toMatchObject({
            nid: 1,
            prop: 'position',
            value: { x: 10, y: 2 }
        })

        entity.position.x = 20

        const sameTickDiffs = cache.getAndDiff(2, entity, schema)
        expect(sameTickDiffs).toBe(firstDiffs)
        expect(sameTickDiffs[0].value).toEqual({ x: 10, y: 2 })

        cache.createCachesForTick(3)
        const nextTickDiffs = cache.getAndDiff(3, entity, schema)
        expect(nextTickDiffs[0].value).toEqual({ x: 20, y: 2 })
    })
})
