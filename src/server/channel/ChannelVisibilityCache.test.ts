import { ChannelVisibilityCache } from './ChannelVisibilityCache'

describe('borrowed channel visibility', () => {
    it('preserves retained views and distinguishes subscribers with different previous membership', () => {
        const cache = new ChannelVisibilityCache()
        const first = cache.collect([1, 2])
        const second = cache.collect([1, 2, 3], first)
        const current = [2, 3, 4]

        const fromFirst = cache.collect(current, first)
        const fromSecond = cache.collect(current, second)
        const initial = cache.collect(current)

        expect(fromFirst.toCreate).toEqual([3, 4])
        expect(fromFirst.toUpdate).toEqual([2])
        expect(fromFirst.toDelete).toEqual([1])
        expect(fromSecond.toCreate).toEqual([4])
        expect(fromSecond.toUpdate).toEqual([2, 3])
        expect(fromSecond.toDelete).toEqual([1])
        expect(initial.toCreate).toEqual([2, 3, 4])
        expect(initial.toUpdate).toEqual([])
        expect(cache.collect(current, first)).toEqual(fromFirst)

        cache.clear()
        expect(first.toCreate).toEqual([1, 2])
        expect([...first.visibleSet]).toEqual([1, 2])
        expect(second.toCreate).toEqual([3])
        expect([...second.visibleSet]).toEqual([1, 2, 3])
        expect(fromFirst.toDelete).toEqual([1])
    })

    it('compares a remembered shared-delta view that has no saved membership set', () => {
        const cache = new ChannelVisibilityCache()
        const previous = { visibleRef: [1, 2] }
        const current = [2, 3]
        const visibility = cache.collect(current, previous)

        expect(visibility.toCreate).toEqual([3])
        expect(visibility.toUpdate).toEqual([2])
        expect(visibility.toDelete).toEqual([1])
        expect(visibility.previousVisibleSet?.has(2)).toBe(true)
        expect(visibility.previousVisibleSet?.has(3)).toBe(false)
        expect(cache.collect(current, visibility).toUpdate).toEqual([2, 3])
    })
})
