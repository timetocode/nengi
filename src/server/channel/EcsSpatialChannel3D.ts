import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'
import { ChannelHeader, ChannelHeaderInput, ChannelType, createChannelHeader, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { IEntity } from '../../common/IEntity'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { SpatialGrid3D, SpatialGridCell } from './SpatialGrid'
import { normalizeSpatialView3D, objectInSpatialView3D, SpatialView3D } from './SpatialView'

export type EcsSpatial3DComponent = IEntity & { pid: number }

export type EcsSpatial3DUpdateLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupNTypes: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
    manualOpTypes: number[]
    manualOpIndexes: number[]
    manualNeedsCoalesce: boolean
}

type Cell = SpatialGridCell<EcsSpatial3DComponent> & EcsSpatial3DUpdateLog

export type EcsSpatial3DTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (component: EcsSpatial3DComponent, value: any) => void }
    readonly groups: { [name: string]: (component: EcsSpatial3DComponent, ...values: any[]) => void }
}

export type EcsSpatialChannel3DOptions = {
    name?: string
    header?: ChannelHeaderInput
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    spatialProps?: { x?: string, y?: string, z?: string }
    strictManualWrites?: boolean
}

function createUpdateLog(): EcsSpatial3DUpdateLog {
    return {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: [],
        manualOpTypes: [],
        manualOpIndexes: [],
        manualNeedsCoalesce: false
    }
}

function initializeEcsSpatialCell(cell: SpatialGridCell<EcsSpatial3DComponent>) {
    Object.assign(cell, createUpdateLog())
}

