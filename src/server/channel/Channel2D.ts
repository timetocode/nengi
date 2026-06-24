import { IEntity } from '../../common/IEntity'
import { ChannelType } from '../../common/ChannelHeader'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { SpatialGrid2D } from './SpatialGrid'
import { getSpatialPlaneAxes, normalizeSpatialView, objectInSpatialView, SpatialPlane, SpatialPlaneAxes, SpatialView } from './SpatialView'
import { ChannelSnapshotOutput } from './ChannelSnapshotOutput'
import { createCellFragmentChannelOutput } from './CellFragmentChannelOutput'

type SpatialEntity = IEntity & Record<string, any>
export type SpatialMove = { entity: SpatialEntity, fromCell: string, toCell: string }
export type Channel2DSnapshotVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    previous: Set<number>
}

export type Channel2DOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    plane?: SpatialPlane
}

// Channel2D intentionally mirrors Channel3D instead of using a
// dimension-generic wrapper; this is snapshot hot-path code, so benchmark
// before collapsing the parallel implementations.
export class Channel2D extends Channel implements ICulledChannel<SpatialEntity, SpatialView> {
    readonly cellFragmentMode = true
    private views: Map<number, SpatialView> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid2D<SpatialEntity>
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private spatialVisibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private movedRoots: SpatialMove[] = []
    private structuralDeltas = false
    cellSize: number
    queryPadding: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    plane: SpatialPlane
    private axes: SpatialPlaneAxes
    visibilityResolver = (obj: any, view: SpatialView) => objectInSpatialView(obj, view, this.plane)

    constructor(localState: LocalState, cellSize: number, options: Channel2DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('Channel2D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('Channel2D queryPadding must be a non-negative finite number.')
        }
        super(localState, { ...options, channelType: ChannelType.Channel2D })
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.plane = options.plane || 'xy'
        this.axes = getSpatialPlaneAxes(this.plane)
        this.grid = new SpatialGrid2D({
            cellSize,
            getX: entity => entity[this.axes.a],
            getY: entity => entity[this.axes.b]
        })
    }

