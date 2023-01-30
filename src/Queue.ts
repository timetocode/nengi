

class Queue {
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

    dequeue() {
        return this.arr.pop()
    }

    peekNext() {
        return this.arr[this.arr.length - 1]
    }

    get length() {
        return this.arr.length
    }

    next() {
        return this.dequeue()
    }
}

export default Queue