// EcsSpatialChannel3D intentionally mirrors EcsSpatialChannel2D instead of
// using a dimension-generic wrapper; this is snapshot hot-path code, so
// benchmark before collapsing the parallel implementations.
export class EcsSpatialChannel3D {
    readonly ecsSpatialChannelMode = true
    readonly ecsChannelMode = true
    nid: number
    localState: LocalState
    users: Map<number, User> = new Map()
    header: ChannelHeader
    headerVersion = 0
    channelType = ChannelType.EcsSpatialChannel3D
    visibilityResolver = objectInSpatialView3D
    cellSize: number
    queryPadding: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    membershipVersion = 0
    rootNids: number[] = []
    componentNids: number[] = []
    createdRoots: number[] = []
    deletedRoots: number[] = []
    createdComponents: EcsSpatial3DComponent[] = []
    deletedComponents: number[] = []
    rootDeletedComponents: number[] = []
    manualPropNids: number[] = []
    manualPropSchemas: SchemaProp[] = []
    manualPropValues: any[] = []
    manualGroupNids: number[] = []
    manualGroupNTypes: number[] = []
    manualGroupSchemas: SchemaUpdateGroup[] = []
    manualGroupValueOffsets: number[] = []
    manualGroupValues: any[] = []
    manualOpTypes: number[] = []
    manualOpIndexes: number[] = []
    manualNeedsCoalesce = false
    skipInterpolationNids: number[] = []
    dirtyCells: Set<string> = new Set()
    broadcastMessages: any[] = []
    interpolatedBroadcastMessages: any[] = []
    private rootSet: Set<number> = new Set()
    private componentSet: Set<number> = new Set()
    private componentsByRoot: Map<number, EcsSpatial3DComponent[]> = new Map()
    private componentByNid: Map<number, EcsSpatial3DComponent> = new Map()
    private spatialComponentByRoot: Map<number, EcsSpatial3DComponent> = new Map()
    private views: Map<number, SpatialView3D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid3D<EcsSpatial3DComponent>
    private visibleCellKeyCache: Map<number, { viewVersion: number, membershipVersion: number, keys: string[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private structuralDeltas = false
    private spatialXProp: string
    private spatialYProp: string
    private spatialZProp: string
    private strictManualWrites: boolean

    constructor(localState: LocalState, cellSize: number, options: EcsSpatialChannel3DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('EcsSpatialChannel3D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('EcsSpatialChannel3D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.header = createChannelHeader(this.nid, this.channelType, options.header, options.name)
        this.headerVersion = hasSchemaBackedChannelHeader(this.header) ? 1 : 0
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.spatialXProp = options.spatialProps?.x || 'x'
        this.spatialYProp = options.spatialProps?.y || 'y'
        this.spatialZProp = options.spatialProps?.z || 'z'
        this.strictManualWrites = options.strictManualWrites === true
        this.grid = new SpatialGrid3D({
            cellSize,
            getX: component => component[this.spatialXProp],
            getY: component => component[this.spatialYProp],
            getZ: component => component[this.spatialZProp],
            initializeCell: initializeEcsSpatialCell
        })
        this.localState.channels.add(this as any)
    }

    private addRootToCell(pid: number, component: EcsSpatial3DComponent) {
        return this.grid.add(pid, component).createdCell
    }

    private removeRootFromCell(pid: number) {
        return this.grid.remove(pid)?.removedCell || false
    }

    private updateRootCell(pid: number) {
        const component = this.spatialComponentByRoot.get(pid)
        if (!component) {
            return
        }

        const move = this.grid.update(pid, component)
        if (!move) {
            return
        }
        this.membershipVersion++
        this.structuralDeltas = true
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleNetworkedNidsCache()
        }
    }

    private invalidateVisibleNetworkedNidsCache() {
        this.visibleNetworkedNidsCache.clear()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleNetworkedNidsCache()
    }

    private viewRange(view: SpatialView3D) {
        const spatialView = normalizeSpatialView3D(view)
        const halfWidth = spatialView.halfWidth + this.queryPadding
        const halfHeight = spatialView.halfHeight + this.queryPadding
        const halfDepth = spatialView.halfDepth + this.queryPadding
        return {
            minX: this.grid.cellCoord(spatialView.x - halfWidth),
            maxX: this.grid.cellCoordForEnd(spatialView.x + halfWidth),
            minY: this.grid.cellCoord(spatialView.y - halfHeight),
            maxY: this.grid.cellCoordForEnd(spatialView.y + halfHeight),
            minZ: this.grid.cellCoord(spatialView.z - halfDepth),
            maxZ: this.grid.cellCoordForEnd(spatialView.z + halfDepth)
        }
    }

    private getComponentCell(component: EcsSpatial3DComponent) {
        const pid = component.pid
        const spatial = this.spatialComponentByRoot.get(pid)
        if (spatial) {
            this.updateRootCell(pid)
        }
        const ref = this.grid.objectCells.get(pid)
        return ref ? this.grid.cells.get(ref.key) as Cell || null : null
    }

    private markCellDirtyForComponent(component: EcsSpatial3DComponent) {
        const cell = this.getComponentCell(component)
        if (!cell) {
            if (this.strictManualWrites) {
                throw new Error(`EcsSpatialChannel3D cannot write mutation for component nid ${component.nid}; no spatial cell was found for pid ${component.pid}.`)
            }
            return null
        }
        this.dirtyCells.add(cell.key)
        return cell
    }

    private manualMutationKey(nid: number, key: number) {
        return nid * 256 + key
    }

    private appendManualProp(log: EcsSpatial3DUpdateLog, component: EcsSpatial3DComponent, prop: SchemaProp, value: any) {
        log.manualOpTypes.push(0)
        log.manualOpIndexes.push(log.manualPropNids.length)
        log.manualPropNids.push(component.nid)
        log.manualPropSchemas.push(prop)
        log.manualPropValues.push(value)
        log.manualNeedsCoalesce = true
    }

    private appendManualGroup(log: EcsSpatial3DUpdateLog, ntype: number, component: EcsSpatial3DComponent, group: SchemaUpdateGroup, values: IArguments | any[]) {
        log.manualOpTypes.push(1)
        log.manualOpIndexes.push(log.manualGroupNids.length)
        log.manualGroupNids.push(component.nid)
        log.manualGroupNTypes.push(ntype)
        log.manualGroupSchemas.push(group)
        log.manualGroupValueOffsets.push(log.manualGroupValues.length)
        for (let i = 0; i < group.props.length; i++) {
            log.manualGroupValues.push(values[i + 1])
        }
        log.manualNeedsCoalesce = true
    }

    private manualLogHasCoalesceConflict(log: EcsSpatial3DUpdateLog) {
        if (log.manualOpTypes.length < 2) {
            return false
        }

        if (log.manualPropNids.length === 0) {
            const groupKeys = new Set<number>()
            for (let i = 0; i < log.manualGroupNids.length; i++) {
                const key = this.manualMutationKey(log.manualGroupNids[i], log.manualGroupSchemas[i].key)
                if (groupKeys.has(key)) {
                    return true
                }
                groupKeys.add(key)
            }
            return false
        }

        if (log.manualGroupNids.length === 0) {
            const propKeys = new Set<number>()
            for (let i = 0; i < log.manualPropNids.length; i++) {
                const key = this.manualMutationKey(log.manualPropNids[i], log.manualPropSchemas[i].key)
                if (propKeys.has(key)) {
                    return true
                }
                propKeys.add(key)
            }
            return false
        }

        const propKeys = new Set<number>()
        const groupKeys = new Set<number>()
        const groupPropKeys = new Set<number>()
        for (let i = 0; i < log.manualOpTypes.length; i++) {
            const index = log.manualOpIndexes[i]
            if (log.manualOpTypes[i] === 0) {
                const nid = log.manualPropNids[index]
                const prop = log.manualPropSchemas[index]
                const key = this.manualMutationKey(nid, prop.key)
                if (propKeys.has(key) || groupPropKeys.has(key)) {
                    return true
                }
                propKeys.add(key)
                continue
            }

            const nid = log.manualGroupNids[index]
            const group = log.manualGroupSchemas[index]
            const groupKey = this.manualMutationKey(nid, group.key)
            if (groupKeys.has(groupKey)) {
                return true
            }
            for (let j = 0; j < group.props.length; j++) {
                const propKey = this.manualMutationKey(nid, group.props[j].key)
                if (propKeys.has(propKey)) {
                    return true
                }
                groupPropKeys.add(propKey)
            }
            groupKeys.add(groupKey)
        }
        return false
    }

    private coalesceManualLog(log: EcsSpatial3DUpdateLog) {
        if (!log.manualNeedsCoalesce) {
            return
        }
        if (!this.manualLogHasCoalesceConflict(log)) {
            log.manualOpTypes.length = 0
            log.manualOpIndexes.length = 0
            log.manualNeedsCoalesce = false
            return
        }

        const props = new Map<number, { nid: number, prop: SchemaProp, value: any }>()
        const groups = new Map<number, { nid: number, ntype: number, group: SchemaUpdateGroup, values: any[] }>()
        const splitGroupsForProp = (nid: number, prop: SchemaProp) => {
            groups.forEach((entry, key) => {
                if (entry.nid !== nid) {
                    return
                }
                let overlaps = false
                for (let i = 0; i < entry.group.props.length; i++) {
                    if (entry.group.props[i].key === prop.key) {
                        overlaps = true
                        break
                    }
                }
                if (!overlaps) {
                    return
                }
                for (let i = 0; i < entry.group.props.length; i++) {
                    const groupProp = entry.group.props[i]
                    props.set(this.manualMutationKey(nid, groupProp.key), { nid, prop: groupProp, value: entry.values[i] })
                }
                groups.delete(key)
            })
        }

        for (let i = 0; i < log.manualOpTypes.length; i++) {
            const index = log.manualOpIndexes[i]
            if (log.manualOpTypes[i] === 0) {
                const nid = log.manualPropNids[index]
                const prop = log.manualPropSchemas[index]
                splitGroupsForProp(nid, prop)
                props.set(this.manualMutationKey(nid, prop.key), {
                    nid,
                    prop,
                    value: log.manualPropValues[index]
                })
                continue
            }

            const nid = log.manualGroupNids[index]
            const group = log.manualGroupSchemas[index]
            for (let j = 0; j < group.props.length; j++) {
                props.delete(this.manualMutationKey(nid, group.props[j].key))
            }
            const values = []
            let offset = log.manualGroupValueOffsets[index]
            for (let j = 0; j < group.props.length; j++) {
                values.push(log.manualGroupValues[offset++])
            }
            groups.set(this.manualMutationKey(nid, group.key), {
                nid,
                ntype: log.manualGroupNTypes[index],
                group,
                values
            })
        }

        log.manualPropNids.length = 0
        log.manualPropSchemas.length = 0
        log.manualPropValues.length = 0
        props.forEach(entry => {
            log.manualPropNids.push(entry.nid)
            log.manualPropSchemas.push(entry.prop)
            log.manualPropValues.push(entry.value)
        })

        log.manualGroupNids.length = 0
        log.manualGroupNTypes.length = 0
        log.manualGroupSchemas.length = 0
        log.manualGroupValueOffsets.length = 0
        log.manualGroupValues.length = 0
        groups.forEach(entry => {
            log.manualGroupNids.push(entry.nid)
            log.manualGroupNTypes.push(entry.ntype)
            log.manualGroupSchemas.push(entry.group)
            log.manualGroupValueOffsets.push(log.manualGroupValues.length)
            for (let i = 0; i < entry.values.length; i++) {
                log.manualGroupValues.push(entry.values[i])
            }
        })

        log.manualOpTypes.length = 0
        log.manualOpIndexes.length = 0
        log.manualNeedsCoalesce = false
    }

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        if (!view) {
            return keys
        }

        const spatialView = normalizeSpatialView3D(view)
        return spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding) :
            this.grid.getVisibleCellKeys(this.viewRange(view))
    }

