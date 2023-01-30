class IdPool {
    ids: Set<number>
    min: number
    max: number
    current: number

    constructor(max: number) {
        this.min = 1
        this.max = max
        this.ids = new Set()
        this.current = this.min - 1
    }

    nextId(): number {
        if (this.ids.size >= this.max) {
            throw new Error('IdPool overflow')
        }

        this.current++
        if (this.current > this.max) {
            this.current = this.min
        }

        if (!this.ids.has(this.current)) {
            this.ids.add(this.current)
            return this.current
        } else {
            return this.nextId()
        }
    }

    returnId(id: number) {
        this.ids.delete(id)
    }
}

export default IdPool