    private invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear()
        this.spatialVisibleNetworkedNidsCache.clear()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleEntityCache()
    }

    private viewRange(view: SpatialView) {
        const spatialView = normalizeSpatialView(view, this.plane)
        const halfWidth = spatialView.halfA + this.queryPadding
        const halfHeight = spatialView.halfB + this.queryPadding
        const startX = spatialView.a - halfWidth
        const startY = spatialView.b - halfHeight
        const endX = spatialView.a + halfWidth
        const endY = spatialView.b + halfHeight

        return {
            minX: this.grid.cellCoord(startX),
            maxX: this.grid.cellCoordForEnd(endX),
            minY: this.grid.cellCoord(startY),
            maxY: this.grid.cellCoordForEnd(endY)
        }
    }

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        if (!view) {
            return []
        }

        const spatialView = normalizeSpatialView(view, this.plane)
        if (spatialView.radius !== undefined) {
            return this.grid.getVisibleCellKeysInCircle(spatialView.a, spatialView.b, spatialView.radius + this.queryPadding)
        }
        return this.grid.getVisibleCellKeys(this.viewRange(view))
    }

    private buildVisibleEntities(userId: number) {
        const keys = this.getVisibleCellKeys(userId)
        const nids: number[] = []
        for (let i = 0; i < keys.length; i++) {
            const cell = this.grid.cells.get(keys[i])
            if (!cell) {
                continue
            }
            for (let j = 0; j < cell.ids.length; j++) {
                nids.push(cell.ids[j])
            }
        }
        return nids
    }

    private getCellDeleteNids(key: string) {
        const nids: number[] = []
        const cell = this.grid.cells.get(key)
        if (!cell) {
            return nids
        }

        for (let i = 0; i < cell.ids.length; i++) {
            this.localState.collectEntityTreeDeletes(cell.ids[i], nids)
        }
        return nids
    }

    addEntity(entity: SpatialEntity) {
        super.addEntity(entity)
        this.grid.add(entity.nid, entity)
        this.structuralDeltas = true
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    moveEntity(entity: SpatialEntity) {
        const move = this.grid.update(entity.nid, entity)
        if (!move) {
            return
        }
        this.movedRoots.push({ entity, fromCell: move.fromCell, toCell: move.toCell })
        this.membershipVersion++
        if (move.removedCell || move.createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    removeEntity(entity: SpatialEntity) {
        const removedNid = super.removeEntity(entity)
        if (removedNid === 0) {
            return 0
        }
        const removed = this.grid.remove(removedNid)
        this.structuralDeltas = true
        if (removed?.removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
        return removedNid
    }

    removeAllEntities() {
        Array.from(this.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity))
    }

    skipInterpolation(entity: SpatialEntity) {
        return super.skipInterpolation(entity)
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

    clearBroadcastMessages() {
    }

    clearSnapshotDeltas() {
        super.clearSnapshotDeltas()
        this.movedRoots.length = 0
        this.structuralDeltas = false
    }

    subscribe(user: User, view?: SpatialView) {
        if (!view) {
            throw new Error('Channel2D requires a view when subscribing.')
        }
        this.views.set(user.id, view)
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
        this.visibleEntityCache.delete(user.id)
        this.spatialVisibleNetworkedNidsCache.delete(user.id)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleEntityCache.delete(user.id)
        this.spatialVisibleNetworkedNidsCache.delete(user.id)
        this.rememberedCells.delete(user.id)
        this.rememberedCellSignatures.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleCellKeys(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellKeyCache.get(userId)
        if (cached && cached.viewVersion === viewVersion) {
            return cached.keys
        }

        const keys = this.buildVisibleCellKeys(userId)
        this.visibleCellKeyCache.set(userId, {
            viewVersion,
            keys
        })
        return keys
    }

    getVisibleEntities(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleEntityCache.get(userId)
        if (cached && cached.viewVersion === viewVersion && cached.membershipVersion === this.membershipVersion) {
            return cached.nids
        }

        const nids = this.buildVisibleEntities(userId)
        this.visibleEntityCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            nids
        })
        return nids
    }

    getVisibleNetworkedNids(userId: number) {
        const entityTreeVersion = this.localState.entityTreeVersion
        const roots = this.getVisibleEntities(userId)
        if (entityTreeVersion === 0) {
            return roots
        }

        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.spatialVisibleNetworkedNidsCache.get(userId)
        if (
            cached &&
            cached.viewVersion === viewVersion &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion
        ) {
            return cached.nids
        }

        const nids: number[] = []
        for (let i = 0; i < roots.length; i++) {
            this.localState.collectEntityTree(roots[i], nids)
        }
        this.spatialVisibleNetworkedNidsCache.set(userId, {
            viewVersion,
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids
        })
        return nids
    }

    getCellEntities(key: string) {
        return this.grid.cells.get(key)?.objects || []
    }

    getCellEntityNids(key: string) {
        return this.grid.cells.get(key)?.ids || []
    }

    getCellVersion(key: string) {
        return this.grid.cells.get(key)?.version || 0
    }

    getMovedRoots() {
        return this.movedRoots
    }

    hasStructuralDeltas() {
        return this.structuralDeltas
    }

    private getVisibleCellVersionSignature(userId: number) {
        const keys = this.getVisibleCellKeys(userId)
        let signature = ''
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            signature += `${key}:${this.getCellVersion(key)}|`
        }
        return signature
    }

    getRememberedCellKeys(userId: number) {
        return Array.from(this.rememberedCells.get(userId)?.keys() || [])
    }

    getRememberedCellNids(userId: number, key: string) {
        return this.rememberedCells.get(userId)?.get(key) || []
    }

    collectSnapshotVisibility(userId: number): Channel2DSnapshotVisibility {
        const previous = new Set<number>()
        const previousCellKeys = this.getRememberedCellKeys(userId)
        for (let i = 0; i < previousCellKeys.length; i++) {
            const nids = this.getRememberedCellNids(userId, previousCellKeys[i])
            for (let j = 0; j < nids.length; j++) {
                previous.add(nids[j])
            }
        }

        const currentNids = this.getVisibleNetworkedNids(userId)
        const current = new Set(currentNids)
        const toCreate: number[] = []
        const toUpdate: number[] = []
        const toDelete: number[] = []
        for (let i = 0; i < currentNids.length; i++) {
            const nid = currentNids[i]
            if (previous.has(nid)) {
                toUpdate.push(nid)
            } else {
                toCreate.push(nid)
            }
        }
        previous.forEach(nid => {
            if (!current.has(nid)) {
                toDelete.push(nid)
            }
        })
        return { toCreate, toUpdate, toDelete, previous }
    }

    getStableVisibleCellKeys(userId: number) {
        const remembered = this.rememberedCells.get(userId)
        if (!remembered) {
            return null
        }

        const keys = this.getVisibleCellKeys(userId)
        if (this.rememberedCellSignatures.get(userId) !== this.getVisibleCellVersionSignature(userId)) {
            return null
        }
        if (remembered.size !== keys.length) {
            return null
        }
        for (let i = 0; i < keys.length; i++) {
            if (!remembered.has(keys[i])) {
                return null
            }
        }
        return keys
    }

    rememberVisibleCells(userId: number) {
        const remembered = new Map<string, number[]>()
        const keys = this.getVisibleCellKeys(userId)
        for (let i = 0; i < keys.length; i++) {
            remembered.set(keys[i], this.getCellDeleteNids(keys[i]))
        }
        this.rememberedCells.set(userId, remembered)
        this.rememberedCellSignatures.set(userId, this.getVisibleCellVersionSignature(userId))
    }

    rememberSnapshotVisibility(userId: number) {
        this.rememberVisibleCells(userId)
    }

    createSnapshotOutput(user: User, instance: Instance, protocol: ProtocolConfig): ChannelSnapshotOutput {
        return createCellFragmentChannelOutput(user, instance, this, protocol)
    }

    destroy() {
        super.destroy()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleEntityCache.clear()
        this.spatialVisibleNetworkedNidsCache.clear()
        this.rememberedCells.clear()
        this.rememberedCellSignatures.clear()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.visibilityResolver = () => true
    }
}