    private appendRootNetworkedNids(pid: number, nids: number[]) {
        nids.push(pid)
        const components = this.componentsByRoot.get(pid)
        if (!components) {
            return
        }
        for (let i = 0; i < components.length; i++) {
            nids.push(components[i].nid)
        }
    }

    createEntity() {
        const nid = this.localState.nextNetworkId()
        this.rootNids.push(nid)
        this.rootSet.add(nid)
        this.componentsByRoot.set(nid, [])
        this.createdRoots.push(nid)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
        return nid
    }

    addEntity() {
        return this.createEntity()
    }

    markHeaderDirty() {
        if (!hasSchemaBackedChannelHeader(this.header)) {
            return false
        }
        this.headerVersion++
        return true
    }

    removeEntity(pidOrEntity: number | IEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid
        if (!this.rootSet.has(pid)) {
            return 0
        }

        const components = this.componentsByRoot.get(pid) || []
        for (let i = components.length - 1; i >= 0; i--) {
            this.removeComponentInternal(components[i], false)
        }

        const createdIndex = this.createdRoots.indexOf(pid)
        if (createdIndex > -1) {
            this.createdRoots.splice(createdIndex, 1)
        } else {
            this.deletedRoots.push(pid)
        }
        this.rootSet.delete(pid)
        this.componentsByRoot.delete(pid)
        this.spatialComponentByRoot.delete(pid)
        const removedCell = this.removeRootFromCell(pid)
        const rootIndex = this.rootNids.indexOf(pid)
        if (rootIndex > -1) {
            this.rootNids.splice(rootIndex, 1)
        }
        this.localState.nidPool.returnId(pid)
        this.membershipVersion++
        this.structuralDeltas = true
        if (removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleNetworkedNidsCache()
        }
        return pid
    }

