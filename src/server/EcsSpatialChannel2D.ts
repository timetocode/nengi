import { Schema, SchemaProp, SchemaUpdateGroup } from '../common/binary/schema/Schema'
import { IEntity } from '../common/IEntity'
import { IChannel } from './IChannel'
import { LocalState } from './LocalState'
import { SpatialGrid2D, SpatialGridCell } from './SpatialGrid'
import { getSpatialPlaneAxes, normalizeSpatialView, objectInSpatialView, SpatialPlane, SpatialPlaneAxes, SpatialView } from './SpatialPlane'
import { User } from './User'

export type EcsSpatial2DComponent = IEntity & { pid: number }
export type EcsSpatial2DMove = { pid: number, fromCell: string, toCell: string }

export type EcsSpatial2DUpdateLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupNTypes: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
}

type Cell = SpatialGridCell<EcsSpatial2DComponent> & EcsSpatial2DUpdateLog

export type EcsSpatial2DTypeWriters = {
    [name: string]: any
    readonly ntype: number
    readonly schema: Schema
    readonly props: { [name: string]: (component: EcsSpatial2DComponent, value: any) => void }
    readonly groups: { [name: string]: (component: EcsSpatial2DComponent, ...values: any[]) => void }
}

export type EcsSpatialChannel2DOptions = {
    label?: string
    clientIdentity?: any
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    plane?: SpatialPlane
    spatialProps?: { x?: string, y?: string }
}

function createUpdateLog(): EcsSpatial2DUpdateLog {
    return {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    }
}

function initializeEcsSpatialCell(cell: SpatialGridCell<EcsSpatial2DComponent>) {
    Object.assign(cell, createUpdateLog())
}

