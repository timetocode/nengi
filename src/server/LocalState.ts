import { IdPool } from './IdPool'
import { IEntity } from '../common/IEntity'
import { NDictionary } from './NDictionary'
import { IChannel } from './IChannel'
import { Binary } from '../common/binary/Binary'
import { NetworkIdType, maxValueForNetworkType, nextNetworkType } from '../common/binary/Protocol'

export class LocalState {
    nidType: NetworkIdType = Binary.UInt8
    nidPool: IdPool = new IdPool(maxValueForNetworkType(Binary.UInt8))
    /**
     * Entity nid -> source ids currently keeping that entity networked.
     * Source ids can be channels or parent entity nids. They are networking
     * references, not ownership of the user's game object.
     */
    sources: Map<number, Set<number>> = new Map()
    /**
     * Parent entity nid -> child entity nids. Children cascade visibility from
     * the parent, but userland still owns object lifetime and game semantics.
     */
    children: Map<number, Set<number>>= new Map()
    _entities: NDictionary = new NDictionary()
    channels: Set<IChannel> = new Set()

    tick(tick: number) {
        this.channels.forEach(channel => channel.tick(tick))
    }

    addChild(parentNid: number, child: IEntity) {
        const cnid = this.registerEntity(child, parentNid)
        if (!this.children.get(parentNid)) {
            this.children.set(parentNid, new Set())
        }
        this.children.get(parentNid)!.add(cnid)
    }

    removeChild(parentNid: number, child: IEntity) {
        const cnid = child.nid
        this.children.get(parentNid)?.delete(cnid)
        this.unregisterEntity(child, parentNid)
    }

    registerEntity(entity: IEntity, sourceId: number) {
        let nid = entity.nid
        if (!this.sources.has(nid)) {
            if (!this.nidPool.hasFreshId() && this.nidPool.isFull()) {
                const nextType = nextNetworkType(this.nidType)
                if (!nextType) {
                    throw new Error('No nid values are available.')
                }
                this.nidType = nextType
                this.nidPool.setMax(maxValueForNetworkType(nextType))
            }
            nid = this.nidPool.nextId()
            entity.nid = nid
            this.sources.set(nid, new Set())
            this._entities.add(entity)
        }
        const entitySources = this.sources.get(nid)!
        entitySources.add(sourceId)
        return nid
    }

    unregisterEntity(entity: IEntity, sourceId: number) {
        const nid = entity.nid
        const entitySources = this.sources.get(nid)!
        entitySources.delete(sourceId)

        if (entitySources.size === 0) {
            this.sources.delete(nid)
            this._entities.remove(entity)
            this.nidPool.returnId(nid)
            entity.nid = 0
        }
    }

    getByNid(nid: number): IEntity {
        return this._entities.get(nid)
    }

    releaseDeferredIds() {
        // Returned nids become reusable only after the snapshot boundary.
        this.nidPool.releaseDeferredIds()
    }
}