    removeAllEntities() {
        const roots = this.rootNids.slice()
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i])
        }
    }

    addComponent<T extends IEntity>(pid: number, component: T, options: { spatial?: boolean } = {}): T & EcsSpatial3DComponent {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS spatial component to unknown entity nid ${pid}.`)
        }
        const ecsComponent = component as T & EcsSpatial3DComponent
        const nid = this.localState.registerEntity(ecsComponent, pid)
        ecsComponent.pid = pid
        this.componentNids.push(nid)
        this.componentSet.add(nid)
        this.componentByNid.set(nid, ecsComponent)
        this.componentsByRoot.get(pid)!.push(ecsComponent)
        if (options.spatial) {
            this.spatialComponentByRoot.set(pid, ecsComponent)
            if (!this.grid.objectCells.has(pid)) {
                this.addRootToCell(pid, ecsComponent)
            } else {
                this.updateRootCell(pid)
            }
        }
        this.createdComponents.push(ecsComponent)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
        return ecsComponent
    }

    addSpatialComponent<T extends IEntity>(pid: number, component: T) {
        return this.addComponent(pid, component, { spatial: true })
    }

    private removeComponentInternal(componentOrNid: EcsSpatial3DComponent | number, queueDelete: boolean) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component) {
            return
        }
        const pid = component.pid
        const createdIndex = this.createdComponents.findIndex(created => created.nid === nid)
        if (createdIndex > -1) {
            this.createdComponents.splice(createdIndex, 1)
        } else if (queueDelete) {
            this.deletedComponents.push(nid)
        } else {
            this.rootDeletedComponents.push(nid)
        }
        if (this.spatialComponentByRoot.get(pid)?.nid === nid) {
            this.spatialComponentByRoot.delete(pid)
            this.removeRootFromCell(pid)
        }
        this.componentSet.delete(nid)
        this.componentByNid.delete(nid)
        const componentIndex = this.componentNids.indexOf(nid)
        if (componentIndex > -1) {
            this.componentNids.splice(componentIndex, 1)
        }
        const components = this.componentsByRoot.get(pid)
        if (components) {
            const rootComponentIndex = components.findIndex(rootComponent => rootComponent.nid === nid)
            if (rootComponentIndex > -1) {
                components.splice(rootComponentIndex, 1)
            }
        }
        this.localState.unregisterEntity(component, pid)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleNetworkedNidsCache()
    }

    removeComponent(componentOrNid: EcsSpatial3DComponent | number) {
        this.removeComponentInternal(componentOrNid, true)
    }

    setSpatialComponent(pid: number, componentOrNid: EcsSpatial3DComponent | number) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (!component || component.pid !== pid) {
            throw new Error(`Cannot use component nid ${nid} as spatial component for ECS entity nid ${pid}.`)
        }
        this.spatialComponentByRoot.set(pid, component)
        if (!this.grid.objectCells.has(pid)) {
            this.addRootToCell(pid, component)
            this.membershipVersion++
            this.structuralDeltas = true
            this.invalidateVisibleCellKeyCache()
        } else {
            this.updateRootCell(pid)
        }
    }

    updateSpatialComponent(componentOrNid: EcsSpatial3DComponent | number) {
        const nid = typeof componentOrNid === 'number' ? componentOrNid : componentOrNid.nid
        const component = this.componentByNid.get(nid)
        if (component) {
            this.updateRootCell(component.pid)
        }
    }

    isRootNid(nid: number) {
        return this.rootSet.has(nid) || this.deletedRoots.indexOf(nid) > -1
    }

    isComponentNid(nid: number) {
        return this.componentSet.has(nid) || this.deletedComponents.indexOf(nid) > -1
    }

    isRootDeletedComponentNid(nid: number) {
        return this.rootDeletedComponents.indexOf(nid) > -1
    }

    getComponent(nid: number) {
        return this.componentByNid.get(nid)
    }

    getVisibleEntities(userId: number) {
        const roots: number[] = []
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i])
            if (!cell) {
                continue
            }
            roots.push(...cell.ids)
        }
        return roots
    }

    getVisibleNetworkedNids(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleNetworkedNidsCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids
        }

        const nids: number[] = []
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i])
            if (!cell) {
                continue
            }
            for (let j = 0; j < cell.ids.length; j++) {
                this.appendRootNetworkedNids(cell.ids[j], nids)
            }
        }
        this.visibleNetworkedNidsCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, nids })
        return nids
    }

    getVisibleCellKeys(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellKeyCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.keys
        }

        const keys = this.buildVisibleCellKeys(userId)
        this.visibleCellKeyCache.set(userId, { viewVersion, membershipVersion: this.membershipVersion, keys })
        return keys
    }

    getCellRootNids(key: string) {
        return this.grid.cells.get(key)?.ids || []
    }

    getManualCellUpdateLog(key: string) {
        const cell = this.grid.cells.get(key) as Cell
        if (!cell) {
            return null
        }
        this.coalesceManualLog(cell)
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null
        }
        return cell
    }

    cellHasManualUpdates(key: string) {
        return this.getManualCellUpdateLog(key) !== null
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    hasManualUpdates() {
        return this.manualPropNids.length > 0 || this.manualGroupNids.length > 0 || this.dirtyCells.size > 0
    }

    subscribe(user: User, view: SpatialView3D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: SpatialView3D) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, (this.viewVersions.get(user.id) || 0) + 1)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    addMessage(message: any) {
        // Spatial messages are culled immediately against the current user
        // views instead of being stored as channel broadcast fragments.
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelMessage(this.nid, message)
            }
        })
    }

    addInterpolatedMessage(message: any) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueChannelInterpolatedMessage(this.nid, message)
            }
        })
    }

    // ECS roots are ids only; skip interpolation is meaningful for stateful
    // components that the client interpolates, such as transform components.
    skipInterpolation(pidOrComponent: number | IEntity) {
        const nid = typeof pidOrComponent === 'number' ? pidOrComponent : pidOrComponent.nid
        if (!this.componentSet.has(nid)) {
            return false
        }
        this.skipInterpolationNids.push(nid)
        return true
    }

    clearBroadcastMessages() {
        this.interpolatedBroadcastMessages.length = 0
    }

    clearSnapshotDeltas() {
        const clearLog = (log: EcsSpatial3DUpdateLog) => {
            log.manualPropNids.length = 0
            log.manualPropSchemas.length = 0
            log.manualPropValues.length = 0
            log.manualGroupNids.length = 0
            log.manualGroupNTypes.length = 0
            log.manualGroupSchemas.length = 0
            log.manualGroupValueOffsets.length = 0
            log.manualGroupValues.length = 0
            log.manualOpTypes.length = 0
            log.manualOpIndexes.length = 0
            log.manualNeedsCoalesce = false
        }
        for (const key of this.dirtyCells) {
            const cell = this.grid.cells.get(key) as Cell
            if (cell) {
                clearLog(cell)
            }
        }
        clearLog(this)
        this.createdRoots.length = 0
        this.deletedRoots.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.rootDeletedComponents.length = 0
        this.skipInterpolationNids.length = 0
        this.dirtyCells.clear()
        this.structuralDeltas = false
    }

    destroy() {
        this.unsubscribeAll()
        this.removeAllEntities()
        this.localState.nidPool.returnId(this.nid)
        this.localState.channels.delete(this as any)
        this.rootNids.length = 0
        this.componentNids.length = 0
        this.createdRoots.length = 0
        this.deletedRoots.length = 0
        this.createdComponents.length = 0
        this.deletedComponents.length = 0
        this.rootDeletedComponents.length = 0
        this.manualPropNids.length = 0
        this.manualPropSchemas.length = 0
        this.manualPropValues.length = 0
        this.manualGroupNids.length = 0
        this.manualGroupNTypes.length = 0
        this.manualGroupSchemas.length = 0
        this.manualGroupValueOffsets.length = 0
        this.manualGroupValues.length = 0
        this.manualOpTypes.length = 0
        this.manualOpIndexes.length = 0
        this.manualNeedsCoalesce = false
        this.dirtyCells.clear()
        this.broadcastMessages.length = 0
        this.interpolatedBroadcastMessages.length = 0
        this.rootSet.clear()
        this.componentSet.clear()
        this.componentsByRoot.clear()
        this.componentByNid.clear()
        this.spatialComponentByRoot.clear()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleNetworkedNidsCache.clear()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.structuralDeltas = false
    }

    createComponentWriter(ntype: number, schema: Schema): EcsSpatial3DTypeWriters {
        const props: EcsSpatial3DTypeWriters['props'] = Object.create(null)
        const groups: EcsSpatial3DTypeWriters['groups'] = Object.create(null)
        const writers: EcsSpatial3DTypeWriters = { ntype, schema, props, groups }

        const aliases = new Set<string>()
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups'])
        const addAlias = (name: string, writer: any) => {
            if (blockedAliases.has(name)) {
                return
            }
            if (aliases.has(name)) {
                delete writers[name]
                blockedAliases.add(name)
                return
            }
            aliases.add(name)
            writers[name] = writer
        }

        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = (component: EcsSpatial3DComponent, value: any) => {
                const cell = this.markCellDirtyForComponent(component)
                if (!cell) {
                    return
                }
                this.appendManualProp(cell, component, prop, value)
            }
            addAlias(name, props[name])
        }

        const writeGroup = (component: EcsSpatial3DComponent, group: SchemaUpdateGroup, values: IArguments | any[]) => {
            const cell = this.markCellDirtyForComponent(component)
            if (!cell) {
                return
            }
            this.appendManualGroup(cell, ntype, component, group, values)
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            groups[group.name] = function writeEcsSpatialGroup(component: EcsSpatial3DComponent) {
                writeGroup(component, group, arguments)
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

}