export class EcsSpatialChannel2D implements IChannel {
    readonly ecsSpatialChannelMode = true
    readonly ecsChannelMode = true
    nid: number
    label?: string
    clientIdentity?: any
    localState: LocalState
    users: Map<number, User> = new Map()
    visibilityResolver = (obj: any, view: SpatialView) => objectInSpatialView(obj, view, this.plane)
    cellSize: number
    queryPadding: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    membershipVersion = 0
    rootNids: number[] = []
    componentNids: number[] = []
    createdRoots: number[] = []
    deletedRoots: number[] = []
    createdComponents: EcsSpatial2DComponent[] = []
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
    dirtyCells: Set<string> = new Set()
    broadcastMessages: any[] = []
    private rootSet: Set<number> = new Set()
    private componentSet: Set<number> = new Set()
    private componentsByRoot: Map<number, EcsSpatial2DComponent[]> = new Map()
    private componentByNid: Map<number, EcsSpatial2DComponent> = new Map()
    private spatialComponentByRoot: Map<number, EcsSpatial2DComponent> = new Map()
    private views: Map<number, SpatialView> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid2D<EcsSpatial2DComponent>
    private visibleCellKeyCache: Map<number, { viewVersion: number, membershipVersion: number, keys: string[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private movedRoots: EcsSpatial2DMove[] = []
    private structuralDeltas = false
    private spatialXProp: string
    private spatialYProp: string
    plane: SpatialPlane
    private axes: SpatialPlaneAxes

    constructor(localState: LocalState, cellSize: number, options: EcsSpatialChannel2DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('EcsSpatialChannel2D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('EcsSpatialChannel2D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.nid = localState.nextNetworkId()
        this.label = options.label
        this.clientIdentity = options.clientIdentity
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.plane = options.plane || 'xy'
        this.axes = getSpatialPlaneAxes(this.plane)
        this.spatialXProp = options.spatialProps?.x || this.axes.a
        this.spatialYProp = options.spatialProps?.y || this.axes.b
        this.grid = new SpatialGrid2D({
            cellSize,
            getX: component => component[this.spatialXProp],
            getY: component => component[this.spatialYProp],
            initializeCell: initializeEcsSpatialCell
        })
        this.localState.channels.add(this as any)
    }

    private addRootToCell(pid: number, component: EcsSpatial2DComponent) {
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
        this.movedRoots.push({ pid, fromCell: move.fromCell, toCell: move.toCell })
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

    private viewRange(view: SpatialView) {
        const spatialView = normalizeSpatialView(view, this.plane)
        const halfWidth = spatialView.halfA + this.queryPadding
        const halfHeight = spatialView.halfB + this.queryPadding
        return {
            minX: this.grid.cellCoord(spatialView.a - halfWidth),
            maxX: this.grid.cellCoordForEnd(spatialView.a + halfWidth),
            minY: this.grid.cellCoord(spatialView.b - halfHeight),
            maxY: this.grid.cellCoordForEnd(spatialView.b + halfHeight)
        }
    }

    private defaultView(): SpatialView {
        if (this.plane === 'xz') {
            return { x: 0, z: 0, halfX: Number.MAX_SAFE_INTEGER, halfZ: Number.MAX_SAFE_INTEGER }
        }
        return { x: 0, y: 0, halfX: Number.MAX_SAFE_INTEGER, halfY: Number.MAX_SAFE_INTEGER }
    }

    isCellVisible(userId: number, key: string) {
        const view = this.views.get(userId)
        if (!view) {
            return false
        }
        const separator = key.indexOf(':')
        const x = Number(key.slice(0, separator))
        const y = Number(key.slice(separator + 1))
        const spatialView = normalizeSpatialView(view, this.plane)
        if (spatialView.radius !== undefined) {
            const cellMinX = x * this.cellSize
            const cellMaxX = cellMinX + this.cellSize
            const cellMinY = y * this.cellSize
            const cellMaxY = cellMinY + this.cellSize
            const nearestX = spatialView.a < cellMinX ? cellMinX : spatialView.a > cellMaxX ? cellMaxX : spatialView.a
            const nearestY = spatialView.b < cellMinY ? cellMinY : spatialView.b > cellMaxY ? cellMaxY : spatialView.b
            const dx = spatialView.a - nearestX
            const dy = spatialView.b - nearestY
            const radius = spatialView.radius + this.queryPadding
            return dx * dx + dy * dy <= radius * radius
        }
        const range = this.viewRange(view)
        return x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY
    }

    private getComponentCell(component: EcsSpatial2DComponent) {
        const pid = component.pid
        const spatial = this.spatialComponentByRoot.get(pid)
        if (spatial) {
            this.updateRootCell(pid)
        }
        const ref = this.grid.objectCells.get(pid)
        return ref ? this.grid.cells.get(ref.key) as Cell || null : null
    }

    private markCellDirtyForComponent(component: EcsSpatial2DComponent) {
        const cell = this.getComponentCell(component)
        if (!cell) {
            return null
        }
        this.dirtyCells.add(cell.key)
        return cell
    }

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        if (!view) {
            return keys
        }

        const spatialView = normalizeSpatialView(view, this.plane)
        return spatialView.radius !== undefined ?
            this.grid.getVisibleCellKeysInCircle(spatialView.a, spatialView.b, spatialView.radius + this.queryPadding) :
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

    tick(tick: number) {
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

    removeEntity(pidOrEntity: number | IEntity) {
        const pid = typeof pidOrEntity === 'number' ? pidOrEntity : pidOrEntity.nid
        if (!this.rootSet.has(pid)) {
            return
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
    }

    removeAllEntities() {
        const roots = this.rootNids.slice()
        for (let i = 0; i < roots.length; i++) {
            this.removeEntity(roots[i])
        }
    }

    addComponent<T extends IEntity>(pid: number, component: T, options: { spatial?: boolean } = {}): T & EcsSpatial2DComponent {
        if (!this.rootSet.has(pid)) {
            throw new Error(`Cannot add an ECS spatial component to unknown entity nid ${pid}.`)
        }
        const ecsComponent = component as T & EcsSpatial2DComponent
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

    private removeComponentInternal(componentOrNid: EcsSpatial2DComponent | number, queueDelete: boolean) {
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

    removeComponent(componentOrNid: EcsSpatial2DComponent | number) {
        this.removeComponentInternal(componentOrNid, true)
    }

    setSpatialComponent(pid: number, componentOrNid: EcsSpatial2DComponent | number) {
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

    updateSpatialComponent(componentOrNid: EcsSpatial2DComponent | number) {
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

    getRootComponents(pid: number) {
        return this.componentsByRoot.get(pid) || []
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
        if (cell.manualPropNids.length === 0 && cell.manualGroupNids.length === 0) {
            return null
        }
        return cell
    }

    cellHasManualUpdates(key: string) {
        return this.getManualCellUpdateLog(key) !== null
    }

    getMovedRoots() {
        return this.movedRoots
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    hasOnlyMovementDeltas() {
        return this.movedRoots.length > 0 &&
            this.createdRoots.length === 0 &&
            this.deletedRoots.length === 0 &&
            this.createdComponents.length === 0 &&
            this.deletedComponents.length === 0 &&
            this.rootDeletedComponents.length === 0
    }

    hasManualUpdates() {
        return this.manualPropNids.length > 0 || this.manualGroupNids.length > 0 || this.dirtyCells.size > 0
    }

    subscribe(user: User, view?: SpatialView) {
        this.views.set(user.id, view || this.defaultView())
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: SpatialView) {
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
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && this.visibilityResolver(message, view)) {
                user.queueMessage(message)
            }
        })
    }

    clearBroadcastMessages() {
    }

    clearSnapshotDeltas() {
        const clearLog = (log: EcsSpatial2DUpdateLog) => {
            log.manualPropNids.length = 0
            log.manualPropSchemas.length = 0
            log.manualPropValues.length = 0
            log.manualGroupNids.length = 0
            log.manualGroupNTypes.length = 0
            log.manualGroupSchemas.length = 0
            log.manualGroupValueOffsets.length = 0
            log.manualGroupValues.length = 0
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
        this.dirtyCells.clear()
        this.movedRoots.length = 0
        this.structuralDeltas = false
    }

    createComponentWriter(ntype: number, schema: Schema): EcsSpatial2DTypeWriters {
        const props: EcsSpatial2DTypeWriters['props'] = Object.create(null)
        const groups: EcsSpatial2DTypeWriters['groups'] = Object.create(null)
        const writers: EcsSpatial2DTypeWriters = { ntype, schema, props, groups }

        const addAlias = (name: string, writer: any) => {
            if (name === 'ntype' || name === 'schema' || name === 'props' || name === 'groups') {
                return
            }
            writers[name] = writer
        }

        const propNames = Object.keys(schema.props)
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i]
            const prop = schema.props[name]
            props[name] = (component: EcsSpatial2DComponent, value: any) => {
                const cell = this.markCellDirtyForComponent(component)
                if (!cell) {
                    return
                }
                cell.manualPropNids.push(component.nid)
                cell.manualPropSchemas.push(prop)
                cell.manualPropValues.push(value)
                this.manualPropNids.push(component.nid)
                this.manualPropSchemas.push(prop)
                this.manualPropValues.push(value)
            }
            addAlias(name, props[name])
        }

        const writeGroup = (component: EcsSpatial2DComponent, group: SchemaUpdateGroup, values: IArguments | any[]) => {
            const cell = this.markCellDirtyForComponent(component)
            if (!cell) {
                return
            }
            cell.manualGroupNids.push(component.nid)
            cell.manualGroupNTypes.push(ntype)
            cell.manualGroupSchemas.push(group)
            cell.manualGroupValueOffsets.push(cell.manualGroupValues.length)
            this.manualGroupNids.push(component.nid)
            this.manualGroupNTypes.push(ntype)
            this.manualGroupSchemas.push(group)
            this.manualGroupValueOffsets.push(this.manualGroupValues.length)
            for (let i = 0; i < group.props.length; i++) {
                cell.manualGroupValues.push(values[i + 1])
                this.manualGroupValues.push(values[i + 1])
            }
        }

        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i]
            groups[group.name] = function writeEcsSpatialGroup(component: EcsSpatial2DComponent) {
                writeGroup(component, group, arguments)
            }
            addAlias(group.name, groups[group.name])
        }

        return writers
    }

    type(ntype: number, schema: Schema): EcsSpatial2DTypeWriters {
        return this.createComponentWriter(ntype, schema)
    }
}
