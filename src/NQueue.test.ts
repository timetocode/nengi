import { NQueue } from './NQueue'

describe('NQueue', () => {
    it('dequeues in FIFO order while exposing the next item without removing it', () => {
        const queue = new NQueue<number>()

        queue.enqueue(1)
        queue.enqueue(2)
        queue.enqueue(3)

        expect(queue.length).toBe(3)
        expect(queue.peekNext()).toBe(1)
        expect(queue.next()).toBe(1)
        expect(queue.dequeue()).toBe(2)
        expect(queue.next()).toBe(3)
        expect(queue.isEmpty()).toBe(true)
    })

    it('notifies each removal once and retains FIFO through selective removal and clear', () => {
        const removed: number[] = []
        const queue = new NQueue<number>(item => removed.push(item))
        for (const value of [1, 2, 3, 4, 5]) queue.enqueue(value)
        expect(queue.removeWhere(value => value % 2 === 0)).toBe(2)
        expect(queue.next()).toBe(1)
        expect(queue.dequeue()).toBe(3)
        expect(queue.peekNext()).toBe(5)
        queue.clear()
        expect(queue.dequeue()).toBeUndefined()
        expect(removed.sort()).toEqual([1, 2, 3, 4, 5])
    })
})
