import { IEntity } from '../common/IEntity'
import { AABB2D } from './AABB2D'
import { Channel, ChannelOptions } from './Channel'
import { ICulledChannel } from './IChannel'
import { LocalState } from './LocalState'
import { Point2D } from './Point2D'
import { User } from './User'

type GridEntity = IEntity & Point2D
type CellRef = { key: string, index: number }

export type ChannelAABB2DSparseGridOptions = ChannelOptions & {
    queryPadding?: number
}

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

export class ChannelAABB2DSparseGrid implements ICulledChannel<Point2D, AABB2D> {
    private channel: Channel
    private views: Map<number, AABB2D> = new Map()
    private cells: Map<string, GridEntity[]> = new Map()
    private entityCells: Map<number, CellRef> = new Map()
    cellSize: number
    queryPadding: number
    users: Map<number, User> = new Map()
    visibilityResolver = pointInAABB2D

    constructor(localState: LocalState, cellSize: number, options: ChannelAABB2DSparseGridOptions = {}) {
        if (!Number.isFinite(cellSize) || cellSize <= 0) {
            throw new Error('ChannelAABB2DSparseGrid requires a positive finite cell size.')
        }
        if (options.queryPadding !== undefined && (!Number.isFinite(options.queryPadding) || options.queryPadding < 0)) {
            throw new Error('ChannelAABB2DSparseGrid queryPadding must be a non-negative finite number.')
        }
        this.channel = new Channel(localState, options)
        this.cellSize = cellSize
        this.queryPadding = options.queryPadding || 0
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

    private cellKey(x: number, y: number) {
        return `${x}:${y}`
    }

    private cellKeyForPoint(point: Point2D) {
        return this.cellKey(
            Math.floor(point.x / this.cellSize),
            Math.floor(point.y / this.cellSize)
        )
    }

    private cellCoordForEnd(value: number) {
        return Math.ceil(value / this.cellSize) - 1
    }

    private addToCell(entity: GridEntity, key: string) {
        let entities = this.cells.get(key)
        if (!entities) {
            entities = []
            this.cells.set(key, entities)
        }

        this.entityCells.set(entity.nid, { key, index: entities.length })
        entities.push(entity)
    }

    private removeFromCell(entity: GridEntity) {
        const ref = this.entityCells.get(entity.nid)
        if (!ref) {
            return
        }

        const entities = this.cells.get(ref.key)
        if (!entities) {
            this.entityCells.delete(entity.nid)
            return
        }

        const lastIndex = entities.length - 1
        const moved = entities[lastIndex]
        entities[ref.index] = moved
        entities.pop()
        if (moved && moved.nid !== entity.nid) {
            this.entityCells.set(moved.nid, { key: ref.key, index: ref.index })
        }
        if (entities.length === 0) {
            this.cells.delete(ref.key)
        }
        this.entityCells.delete(entity.nid)
    }

    tick(tick: number) {
        this.channel.tick(tick)
    }

    addEntity(entity: GridEntity) {
        this.channel.addEntity(entity)
        this.addToCell(entity, this.cellKeyForPoint(entity))
        return entity
    }

    updateEntity(entity: GridEntity) {
        const current = this.entityCells.get(entity.nid)
        if (!current) {
            return
        }

        const nextKey = this.cellKeyForPoint(entity)
        if (current.key === nextKey) {
            return
        }

        this.removeFromCell(entity)
        this.addToCell(entity, nextKey)
    }

    removeEntity(entity: GridEntity) {
        this.removeFromCell(entity)
        this.channel.removeEntity(entity)
    }

    removeAllEntities() {
        this.channel.removeAllEntities()
        this.cells.clear()
        this.entityCells.clear()
    }

    addMessage(message: any) {
        this.users.forEach((user, userId) => {
            const view = this.views.get(userId)
            if (view && pointInAABB2D(message, view)) {
                user.queueMessage(message)
            }
        })
    }

    subscribe(user: User, view: AABB2D) {
        this.views.set(user.id, view)
        this.users.set(user.id, user)
        user.subscribe(this as any)
    }

    updateView(user: User, view: AABB2D) {
        if (!this.users.has(user.id)) {
            return
        }
        this.views.set(user.id, view)
    }

    unsubscribe(user: User) {
        this.views.delete(user.id)
        this.users.delete(user.id)
        user.unsubscribe(this as any)
    }

    unsubscribeAll() {
        Array.from(this.users.values()).forEach(user => this.unsubscribe(user))
    }

    getVisibleEntities(userId: number): number[] {
        const view = this.views.get(userId)
        const visibleEntities: number[] = []
        if (!view) {
            return visibleEntities
        }

        const halfWidth = view.halfWidth + this.queryPadding
        const halfHeight = view.halfHeight + this.queryPadding
        const startX = view.x - halfWidth
        const startY = view.y - halfHeight
        const endX = view.x + halfWidth
        const endY = view.y + halfHeight
        const minX = Math.floor(startX / this.cellSize)
        const maxX = this.cellCoordForEnd(endX)
        const minY = Math.floor(startY / this.cellSize)
        const maxY = this.cellCoordForEnd(endY)

        for (let cellX = minX; cellX <= maxX; cellX++) {
            for (let cellY = minY; cellY <= maxY; cellY++) {
                const entities = this.cells.get(this.cellKey(cellX, cellY))
                if (!entities) {
                    continue
                }
                for (const entity of entities) {
                    if (entity.x >= startX &&
                        entity.x < endX &&
                        entity.y >= startY &&
                        entity.y < endY) {
                        visibleEntities.push(entity.nid)
                    }
                }
            }
        }

        return visibleEntities
    }

    destroy() {
        this.unsubscribeAll()
        this.channel.destroy()
        this.views.clear()
        this.cells.clear()
        this.entityCells.clear()
        this.visibilityResolver = () => true
    }
}
