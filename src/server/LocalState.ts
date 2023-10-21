import { IdPool } from './IdPool'
import { NDictionary } from './NDictionary'

type nid = number
type parentNid = nid
type childNid = nid
interface IEntity { nid: nid, ntype: number }

export class LocalState {
    nidPool: IdPool = new IdPool(65535)
    children: Map<parentNid, Set<childNid>> = new Map()
    parents: Map<childNid, Set<parentNid>> = new Map()
    _entities: NDictionary = new NDictionary()

    addEntity(entity: IEntity) {
        if (entity.nid === 0) {
            entity.nid = this.nidPool.nextId()
        }
        // @ts-ignore
        entity.hasChildren = false
        this._entities.add(entity)
    }

    addChild(child: IEntity, parent: IEntity) {
        const pnid = parent.nid
        // @ts-ignore
        parent.hasChildren = true
        this.addEntity(child) // assigns a nid to the child
        const cnid = child.nid
        if (!this.children.has(pnid)) {
            this.children.set(pnid, new Set())
        }
        this.children.get(pnid)!.add(cnid)
        if (!this.parents.has(cnid)) {
            this.parents.set(cnid, new Set())
        }
        this.parents.get(cnid)!.add(pnid)
    }

    removeEntity(entity: IEntity) {
        const nid = entity.nid
        if (nid === 0) {
            return
        }
    
        // Remove from children
        const childNids = this.children.get(nid)
        if (childNids) {
            for (const cnid of childNids) {
                const childEntity = this._entities.get(cnid)
                if (childEntity) {
                    this.removeEntity(childEntity)
                }
            }
            this.children.delete(nid)
        }
    
        // Remove as a child from parents and check for orphaned children
        if (this.parents.has(nid)) {
            const parentNids = this.parents.get(nid)!
            for (const pnid of parentNids) {
                if (this.children.has(pnid)) {
                    this.children.get(pnid)!.delete(nid)
                }
            }
            this.parents.delete(nid)
        }
    
        // Remove as a parent from children
        for (const [pnid, childSet] of this.children.entries()) {
            if (childSet.has(nid)) {
                childSet.delete(nid)
                if (childSet.size === 0) {
                    const parentEntity = this._entities.get(pnid)
                    if (parentEntity) {
                        this.removeEntity(parentEntity)
                    }
                }
            }
        }
    
        // Remove entity from _entities
        this._entities.remove(entity)
    
        // Return nid to the pool
        this.nidPool.returnId(nid)
    }

    getByNid(nid: number): IEntity {
        return this._entities.get(nid)
    }
}