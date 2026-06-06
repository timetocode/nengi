import { IEntity } from '../common/IEntity'
import { AABB2D } from './AABB2D'
import { CellChannel, CellChannelOptions } from './CellChannel'
import { LocalState, MutationMode } from './LocalState'
import { Point2D } from './Point2D'

type CellEntity = IEntity & Point2D

export type MutationCellChannelOptions = CellChannelOptions & {
    mutationMode?: MutationMode
    dirtyCellFullScanThreshold?: number
    dirtyCellFullScanMinEntities?: number
}

export class MutationCellChannel extends CellChannel {
    readonly mutationCellFragmentMode = true
    readonly mutationMode: MutationMode
    readonly dirtyCellFullScanThreshold: number
    readonly dirtyCellFullScanMinEntities: number
    dirtyNids: Set<number> = new Set()
    private dirtyNidsByCell: Map<string, Set<number>> = new Map()
    propMutations: Map<number, Set<string>> = new Map()
    groupMutations: Map<number, Set<string>> = new Map()
    private cellByNid: Map<number, string> = new Map()

    constructor(localState: LocalState, cellSize: number, options: MutationCellChannelOptions = {}) {
        super(localState, cellSize, options)
        this.mutationMode = options.mutationMode || localState.mutationMode
        this.dirtyCellFullScanThreshold = options.dirtyCellFullScanThreshold ?? 0.65
        this.dirtyCellFullScanMinEntities = Math.max(1, Math.floor(options.dirtyCellFullScanMinEntities ?? 8))
    }

    private mutationCellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    private cellKeyForEntity(entity: Point2D) {
        return `${this.mutationCellCoord(entity.x)}:${this.mutationCellCoord(entity.y)}`
    }

    private rememberDirtyCellNid(cellKey: string, nid: number) {
        let nids = this.dirtyNidsByCell.get(cellKey)
        if (!nids) {
            nids = new Set()
            this.dirtyNidsByCell.set(cellKey, nids)
        }
        nids.add(nid)
    }

    private reconcileSpatialCell(entity: CellEntity) {
        const previousKey = this.cellByNid.get(entity.nid)
        const nextKey = this.cellKeyForEntity(entity)
        if (previousKey && previousKey !== nextKey) {
            this.rememberDirtyCellNid(previousKey, entity.nid)
            super.updateEntity(entity)
        }
        this.cellByNid.set(entity.nid, nextKey)
        return nextKey
    }

    addEntity(entity: CellEntity) {
        const added = super.addEntity(entity)
        this.cellByNid.set(added.nid, this.cellKeyForEntity(added))
        return added
    }

    updateEntity(entity: CellEntity) {
        const previousKey = this.cellByNid.get(entity.nid)
        super.updateEntity(entity)
        const nextKey = this.cellKeyForEntity(entity)
        if (previousKey && previousKey !== nextKey) {
            this.rememberDirtyCellNid(previousKey, entity.nid)
            this.rememberDirtyCellNid(nextKey, entity.nid)
        }
        this.cellByNid.set(entity.nid, nextKey)
    }

    removeEntity(entity: CellEntity) {
        this.cellByNid.delete(entity.nid)
        super.removeEntity(entity)
    }

    tick(tick: number) {
        super.tick(tick)
        if (this.mutationMode !== 'implicit') {
            return
        }

        const entities = this.entities.array
        for (let i = 0; i < entities.length; i++) {
            this.reconcileSpatialCell(entities[i] as CellEntity)
        }
    }

    markDirty(entity: CellEntity) {
        if (entity.nid === 0 || !this.localState.sources.has(entity.nid)) {
            return false
        }

        const cellKey = this.reconcileSpatialCell(entity)
        this.dirtyNids.add(entity.nid)
        this.rememberDirtyCellNid(cellKey, entity.nid)
        return true
    }

    mutate<T extends CellEntity, K extends keyof T & string>(entity: T, prop: K, value: T[K]) {
        entity[prop] = value
        this.markPropDirty(entity, prop)
        return value
    }

    mutateGroup<T extends CellEntity>(entity: T, groupName: string, values: { [K in keyof T & string]?: T[K] }) {
        const target = entity as any
        for (const prop in values) {
            target[prop] = values[prop]
        }
        this.markGroupDirty(entity, groupName)
        return values
    }

    markPropDirty<T extends CellEntity, K extends keyof T & string>(entity: T, prop: K) {
        this.markDirty(entity)
        let props = this.propMutations.get(entity.nid)
        if (!props) {
            props = new Set()
            this.propMutations.set(entity.nid, props)
        }
        props.add(prop)
        return entity[prop]
    }

    markGroupDirty(entity: CellEntity, groupName: string) {
        this.markDirty(entity)
        let groups = this.groupMutations.get(entity.nid)
        if (!groups) {
            groups = new Set()
            this.groupMutations.set(entity.nid, groups)
        }
        groups.add(groupName)
    }

    getDirtyCellKeys() {
        return Array.from(this.dirtyNidsByCell.keys())
    }

    getDirtyNidsForCell(cellKey: string) {
        return this.dirtyNidsByCell.get(cellKey) || new Set<number>()
    }

    shouldFullScanDirtyCell(cellKey: string) {
        const dirtyCount = this.dirtyNidsByCell.get(cellKey)?.size || 0
        if (dirtyCount === 0) {
            return false
        }
        const cellCount = this.getCellEntityNids(cellKey).length
        return cellCount >= this.dirtyCellFullScanMinEntities &&
            dirtyCount / cellCount >= this.dirtyCellFullScanThreshold
    }

    subscribe(user: any, view: AABB2D) {
        super.subscribe(user, view)
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.dirtyNids.clear()
        this.dirtyNidsByCell.clear()
        this.propMutations.clear()
        this.groupMutations.clear()
    }
}
