import { IEntity } from '../common/IEntity'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { getSpatialPlaneAxes, normalizeSpatialView, objectInSpatialView, SpatialPlane, SpatialPlaneAxes, SpatialView } from './SpatialPlane'
import { User } from './User'

type SpatialEntity = IEntity & Record<string, any>
type CellRef = { key: string, index: number }
type Cell = { key: string, x: number, y: number, entities: SpatialEntity[], entityNids: number[], version: number }
export type SpatialMove = { entity: SpatialEntity, fromCell: string, toCell: string }

export type SpatialChannelOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
    plane?: SpatialPlane
}

export class SpatialChannel implements ICulledChannel<SpatialEntity, SpatialView> {
    readonly cellFragmentMode = true
    private channel: Channel
    protected localState: LocalState
    private views: Map<number, SpatialView> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private cells: Map<string, Cell> = new Map()
    private entityCells: Map<number, CellRef> = new Map()
    private visibleCellKeyCache: Map<number, { viewVersion: number, keys: string[] }> = new Map()
    private visibleEntityCache: Map<number, { viewVersion: number, membershipVersion: number, nids: number[] }> = new Map()
    private visibleNetworkedNidsCache: Map<number, { viewVersion: number, membershipVersion: number, entityTreeVersion: number, nids: number[] }> = new Map()
    private rememberedCells: Map<number, Map<string, number[]>> = new Map()
    private rememberedCellSignatures: Map<number, string> = new Map()
    private movedRoots: SpatialMove[] = []
    private structuralDeltas = false
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    users: Map<number, User> = new Map()
    plane: SpatialPlane
    private axes: SpatialPlaneAxes
    visibilityResolver = (obj: any, view: SpatialView) => objectInSpatialView(obj, view, this.plane)

    constructor(localState: LocalState, cellSize: number, options: SpatialChannelOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('SpatialChannel requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('SpatialChannel queryPadding must be a non-negative finite number.')
        }
        this.localState = localState
        this.channel = new Channel(localState, options)
        localState.channels.delete(this.channel)
        localState.channels.add(this as any)
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
        this.stableFragmentCellLimit = Math.max(this.fragmentCellLimit, Math.floor(options.stableFragmentCellLimit || 64))
        this.plane = options.plane || 'xy'
        this.axes = getSpatialPlaneAxes(this.plane)
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

    private cellCoord(value: number) {
        return Math.floor(value / this.cellSize)
    }

    private cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    private cellKey(x: number, y: number) {
        return `${x}:${y}`
    }

    private cellKeyForEntity(entity: SpatialEntity) {
        return this.cellKey(
            this.cellCoord(entity[this.axes.a]),
            this.cellCoord(entity[this.axes.b])
        )
    }

    private getOrCreateCellForEntity(entity: SpatialEntity) {
        const x = this.cellCoord(entity[this.axes.a])
        const y = this.cellCoord(entity[this.axes.b])
        const key = this.cellKey(x, y)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, entities: [], entityNids: [], version: 0 }
            this.cells.set(key, cell)
        }
        return cell
    }

    private addToCell(entity: SpatialEntity) {
        const cell = this.getOrCreateCellForEntity(entity)
        const wasEmpty = cell.entities.length === 0
        this.entityCells.set(entity.nid, { key: cell.key, index: cell.entities.length })
        cell.entities.push(entity)
        cell.entityNids.push(entity.nid)
        cell.version++
        return wasEmpty
    }

    private removeFromCell(entity: SpatialEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (!ref) {
            return false
        }

        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.entityCells.delete(entity.nid)
            return false
        }

        const lastIndex = cell.entities.length - 1
        const moved = cell.entities[lastIndex]
        cell.entities[ref.index] = moved
        cell.entityNids[ref.index] = moved.nid
        cell.entities.pop()
        cell.entityNids.pop()
        if (moved && moved.nid !== entity.nid) {
            this.entityCells.set(moved.nid, { key: ref.key, index: ref.index })
        }
        const removedCell = cell.entities.length === 0
        if (removedCell) {
            this.cells.delete(ref.key)
        } else {
            cell.version++
        }
        this.entityCells.delete(entity.nid)
        return removedCell
    }

    private invalidateVisibleEntityCache() {
        this.visibleEntityCache.clear()
        this.visibleNetworkedNidsCache.clear()
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
            minX: this.cellCoord(startX),
            maxX: this.cellCoordForEnd(endX),
            minY: this.cellCoord(startY),
            maxY: this.cellCoordForEnd(endY)
        }
    }

    private buildVisibleCellKeys(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        if (!view) {
            return keys
        }

        const range = this.viewRange(view)
        for (let cellX = range.minX; cellX <= range.maxX; cellX++) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY++) {
                const key = this.cellKey(cellX, cellY)
                const cell = this.cells.get(key)
                if (!cell) {
                    continue
                }
                keys.push(key)
            }
        }

        return keys
    }

    private buildVisibleEntities(userId: number) {
        const keys = this.getVisibleCellKeys(userId)
        const nids: number[] = []
        for (let i = 0; i < keys.length; i++) {
            const cell = this.cells.get(keys[i])
            if (!cell) {
                continue
            }
            for (let j = 0; j < cell.entityNids.length; j++) {
                nids.push(cell.entityNids[j])
            }
        }
        return nids
    }

    private getCellDeleteNids(key: string) {
        const nids: number[] = []
        const cell = this.cells.get(key)
        if (!cell) {
            return nids
        }

        for (let i = 0; i < cell.entityNids.length; i++) {
            this.localState.collectEntityTreeDeletes(cell.entityNids[i], nids)
        }
        return nids
    }

    tick(tick: number) {
        this.channel.tick(tick)
    }

    addEntity(entity: SpatialEntity) {
        this.channel.addEntity(entity)
        this.addToCell(entity)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    updateEntity(entity: SpatialEntity) {
        const current = this.entityCells.get(entity.nid)
        if (!current) {
            return
        }

        const nextKey = this.cellKeyForEntity(entity)
        if (current.key === nextKey) {
            return
        }

        const fromCell = current.key
        const removedCell = this.removeFromCell(entity)
        const createdCell = this.addToCell(entity)
        this.movedRoots.push({ entity, fromCell, toCell: nextKey })
        this.membershipVersion++
        if (removedCell || createdCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    removeEntity(entity: SpatialEntity) {
        const removedCell = this.removeFromCell(entity)
        this.channel.removeEntity(entity)
        this.membershipVersion++
        this.structuralDeltas = true
        if (removedCell) {
            this.invalidateVisibleCellKeyCache()
        } else {
            this.invalidateVisibleEntityCache()
        }
    }

    removeAllEntities() {
        Array.from(this.channel.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity))
    }

    markDirty(entity: SpatialEntity) {
        return this.localState.markDirty(entity)
    }

    getDirtyCellKeys() {
        const keys = new Set<string>()
        for (const nid of this.localState.dirtyNids) {
            const ref = this.entityCells.get(nid)
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

    subscribe(user: User, view: SpatialView) {
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
        return this.cells.get(key)?.entities || []
    }

    getCellEntityNids(key: string) {
        return this.cells.get(key)?.entityNids || []
    }

    getCellVersion(key: string) {
        return this.cells.get(key)?.version || 0
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
        this.cells.clear()
        this.entityCells.clear()
        this.visibilityResolver = () => true
    }
}
