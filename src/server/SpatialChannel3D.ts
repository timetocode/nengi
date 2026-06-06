import { IEntity } from '../common/IEntity'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { Point3D } from './Point3D'
import { SpatialGrid3D } from './SpatialGrid'
import { normalizeSpatialView3D, objectInSpatialView3D, SpatialView3D } from './SpatialPlane'
import { User } from './User'

type SpatialEntity3D = IEntity & Point3D
export type SpatialMove3D = { entity: SpatialEntity3D, fromCell: string, toCell: string }

export type SpatialChannel3DOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
}

export class SpatialChannel3D implements ICulledChannel<SpatialEntity3D, SpatialView3D> {
    readonly cellFragmentMode = true
    private channel: Channel
    protected localState: LocalState
    private views: Map<number, SpatialView3D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private grid: SpatialGrid3D<SpatialEntity3D>
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private movedRoots: SpatialMove3D[] = []
    private structuralDeltas = false
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    users: Map<number, User> = new Map()
    visibilityResolver = objectInSpatialView3D

    constructor(localState: LocalState, cellSize: number, options: SpatialChannel3DOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialChannel3D requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('SpatialChannel3D queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.channel = new Channel(localState, options)
        localState.channels.delete(this.channel)
        localState.channels.add(this as any)
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.grid = new SpatialGrid3D({
            cellSize,
            getX: entity => entity.x,
            getY: entity => entity.y,
            getZ: entity => entity.z
        })
    }

    get nid() {
        return this.channel.nid
    }

    get label() {
        return this.channel.label
    }

    get clientIdentity() {
        return this.channel.clientIdentity
    }

    get entities() {
        return this.channel.entities
    }

    private invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear()
        this.visibleNetworkedNidsCache.clear()
    }

    private invalidateVisibleCellKeyCache() {
        this.visibleCellKeyCache.clear()
        this.invalidateVisibleEntityCache()
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

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        if (!view) {
            return []
        }

        const spatialView = normalizeSpatialView3D(view)
        if (spatialView.radius !== undefined) {
            return this.grid.getVisibleCellKeysInSphere(spatialView.x, spatialView.y, spatialView.z, spatialView.radius + this.queryPadding)
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

    tick(tick: number) {
        this.channel.tick(tick)
    }

    addEntity(entity: SpatialEntity3D) {
        this.channel.addEntity(entity)
        this.grid.add(entity.nid, entity)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    updateEntity(entity: SpatialEntity3D) {
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

    removeEntity(entity: SpatialEntity3D) {
        const removed = this.grid.remove(entity.nid)
        this.channel.removeEntity(entity)
        this.membershipVersion++
        this.structuralDeltas = true
        if (removed?.removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    removeAllEntities() {
        Array.from(this.channel.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity3D))
    }

    markDirty(entity: SpatialEntity3D) {
        return this.localState.markDirty(entity)
    }

    getDirtyCellKeys() {
        const keys = new Set<string>()
        for (const nid of this.localState.dirtyNids) {
            const ref = this.grid.objectCells.get(nid)
            if (ref) {
                keys.add(ref.key)
            }
        }
        return Array.from(keys)
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
        this.movedRoots.length = 0
        this.structuralDeltas = false
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
        this.visibleEntityCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellKeyCache.delete(user.id)
        this.visibleEntityCache.delete(user.id)
        this.visibleNetworkedNidsCache.delete(user.id)
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
        const cached = this.visibleNetworkedNidsCache.get(userId)
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
        this.visibleNetworkedNidsCache.set(userId, {
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

    getUserViewVersion(userId: number) {
        return this.viewVersions.get(userId) || 0
    }

    getVisibleCellVersionSignature(userId: number) {
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

    hasStableRememberedCells(userId: number) {
        return this.getStableVisibleCellKeys(userId) !== null
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

    destroy() {
        this.unsubscribeAll()
        this.localState.channels.delete(this as any)
        this.channel.destroy()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellKeyCache.clear()
        this.visibleEntityCache.clear()
        this.rememberedCells.clear()
        this.rememberedCellSignatures.clear()
        this.grid.cells.clear()
        this.grid.objectCells.clear()
        this.visibilityResolver = () => true
    }
}
