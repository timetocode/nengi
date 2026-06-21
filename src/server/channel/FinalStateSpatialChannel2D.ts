import { IEntity } from '../../common/IEntity'
import { ChannelType } from '../../common/ChannelHeader'
import { LocalState } from '../LocalState'
import { User } from '../User'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { SpatialGrid2D } from './SpatialGrid'
import { getSpatialPlaneAxes, normalizeSpatialView, objectInSpatialView, SpatialPlane, SpatialPlaneAxes, SpatialView } from './SpatialView'

type SpatialEntity = IEntity & Record<string, any>
type VisibleNetworkedNidCache = {
    viewVersion: number
    membershipVersion: number
    entityTreeVersion: number
    nids: number[]
    signature: string
}
type VisibleCellKeyCache = {
    viewVersion: number
    keys: string[]
    signature: string
}

export type FinalStateSpatialChannel2DOptions = ChannelOptions & {
    queryPadding?: number
    plane?: SpatialPlane
}

export class FinalStateSpatialChannel2D extends Channel implements ICulledChannel<SpatialEntity, SpatialView> {
    readonly finalStateSpatialChannelMode = true
    private views: Map<number, SpatialView> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid2D<SpatialEntity>
    private visibleCellKeyCache: Map<number, VisibleCellKeyCache> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private spatialVisibleNetworkedNidsCache: Map<number, VisibleNetworkedNidCache> = new Map()
    cellSize: number
    queryPadding: number
    plane: SpatialPlane
    private axes: SpatialPlaneAxes
    visibilityResolver = (obj: any, view: SpatialView) => objectInSpatialView(obj, view, this.plane)

    constructor(localState: LocalState, cellSize: number, options: FinalStateSpatialChannel2DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('FinalStateSpatialChannel2D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('FinalStateSpatialChannel2D queryPadding must be a non-negative finite number.')
        }
        super(localState, { ...options, channelType: options.channelType ?? ChannelType.FinalStateSpatialChannel2D })
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
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
        return {
            minX: this.grid.cellCoord(spatialView.a - halfWidth),
            maxX: this.grid.cellCoordForEnd(spatialView.a + halfWidth),
            minY: this.grid.cellCoord(spatialView.b - halfHeight),
            maxY: this.grid.cellCoordForEnd(spatialView.b + halfHeight)
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

    addEntity(entity: SpatialEntity) {
        super.addEntity(entity)
        this.grid.add(entity.nid, entity)
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    updateEntity(entity: SpatialEntity) {
        const move = this.grid.update(entity.nid, entity)
        if (!move) {
            return
        }
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

    markDirty(entity: SpatialEntity) {
        return this.localState.markDirty(entity)
    }

    addMessage(message: any) {
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

    subscribe(user: User, view?: SpatialView) {
        if (!view) {
            throw new Error('FinalStateSpatialChannel2D requires a view when subscribing.')
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
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleCellKeys(userId: number) {
        return this.getVisibleCellKeyState(userId).keys
    }

    getVisibleCellKeySignature(userId: number) {
        return this.getVisibleCellKeyState(userId).signature
    }

    private getVisibleCellKeyState(userId: number): VisibleCellKeyCache {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellKeyCache.get(userId)
        if (cached && cached.viewVersion === viewVersion) {
            return cached
        }

        const keys = this.buildVisibleCellKeys(userId)
        const state = { viewVersion, keys, signature: keys.join('|') }
        this.visibleCellKeyCache.set(userId, state)
        return state
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
        return this.getVisibleNetworkedNidState(userId).nids
    }

    getVisibleNetworkedNidSignature(userId: number) {
        return this.getVisibleNetworkedNidState(userId).signature
    }

    private getVisibleNetworkedNidState(userId: number): VisibleNetworkedNidCache {
        const entityTreeVersion = this.localState.entityTreeVersion
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.spatialVisibleNetworkedNidsCache.get(userId)
        if (
            cached &&
            cached.viewVersion === viewVersion &&
            cached.membershipVersion === this.membershipVersion &&
            cached.entityTreeVersion === entityTreeVersion
        ) {
            return cached
        }

        const roots = this.getVisibleEntities(userId)
        const nids: number[] = []
        if (entityTreeVersion === 0) {
            for (let i = 0; i < roots.length; i++) {
                nids.push(roots[i])
            }
        } else {
            for (let i = 0; i < roots.length; i++) {
                this.localState.collectEntityTree(roots[i], nids)
            }
        }
        const state = {
            viewVersion,
            membershipVersion: this.membershipVersion,
            entityTreeVersion,
            nids,
            signature: nids.join(',')
        }
        this.spatialVisibleNetworkedNidsCache.set(userId, state)
        return state
    }

    destroy() {
        super.destroy()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleEntityCache.clear()
        this.spatialVisibleNetworkedNidsCache.clear()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.visibilityResolver = () => true
    }
}
