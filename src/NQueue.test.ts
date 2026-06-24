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
})
