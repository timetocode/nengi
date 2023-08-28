export class NQueue<T> {
    arr: any[]

    constructor() {
        this.arr = []
    }

    isEmpty() {
        return this.arr.length === 0
    }

    enqueue(item: any) {
        this.arr.unshift(item)
    }

    dequeue(): T {
        return this.arr.pop()
    }

    peekNext() {
        return this.arr[this.arr.length - 1]
    }

    get length() {
        return this.arr.length
    }

    next(): T {
        return this.dequeue()
    }
}
