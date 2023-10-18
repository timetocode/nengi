import { IEntity } from '../common/IEntity'

export class EDictionary {
    object: { [key: string]: any }
    array: IEntity[]

    constructor() {
        this.object = {}
        this.array = []
    }

    get size() {
        return this.array.length
    }

    get(nid: number) {
        const obj = this.object[nid]
        if (typeof obj !== 'undefined') {
            return this.object[nid]
        }
        return null
    }

    /**
     * invokes the provided function each entity in the dictionary, passing the entity and index to the function
     * unsafe if used to remove entities from the dictionary as this will modify the index incorrectly
     * @param fn
     */
    forEach(fn: (entity: IEntity, index: number) => any) {
        for (let i = 0; i < this.array.length; i++) {
            fn(this.array[i], i)
        }
    }
    /**
     * invokes the provided function each entity in the dictionary, passing the entity and index to the function
     * navigates in reverse, thus is safe for removing entities
     * @param fn
     */
    forEachReverse(fn: (entity: IEntity, index: number) => any) {
        for (let i = this.array.length - 1; i >= 0; i--) {
            fn(this.array[i], i)
        }
    }

    toArray() {
        return this.array
    }

    add(obj: IEntity) {
        if (typeof obj === 'object' && typeof obj.nid !== 'undefined') {
            this.object[obj.nid] = obj
            this.array.push(obj)
        } else {
            throw new Error('EDictionary could not add object, invalid object or object.id.')
        }
    }

    remove(obj: IEntity) {
        if (typeof obj === 'object' && typeof obj.nid !== 'undefined') {
            return this.removeById(obj.nid)
        } else {
            //throw new Error('EDictionary could not remove object, invalid object or object.id.')
        }
    }

    removeById(id: number) {
        if (typeof id !== 'undefined') {
            let index = -1
            for (let i = 0; i < this.array.length; i++) {
                if (this.array[i].nid === id) {
                    index = i
                    break
                }
            }
            if (index !== -1) {
                this.array.splice(index, 1)
            } else {
                //throw new Error('EDictionary could not remove object, id not found.')
            }
            const temp = this.object[id]
            delete this.object[id]
            return temp
        } else {
            //throw new Error('EDictionary could not removeById, invalid id.')
        }
    }

    bulkRemove(entitiesOrIds: Array<IEntity | number>) {
        const idsToRemove: Set<number> = new Set()

        // Gather all entity IDs
        for (const item of entitiesOrIds) {
            if (typeof item === 'number') {
                idsToRemove.add(item)
            } else if (item && typeof item.nid !== 'undefined') {
                idsToRemove.add(item.nid)
            }
        }

        // Filter out entities that should be removed
        this.array = this.array.filter(entity => !idsToRemove.has(entity.nid))

        // Remove entities from object storage
        for (const id of idsToRemove) {
            delete this.object[id]
        }
    }
}
