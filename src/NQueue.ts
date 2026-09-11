export class NQueue<T> {
    arr: T[]

    constructor(private readonly onRemove?: (item: T) => void) {
        this.arr = []
    }

    isEmpty() {
        return this.arr.length === 0
    }

    enqueue(item: T) {
        this.arr.unshift(item)
    }

    dequeue(): T {
        if (this.arr.length === 0) return undefined as T
        const item = this.arr.pop() as T
        this.onRemove?.(item)
        return item
    }

    /** Removes matching entries without changing the order of retained entries. */
    removeWhere(predicate: (item: T) => boolean) {
        let kept = 0
        const length = this.arr.length
        for (let i = 0; i < length; i++) {
            const item = this.arr[i]
            if (predicate(item)) this.onRemove?.(item)
            else this.arr[kept++] = item
        }
        this.arr.length = kept
        return length - kept
    }

    clear() {
        this.removeWhere(() => true)
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
