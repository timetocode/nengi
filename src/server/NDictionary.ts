import { IEntity } from '../common/IEntity'

type nid = number
type arrayIndex = number

export class NDictionary {
    array: IEntity[] = []
    nidIndex: Map<nid, arrayIndex> = new Map()

    get(nid: nid) {
        return this.array[this.nidIndex.get(nid)!]
    }

    add(entity: IEntity) {
        if (this.nidIndex.has(entity.nid)) {
            throw new Error(`NDictionary already contains nid ${entity.nid}.`)
        }
        const length = this.array.push(entity)
        this.nidIndex.set(entity.nid, length - 1)
    }

    remove(entity: IEntity) {
        const nid = entity.nid
        const indexToRemove = this.nidIndex.get(nid)
        if (indexToRemove === undefined || this.array[indexToRemove] !== entity) {
            return false
        }
        const lastIndex = this.array.length - 1

        if (indexToRemove !== lastIndex) {
            const otherNid = this.array[lastIndex].nid
            this.array[indexToRemove] = this.array[lastIndex]
            this.nidIndex.set(otherNid, indexToRemove)
        }

        this.array.pop()
        this.nidIndex.delete(nid)
        return true
    }

    removeAll() {
        this.array.length = 0
        this.nidIndex.clear()
    }

    forEach(fn: (entity: IEntity, index: number) => any) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i)
        }
    }

    get size() {
        return this.array.length
    }
}
