import { IEntity } from '../common/IEntity'
import { AABB2D } from './AABB2D'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { Point2D } from './Point2D'
import { User } from './User'

type CellEntity = IEntity & Point2D
type CellRef = { key: string, index: number }
type Cell = { key: string, x: number, y: number, entities: CellEntity[], entityNids: number[], version: number }

function pointInAABB2D(p: Point2D, view: AABB2D) {
    const startX = view.x - view.halfWidth
    const startY = view.y - view.halfHeight
    const endX = view.x + view.halfWidth
    const endY = view.y + view.halfHeight

    return (
        p.x >= startX &&
        p.x < endX &&
        p.y >= startY &&
        p.y < endY
    )
}

export type ChannelAABB2DCellOptions = ChannelOptions & {
    queryPadding?: number
    fragmentCellLimit?: number
}

export class ChannelAABB2DCell implements ICulledChannel<Point2D, AABB2D> {
    readonly cellVisibilityMode = true
    private channel: Channel
    private views: Map<number, AABB2D> = new Map()
    private viewVersions: Map<number, number> = new Map()
    private cells: Map<string, Cell> = new Map()
    private entityCells: Map<number, CellRef> = new Map()
    private visibleCellCache: Map<number, { viewVersion: number, keys: string[], nids: number[] }> = new Map()
    cellSize: number
    queryPadding: number
    membershipVersion = 0
    fragmentCellLimit: number
    dirtyCells: Set<string> = new Set()
    users: Map<number, User> = new Map()
    visibilityResolver = pointInAABB2D

    constructor(localState: LocalState, cellSize: number, options: ChannelAABB2DCellOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('ChannelAABB2DCell requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('ChannelAABB2DCell queryPadding must be a non-negative finite number.')
        }
        this.channel = new Channel(localState, options)
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
        this.fragmentCellLimit = Math.max(1, Math.floor(options.fragmentCellLimit || 16))
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

    get broadcastMessages() {
        return this.channel.broadcastMessages
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

    private cellKeyForPoint(point: Point2D) {
        return this.cellKey(this.cellCoord(point.x), this.cellCoord(point.y))
    }

    private getOrCreateCellForPoint(point: Point2D) {
        const x = this.cellCoord(point.x)
        const y = this.cellCoord(point.y)
        const key = this.cellKey(x, y)
        let cell = this.cells.get(key)
        if (!cell) {
            cell = { key, x, y, entities: [], entityNids: [], version: 0 }
            this.cells.set(key, cell)
        }
        return cell
    }

    private addToCell(entity: CellEntity) {
        const cell = this.getOrCreateCellForPoint(entity)
        this.entityCells.set(entity.nid, { key: cell.key, index: cell.entities.length })
        cell.entities.push(entity)
        cell.entityNids.push(entity.nid)
        cell.version++
        this.dirtyCells.add(cell.key)
    }

    private removeFromCell(entity: CellEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (!ref) {
            return
        }

        const cell = this.cells.get(ref.key)
        if (!cell) {
            this.entityCells.delete(entity.nid)
            return
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
        if (cell.entities.length === 0) {
            this.cells.delete(ref.key)
        } else {
            cell.version++
        }
        this.entityCells.delete(entity.nid)
        this.dirtyCells.add(ref.key)
    }

    private invalidateVisibleCache() {
        this.visibleCellCache.clear()
    }

    private viewRange(view: AABB2D) {
        const halfWidth = view.halfWidth + this.queryPadding
        const halfHeight = view.halfHeight + this.queryPadding
        const startX = view.x - halfWidth
        const startY = view.y - halfHeight
        const endX = view.x + halfWidth
        const endY = view.y + halfHeight

        return {
            minX: this.cellCoord(startX),
            maxX: this.cellCoordForEnd(endX),
            minY: this.cellCoord(startY),
            maxY: this.cellCoordForEnd(endY)
        }
    }

    private buildVisibleCells(userId: number) {
        const view = this.views.get(userId)
        const keys: string[] = []
        const nids: number[] = []
        if (!view) {
            return { keys, nids }
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
                for (let i = 0; i < cell.entityNids.length; i++) {
                    nids.push(cell.entityNids[i])
                }
            }
        }

        return { keys, nids }
    }

    tick(tick: number) {
        this.channel.tick(tick)
    }

    addEntity(entity: CellEntity) {
        this.channel.addEntity(entity)
        this.addToCell(entity)
        this.membershipVersion++
        this.invalidateVisibleCache()
        return entity
    }

    updateEntity(entity: CellEntity) {
        const current = this.entityCells.get(entity.nid)
        if (!current) {
            return
        }

        const nextKey = this.cellKeyForPoint(entity)
        this.dirtyCells.add(current.key)
        if (current.key === nextKey) {
            return
        }

        this.removeFromCell(entity)
        this.addToCell(entity)
        this.membershipVersion++
        this.invalidateVisibleCache()
    }

    removeEntity(entity: CellEntity) {
        this.removeFromCell(entity)
        this.channel.removeEntity(entity)
        this.membershipVersion++
        this.invalidateVisibleCache()
    }

    removeAllEntities() {
        this.channel.removeAllEntities()
        this.cells.clear()
        this.entityCells.clear()
        this.dirtyCells.clear()
        this.membershipVersion++
        this.invalidateVisibleCache()
    }

    addMessage(message: any) {
        this.channel.addMessage(message)
    }

    clearBroadcastMessages() {
        this.channel.clearBroadcastMessages()
    }

    clearSnapshotDeltas() {
        this.channel.clearSnapshotDeltas()
        this.dirtyCells.clear()
    }

    subscribe(user: User, view: AABB2D) {
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, 1)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: AABB2D) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
        this.viewVersions.set(user.id, (this.viewVersions.get(user.id) || 0) + 1)
        this.visibleCellCache.delete(user.id)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.viewVersions.delete(user.id)
        this.visibleCellCache.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleCellKeys(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellCache.get(userId)
        if (cached && cached.viewVersion === viewVersion) {
            return cached.keys
        }

        const visible = this.buildVisibleCells(userId)
        this.visibleCellCache.set(userId, { viewVersion, keys: visible.keys, nids: visible.nids })
        return visible.keys
    }

    getVisibleEntities(userId: number) {
        const viewVersion = this.viewVersions.get(userId) || 0
        const cached = this.visibleCellCache.get(userId)
        if (cached && cached.viewVersion === viewVersion) {
            return cached.nids
        }

        const visible = this.buildVisibleCells(userId)
        this.visibleCellCache.set(userId, { viewVersion, keys: visible.keys, nids: visible.nids })
        return visible.nids
    }

    getCellEntities(key: string) {
        return this.cells.get(key)?.entities || []
    }

    getUserViewVersion(userId: number) {
        return this.viewVersions.get(userId) || 0
    }

    getVisibleCellVersionSignature(userId: number) {
        const keys = this.getVisibleCellKeys(userId)
        let signature = ''
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            signature += `${key}:${this.cells.get(key)?.version || 0}|`
        }
        return signature
    }

    destroy() {
        this.unsubscribeAll()
        this.channel.destroy()
        this.views.clear()
        this.viewVersions.clear()
        this.visibleCellCache.clear()
        this.cells.clear()
        this.entityCells.clear()
        this.dirtyCells.clear()
        this.visibilityResolver = () => true
    }
}
