import { EDictionary } from './EDictionary'
import { IdPool } from './IdPool'
import { IEntity } from '../common/IEntity'

export class LocalState {
    nidPool: IdPool
    sources: Map<number, Set<number>>
    children: Map<number, Set<number>>
    _entities: EDictionary

    constructor() {
        this.nidPool = new IdPool(65535)
        this.sources = new Map()
        this.children = new Map()
        this._entities = new EDictionary()
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
}