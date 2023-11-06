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
        const length = this.array.push(entity)
        this.nidIndex.set(entity.nid, length - 1)
    }

    remove(entity: IEntity) {
        const nid = entity.nid
        const indexToRemove = this.nidIndex.get(nid)!
        const lastIndex = this.array.length - 1

        // If the element to remove is not the last one, swap and pop.
        if (indexToRemove !== lastIndex) {
            const otherNid = this.array[lastIndex].nid
            
            // Swap
            ;[this.array[indexToRemove], this.array[lastIndex]] = 
                [this.array[lastIndex], this.array[indexToRemove]]

            // Update nidIndex
            this.nidIndex.set(otherNid, indexToRemove)
        }
        
        // Remove the entity
        this.array.pop()
        this.nidIndex.delete(nid)
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