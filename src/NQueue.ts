export class NQueue<T> {
    arr: T[]

    constructor() {
        this.arr = []
    }

    isEmpty() {
        return this.arr.length === 0
    }

    enqueue(item: T) {
        this.arr.unshift(item)
    }

    dequeue(): T {
        return this.arr.pop() as T
    }

    peekNext(): T | undefined {
        return this.arr[this.arr.length - 1]
    }

    get length() {
        return this.arr.length
    }

    next(): T {
        return this.dequeue()
    }
}
