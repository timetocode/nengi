import { IEntity } from '../common/IEntity'
import { AABB3D } from './AABB3D'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { Point3D } from './Point3D'
import { User } from './User'

type SpatialEntity3D = IEntity & Point3D
type CellRef = { key: string, index: number }
type Cell = { key: string, x: number, y: number, z: number, entities: SpatialEntity3D[], entityNids: number[], version: number }
export type SpatialMove3D = { entity: SpatialEntity3D, fromCell: string, toCell: string }

function pointInAABB3D(p: Point3D, view: AABB3D) {
    const startX = view.x - view.halfWidth
    const startY = view.y - view.halfHeight
    const startZ = view.z - view.halfDepth
    const endX = view.x + view.halfWidth
    const endY = view.y + view.halfHeight
    const endZ = view.z + view.halfDepth

    return (
        p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY &&
        p.z >= startZ &&
        p.z < endZ
    )
}

export type SpatialChannel3DOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
    stableFragmentCellLimit?: number
}

export class SpatialChannel3D implements ICulledChannel<SpatialEntity3D, AABB3D> {
    readonly cellFragmentMode = true
    private channel: Channel
    protected localState: LocalState
    private views: Map<number, AABB3D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private cells: Map<string, Cell> = new Map()
    private entityCells: Map<number, CellRef> = new Map()
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
    visibilityResolver = pointInAABB3D

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

    private cellKey(x: number, y: number, z: number) {
        return `${x}:${y}:${z}`
    }

    private cellKeyForEntity(entity: SpatialEntity3D) {
        return this.cellKey(this.cellCoord(entity.x), this.cellCoord(entity.y), this.cellCoord(entity.z))
    }

    private getOrCreateCellForEntity(entity: SpatialEntity3D) {
        const x = this.cellCoord(entity.x)
        const y = this.cellCoord(entity.y)
        const z = this.cellCoord(entity.z)
        const key = this.cellKey(x, y, z)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, z, entities: [], entityNids: [], version: 0 }
            this.cells.set(key, cell)
        }
        return cell
    }

    private addToCell(entity: SpatialEntity3D) {
        const cell = this.getOrCreateCellForEntity(entity)
        const wasEmpty = cell.entities.length === 0
        this.entityCells.set(entity.nid, { key: cell.key, index: cell.entities.length })
        cell.entities.push(entity)
        cell.entityNids.push(entity.nid)
        cell.version++
        return wasEmpty
    }

    private removeFromCell(entity: SpatialEntity3D) {
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

    private viewRange(view: AABB3D) {
        const halfWidth = view.halfWidth + this.queryPadding
        const halfHeight = view.halfHeight + this.queryPadding
        const halfDepth = view.halfDepth + this.queryPadding

        return {
            minX: this.cellCoord(view.x - halfWidth),
            maxX: this.cellCoordForEnd(view.x + halfWidth),
            minY: this.cellCoord(view.y - halfHeight),
            maxY: this.cellCoordForEnd(view.y + halfHeight),
            minZ: this.cellCoord(view.z - halfDepth),
            maxZ: this.cellCoordForEnd(view.z + halfDepth)
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
                for (let cellZ = range.minZ; cellZ <= range.maxZ; cellZ++) {
                    const key = this.cellKey(cellX, cellY, cellZ)
                    const cell = this.cells.get(key)
                    if (!cell) {
                        continue
                    }
                    keys.push(key)
                }
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

    addEntity(entity: SpatialEntity3D) {
        this.channel.addEntity(entity)
        this.addToCell(entity)
        this.membershipVersion++
        this.structuralDeltas = true
        this.invalidateVisibleCellKeyCache()
        return entity
    }

    updateEntity(entity: SpatialEntity3D) {
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

    removeEntity(entity: SpatialEntity3D) {
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
        Array.from(this.channel.entities.array).forEach(entity => this.removeEntity(entity as SpatialEntity3D))
    }

    markDirty(entity: SpatialEntity3D) {
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

    subscribe(user: User, view: AABB3D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: AABB3D) {
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
