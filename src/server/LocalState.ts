import { IdPool } from './IdPool'
import { IEntity } from '../common/IEntity'
import { NDictionary } from './NDictionary'
import { IChannel } from './channel/IChannel'
import { Binary } from '../common/binary/Binary'
import { NetworkIdType, maxValueForNetworkType, nextNetworkType } from '../common/binary/Protocol'

export class LocalState {
    nidType: NetworkIdType = Binary.UInt8
    nidPool: IdPool = new IdPool(maxValueForNetworkType(Binary.UInt8))
    entityTreeVersion = 0
    /**
     * Entity nid -> owner nid currently keeping that entity networked.
     * Root entities are owned by a channel. Child entities are owned by their
     * parent entity and cascade visibility through the root.
     */
    ownerByNid: Map<number, number> = new Map()
    /**
     * Parent entity nid -> child entity nids. Children cascade visibility from
     * the parent, but userland still owns object lifetime and game semantics.
     */
    children: Map<number, Set<number>> = new Map()
    parentByNid: Map<number, number> = new Map()
    rootByNid: Map<number, number> = new Map()
    _entities: NDictionary = new NDictionary()
    channels: Set<IChannel> = new Set()
    private treeCache: Map<number, number[]> = new Map()
    private treeDeleteCache: Map<number, number[]> = new Map()

    nextNetworkId() {
        if (this.nidPool.isFull()) {
            const nextType = nextNetworkType(this.nidType)
            if (!nextType) {
                throw new Error('No nid values are available.')
            }
            this.nidType = nextType
            this.nidPool.setMax(maxValueForNetworkType(nextType))
        }

        return this.nidPool.nextId()
    }

    private assertRegisteredParent(parent: IEntity) {
        if (parent.nid === 0 || !this.ownerByNid.has(parent.nid)) {
            throw new Error('Cannot attach a child to an entity that is not networked.')
        }
    }

    private invalidateEntityTreeCache(rootNid: number) {
        this.entityTreeVersion++
        this.invalidateEntityTreeSubtree(rootNid)
        let parentNid = this.parentByNid.get(rootNid) || 0
        while (parentNid) {
            this.treeCache.delete(parentNid)
            this.treeDeleteCache.delete(parentNid)
            parentNid = this.parentByNid.get(parentNid) || 0
        }
    }

    private invalidateEntityTreeSubtree(rootNid: number) {
        this.treeCache.delete(rootNid)
        this.treeDeleteCache.delete(rootNid)
        const children = this.children.get(rootNid)
        if (!children) {
            return
        }
        for (const childNid of children) {
            this.invalidateEntityTreeSubtree(childNid)
        }
    }

    addChild(parent: IEntity, child: IEntity) {
        this.assertRegisteredParent(parent)

        const existingChildren = this.children.get(parent.nid)
        if (child.nid !== 0 && existingChildren?.has(child.nid)) {
            return child
        }

        const cnid = this.registerEntity(child, parent.nid)
        if (!this.children.get(parent.nid)) {
            this.children.set(parent.nid, new Set())
        }
        this.children.get(parent.nid)!.add(cnid)
        this.parentByNid.set(cnid, parent.nid)
        this.rootByNid.set(cnid, this.rootByNid.get(parent.nid) || parent.nid)
        this.invalidateEntityTreeCache(parent.nid)
        return child
    }

    removeChild(parent: IEntity, child: IEntity) {
        this.assertRegisteredParent(parent)
        const cnid = child.nid
        if (cnid === 0) {
            return
        }
        const children = this.children.get(parent.nid)
        if (!children || !children.has(cnid)) {
            return
        }
        this.invalidateEntityTreeCache(cnid)
        children.delete(cnid)
        this.unregisterEntity(child, parent.nid)
    }

    registerEntity(entity: IEntity, ownerId: number) {
        let nid = entity.nid
        if (nid !== 0) {
            const ownerNid = this.ownerByNid.get(nid)
            if (ownerNid === ownerId) {
                return nid
            }
            if (ownerNid !== undefined) {
                throw new Error(`Entity nid ${nid} is already networked by another source.`)
            }
            throw new Error(`Entity nid ${nid} is not managed by LocalState.`)
        }

        nid = this.nextNetworkId()
        entity.nid = nid
        this._entities.add(entity)
        this.rootByNid.set(nid, nid)
        this.ownerByNid.set(nid, ownerId)
        return nid
    }

    unregisterEntity(entity: IEntity, ownerId: number) {
        const nid = entity.nid
        const ownerNid = this.ownerByNid.get(nid)
        if (ownerNid === undefined) {
            return
        }
        if (ownerNid !== ownerId) {
            throw new Error(`Entity nid ${nid} is owned by ${ownerNid}, not ${ownerId}.`)
        }

        this.invalidateEntityTreeCache(nid)
        this.unregisterChildren(nid)
        this.ownerByNid.delete(nid)
        this.parentByNid.delete(nid)
        this.rootByNid.delete(nid)
        this._entities.remove(entity)
        this.nidPool.returnId(nid)
        entity.nid = 0
    }

    getByNid(nid: number): IEntity {
        return this._entities.get(nid)
    }

    getParentNid(nid: number) {
        return this.parentByNid.get(nid) || 0
    }

    getRootNid(nid: number) {
        return this.rootByNid.get(nid) || 0
    }

    forEachEntityTree(rootNid: number, fn: (nid: number) => void) {
        const tree = this.getEntityTree(rootNid)
        for (let i = 0; i < tree.length; i++) {
            fn(tree[i])
        }
    }

    private buildEntityTree(rootNid: number, out: number[]) {
        out.push(rootNid)
        const children = this.children.get(rootNid)
        if (children) {
            for (const childNid of children) {
                this.buildEntityTree(childNid, out)
            }
        }
        return out
    }

    getEntityTree(rootNid: number) {
        let tree = this.treeCache.get(rootNid)
        if (!tree) {
            tree = this.buildEntityTree(rootNid, [])
            this.treeCache.set(rootNid, tree)
        }
        return tree
    }

    collectEntityTree(rootNid: number, out: number[]) {
        const tree = this.getEntityTree(rootNid)
        for (let i = 0; i < tree.length; i++) {
            out.push(tree[i])
        }
        return out
    }

    private buildEntityTreeDeletes(rootNid: number, out: number[]) {
        const children = this.children.get(rootNid)
        if (children) {
            for (const childNid of children) {
                this.buildEntityTreeDeletes(childNid, out)
            }
        }
        out.push(rootNid)
        return out
    }

    getEntityTreeDeletes(rootNid: number) {
        let tree = this.treeDeleteCache.get(rootNid)
        if (!tree) {
            tree = this.buildEntityTreeDeletes(rootNid, [])
            this.treeDeleteCache.set(rootNid, tree)
        }
        return tree
    }

    collectEntityTreeDeletes(rootNid: number, out: number[]) {
        const tree = this.getEntityTreeDeletes(rootNid)
        for (let i = 0; i < tree.length; i++) {
            out.push(tree[i])
        }
        return out
    }

    private unregisterChildren(parentNid: number) {
        const children = this.children.get(parentNid)
        if (!children) {
            return
        }

        const childNids = Array.from(children)
        for (let i = 0; i < childNids.length; i++) {
            const child = this.getByNid(childNids[i])
            if (child) {
                this.unregisterEntity(child, parentNid)
            }
        }
        this.children.delete(parentNid)
    }

    releaseDeferredIds() {
        // Returned nids become reusable only after the snapshot boundary.
        this.nidPool.releaseDeferredIds()
    }
}
