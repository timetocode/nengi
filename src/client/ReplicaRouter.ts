import { IEntity } from '../common/IEntity'
import { Client } from './Client'
import { AppliedEntityChange, ClosedChannel, DeletedEntity, Frame } from './Frame'
import { FixedStepInterpolator, FixedStepInterpolatorOptions, InterpolationSample, InterpolationStatus, InterpolatedState, StaticInterpolator } from './FixedStepInterpolator'

export enum ClientEntityMode {
    Raw = 'raw',
    Interpolated = 'interpolated',
    Predicted = 'predicted',
    Ignored = 'ignored'
}

export type TrackedClientEntity<Local = any, Meta = any> = {
    nid: number
    ntype: number
    mode: ClientEntityMode
    local?: Local
    meta?: Meta
    deleted: boolean
}

export type TrackOptions<Local = any, Meta = any> = {
    ntype?: number
    mode?: ClientEntityMode
    local?: Local
    meta?: Meta
}

export type RoutedEntity<Local = any, Meta = any> = {
    entity: IEntity
    tracked: TrackedClientEntity<Local, Meta>
    channelId?: number
    channelHeader?: IEntity
}

export type RoutedUpdate<Local = any, Meta = any> = {
    update: AppliedEntityChange
    entity?: IEntity
    tracked?: TrackedClientEntity<Local, Meta>
}

export type RoutedDelete<Local = any, Meta = any> = {
    nid: number
    deleted: DeletedEntity
    tracked?: TrackedClientEntity<Local, Meta>
}

export type RoutedFrameBatch = {
    frames: Frame[]
    closedChannels: ClosedChannel[]
    ecsCreateEntities: number[]
    ecsCreateComponents: IEntity[]
    ecsDeleteEntities: number[]
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]
    createdNids: Set<number>
    updatedNids: Set<number>
    deletedNids: Set<number>
    changedNids: Set<number>
}

export type InterpolatedRouterSample<Local = any, Meta = any> = {
    status: InterpolationStatus
    sample: InterpolationSample
    state: InterpolatedState | null
    entities: RoutedEntity<Local, Meta>[]
    entered: RoutedEntity<Local, Meta>[]
    exited: TrackedClientEntity<Local, Meta>[]
    messages: any[]
}

type CreateHandler = (entity: IEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void
export type ChannelRouteContext = {
    channelId: number
    header?: IEntity
    closed?: ClosedChannel
}
type ChannelRoutePredicate = (ctx: ChannelRouteContext, frame: Frame) => boolean
type ChannelRouteOpenHandler = (ctx: ChannelRouteContext, frame: Frame) => void
type ChannelRouteHeaderUpdateHandler = (update: any, ctx: ChannelRouteContext, frame: Frame) => void
type ChannelRouteCreateHandler = (entity: IEntity, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void
type ChannelRouteUpdateHandler = (update: AppliedEntityChange, entity: IEntity | undefined, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void
type ChannelRouteDeleteHandler = (nid: number, deleted: DeletedEntity, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void
type ChannelRouteCloseHandler = (ctx: ChannelRouteContext, frame: Frame) => void
type ChannelHeaderCreateHandler = (header: IEntity, frame: Frame, channelId: number) => void
type ChannelHeaderUpdateHandler = (update: any, header: IEntity | undefined, frame: Frame, channelId: number) => void
type ChannelHeaderDeleteHandler = (channelId: number, header: IEntity | undefined, frame: Frame) => void
type EcsCreateEntityHandler = (pid: number, frame: Frame) => void
type EcsCreateComponentHandler = (component: IEntity, frame: Frame) => void
type EcsDeleteEntityHandler = (pid: number, frame: Frame) => void
type UpdateHandler = (update: AppliedEntityChange, entity: IEntity | undefined, tracked: TrackedClientEntity | undefined, frame: Frame) => void
type DeleteHandler = (nid: number, deleted: DeletedEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void
type MessageHandler = (message: any, frame: Frame) => void

export type ReplicaRouterOptions = {
    defaultMode?: ClientEntityMode | null
    interpolator?: FixedStepInterpolator
    interpolatorOptions?: FixedStepInterpolatorOptions
}

export type ProcessServerFramesOptions = {
    maxFrames?: number
}

function emptyBatch(frames: Frame[] = []): RoutedFrameBatch {
    return {
        frames,
        closedChannels: [],
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        createEntities: [],
        updateEntities: [],
        deleteEntities: [],
        deletedEntities: [],
        messages: [],
        createdNids: new Set(),
        updatedNids: new Set(),
        deletedNids: new Set(),
        changedNids: new Set()
    }
}

function addHandler<T>(handlers: Map<number, T[]>, ntype: number, handler: T) {
    const arr = handlers.get(ntype) || []
    arr.push(handler)
    handlers.set(ntype, arr)
}

type ChannelRoute = {
    predicate: ChannelRoutePredicate
    openHandlers: ChannelRouteOpenHandler[]
    headerUpdateHandlers: ChannelRouteHeaderUpdateHandler[]
    closeHandlers: ChannelRouteCloseHandler[]
    createHandlers: Map<number, ChannelRouteCreateHandler[]>
    updateHandlers: Map<number, ChannelRouteUpdateHandler[]>
    deleteHandlers: Map<number, ChannelRouteDeleteHandler[]>
}

export class ChannelRouteBuilder {
    private route: ChannelRoute

    constructor(route: ChannelRoute) {
        this.route = route
    }

    onOpen(handler: ChannelRouteOpenHandler) {
        this.route.openHandlers.push(handler)
        return this
    }

    onHeaderUpdate(handler: ChannelRouteHeaderUpdateHandler) {
        this.route.headerUpdateHandlers.push(handler)
        return this
    }

    onCreate(ntype: number, handler: ChannelRouteCreateHandler) {
        addHandler(this.route.createHandlers, ntype, handler)
        return this
    }

    onUpdate(ntype: number, handler: ChannelRouteUpdateHandler) {
        addHandler(this.route.updateHandlers, ntype, handler)
        return this
    }

    onDelete(ntype: number, handler: ChannelRouteDeleteHandler) {
        addHandler(this.route.deleteHandlers, ntype, handler)
        return this
    }

    onClose(handler: ChannelRouteCloseHandler) {
        this.route.closeHandlers.push(handler)
        return this
    }
}

export class ReplicaRouter {
    client: Client
    interpolator: FixedStepInterpolator
    defaultMode: ClientEntityMode | null
    tracked = new Map<number, TrackedClientEntity>()
    lastBatch: RoutedFrameBatch = emptyBatch()

    private createHandlers = new Map<number, CreateHandler[]>()
    private updateHandlers = new Map<number, UpdateHandler[]>()
    private deleteHandlers = new Map<number, DeleteHandler[]>()
    private messageHandlers = new Map<number, MessageHandler[]>()
    private interpolatedMessageHandlers = new Map<number, MessageHandler[]>()
    private channelRoutes: ChannelRoute[] = []
    private channelHeaderCreateHandlers: ChannelHeaderCreateHandler[] = []
    private channelHeaderUpdateHandlers: ChannelHeaderUpdateHandler[] = []
    private channelHeaderDeleteHandlers: ChannelHeaderDeleteHandler[] = []
    private ecsCreateEntityHandlers: EcsCreateEntityHandler[] = []
    private ecsCreateComponentHandlers: EcsCreateComponentHandler[] = []
    private ecsDeleteEntityHandlers: EcsDeleteEntityHandler[] = []
    private anyCreateHandlers: CreateHandler[] = []
    private anyUpdateHandlers: UpdateHandler[] = []
    private anyDeleteHandlers: DeleteHandler[] = []
    private anyMessageHandlers: MessageHandler[] = []
    private anyInterpolatedMessageHandlers: MessageHandler[] = []
    private interpolatedVisible = new Set<number>()
    private lastInterpolatedMessageTick = Number.NEGATIVE_INFINITY

    constructor(client: Client, options: ReplicaRouterOptions = {}) {
        this.client = client
        this.interpolator = options.interpolator || (
            options.interpolatorOptions
                ? new FixedStepInterpolator(client, options.interpolatorOptions)
                : new StaticInterpolator(client)
        )
        this.defaultMode = options.defaultMode ?? null
    }

    onCreate(ntype: number, handler: CreateHandler) {
        addHandler(this.createHandlers, ntype, handler)
    }

    onCreateAny(handler: CreateHandler) {
        this.anyCreateHandlers.push(handler)
    }

    channel(predicate: ChannelRoutePredicate) {
        const route: ChannelRoute = {
            predicate,
            openHandlers: [],
            headerUpdateHandlers: [],
            closeHandlers: [],
            createHandlers: new Map(),
            updateHandlers: new Map(),
            deleteHandlers: new Map()
        }
        this.channelRoutes.push(route)
        return new ChannelRouteBuilder(route)
    }

    onChannelHeaderCreate(handler: ChannelHeaderCreateHandler) {
        this.channelHeaderCreateHandlers.push(handler)
    }

    onChannelHeaderUpdate(handler: ChannelHeaderUpdateHandler) {
        this.channelHeaderUpdateHandlers.push(handler)
    }

    onChannelHeaderDelete(handler: ChannelHeaderDeleteHandler) {
        this.channelHeaderDeleteHandlers.push(handler)
    }

    onEcsCreateEntity(handler: EcsCreateEntityHandler) {
        this.ecsCreateEntityHandlers.push(handler)
    }

    onEcsCreateComponent(handler: EcsCreateComponentHandler) {
        this.ecsCreateComponentHandlers.push(handler)
    }

    onEcsDeleteEntity(handler: EcsDeleteEntityHandler) {
        this.ecsDeleteEntityHandlers.push(handler)
    }

    onUpdate(ntype: number, handler: UpdateHandler) {
        addHandler(this.updateHandlers, ntype, handler)
    }

    onUpdateAny(handler: UpdateHandler) {
        this.anyUpdateHandlers.push(handler)
    }

    onDelete(ntype: number, handler: DeleteHandler) {
        addHandler(this.deleteHandlers, ntype, handler)
    }

    onDeleteAny(handler: DeleteHandler) {
        this.anyDeleteHandlers.push(handler)
    }

    onMessage(ntype: number, handler: MessageHandler) {
        addHandler(this.messageHandlers, ntype, handler)
    }

    onMessageAny(handler: MessageHandler) {
        this.anyMessageHandlers.push(handler)
    }

    onInterpolatedMessage(ntype: number, handler: MessageHandler) {
        addHandler(this.interpolatedMessageHandlers, ntype, handler)
    }

    onInterpolatedMessageAny(handler: MessageHandler) {
        this.anyInterpolatedMessageHandlers.push(handler)
    }

    process(options: ProcessServerFramesOptions = {}): RoutedFrameBatch {
        return this.processServerFrames(options)
    }

    processServerFrames(options: ProcessServerFramesOptions = {}): RoutedFrameBatch {
        const batch = emptyBatch()
        const maxFrames = options.maxFrames ?? Number.POSITIVE_INFINITY

        while (batch.frames.length < maxFrames) {
            const frame = this.client.network.processNextFrame()
            if (!frame) {
                break
            }
            batch.frames.push(frame)
            frame.channelHeaderCreates.forEach(create => {
                this.processChannelHeaderCreate(frame, create.channelId, create.header)
            })

            frame.channelHeaderUpdates.forEach(update => {
                const header = this.client.network.store.getChannelHeader(update.channelId)
                update.changes.forEach(change => {
                    this.processChannelHeaderUpdate(frame, update.channelId, change, header)
                })
            })

            frame.closedChannels.forEach(closed => {
                this.processChannelClose(frame, closed, batch)
            })

            frame.ecsDeleteEntities.forEach(pid => {
                this.processEcsDeleteEntity(frame, pid, batch)
            })

            frame.deletedEntities.forEach(deleted => {
                this.processDelete(frame, deleted, batch)
            })

            frame.ecsCreateEntities.forEach(pid => {
                this.processEcsCreateEntity(frame, pid, batch)
            })

            frame.ecsCreateComponents.forEach(component => {
                this.processEcsCreateComponent(frame, component, batch)
            })

            frame.createEntities.forEach(entity => {
                this.processCreate(frame, entity, batch)
            })

            frame.updateEntities.forEach(update => {
                this.processUpdate(frame, update, batch)
            })

            frame.messages.forEach(message => {
                this.processMessage(frame, message, batch)
            })
        }

        this.lastBatch = batch
        return batch
    }

    track<Local = any, Meta = any>(nid: number, options: TrackOptions<Local, Meta> = {}): TrackedClientEntity<Local, Meta> {
        const existing = this.tracked.get(nid)
        const entity = this.client.network.store.get(nid)
        const ntype = options.ntype ?? existing?.ntype ?? entity?.ntype

        if (ntype === undefined) {
            throw new Error(`Cannot track nid ${nid} without an ntype.`)
        }

        const tracked: TrackedClientEntity<Local, Meta> = {
            nid,
            ntype,
            mode: options.mode ?? existing?.mode ?? ClientEntityMode.Raw,
            local: options.local ?? existing?.local,
            meta: options.meta ?? existing?.meta,
            deleted: false
        }

        this.tracked.set(nid, tracked)
        return tracked
    }

    trackEntity<Local = any, Meta = any>(entity: IEntity, options: TrackOptions<Local, Meta> = {}): TrackedClientEntity<Local, Meta> {
        return this.track(entity.nid, { ...options, ntype: entity.ntype })
    }

    untrack(nid: number) {
        this.tracked.delete(nid)
        this.interpolatedVisible.delete(nid)
    }

    setMode(nid: number, mode: ClientEntityMode) {
        const tracked = this.tracked.get(nid)
        if (!tracked) {
            this.track(nid, { mode })
            return
        }
        tracked.mode = mode
    }

    getRaw(nid: number) {
        return this.client.network.store.get(nid)
    }

    getChannelId(nid: number) {
        return this.client.network.store.getChannelId(nid)
    }

    getChannelHeader(channelOrEntityNid: number) {
        return this.client.network.store.getChannelHeader(channelOrEntityNid)
    }

    getLastConfirmedClientTick() {
        return this.client.network.latestFrame?.confirmedClientTick ?? -1
    }

    getRawTracked<Local = any, Meta = any>(mode?: ClientEntityMode): RoutedEntity<Local, Meta>[] {
        const entities: RoutedEntity<Local, Meta>[] = []
        this.tracked.forEach(tracked => {
            if (mode && tracked.mode !== mode) {
                return
            }
            const entity = this.client.network.store.get(tracked.nid)
            if (entity) {
                entities.push({ entity, tracked: tracked as TrackedClientEntity<Local, Meta> })
            }
        })
        return entities
    }

    getChangedRaw<Local = any, Meta = any>(): RoutedEntity<Local, Meta>[] {
        const entities: RoutedEntity<Local, Meta>[] = []
        this.lastBatch.changedNids.forEach(nid => {
            const tracked = this.tracked.get(nid) as TrackedClientEntity<Local, Meta> | undefined
            const entity = this.client.network.store.get(nid)
            if (tracked && entity) {
                entities.push({ entity, tracked })
            }
        })
        return entities
    }

    getChangedNids() {
        return Array.from(this.lastBatch.changedNids)
    }

    sampleInterpolated<Local = any, Meta = any>(interpDelay: number, now = Date.now()): InterpolatedRouterSample<Local, Meta> {
        const interpolatedNids: number[] = []
        this.tracked.forEach(tracked => {
            if (tracked.mode === ClientEntityMode.Interpolated) {
                interpolatedNids.push(tracked.nid)
            }
        })

        const sample = this.interpolator.sampleEntities(interpolatedNids, interpDelay, now)
        const state = sample.status === InterpolationStatus.Ok ? sample as InterpolatedState : null
        if (!state) {
            return {
                status: sample.status,
                sample,
                state: null,
                entities: [],
                entered: [],
                exited: [],
                messages: []
            }
        }

        const currentVisible = new Set<number>()
        const entities: RoutedEntity<Local, Meta>[] = []
        const entered: RoutedEntity<Local, Meta>[] = []
        const exited: TrackedClientEntity<Local, Meta>[] = []

        this.tracked.forEach(tracked => {
            if (tracked.mode !== ClientEntityMode.Interpolated) {
                return
            }

            const entity = state.entities.get(tracked.nid)
            if (entity) {
                const routed = { entity, tracked: tracked as TrackedClientEntity<Local, Meta> }
                entities.push(routed)
                currentVisible.add(tracked.nid)
                if (!this.interpolatedVisible.has(tracked.nid)) {
                    entered.push(routed)
                }
            } else if (this.interpolatedVisible.has(tracked.nid)) {
                exited.push(tracked as TrackedClientEntity<Local, Meta>)
                if (tracked.deleted) {
                    this.tracked.delete(tracked.nid)
                }
            }
        })

        const messages = this.processInterpolatedMessages(state.targetFrameTick)
        this.interpolatedVisible = currentVisible
        return { status: sample.status, sample, state, entities, entered, exited, messages }
    }

    private processEcsCreateEntity(frame: Frame, pid: number, batch: RoutedFrameBatch) {
        batch.ecsCreateEntities.push(pid)
        this.ecsCreateEntityHandlers.forEach(handler => handler(pid, frame))
    }

    private processChannelHeaderCreate(frame: Frame, channelId: number, header: IEntity) {
        this.channelHeaderCreateHandlers.forEach(handler => handler(header, frame, channelId))
        const ctx = { channelId, header }
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.openHandlers.forEach(handler => handler(ctx, frame))
        })
    }

    private processChannelHeaderUpdate(frame: Frame, channelId: number, update: any, header: IEntity | undefined) {
        this.channelHeaderUpdateHandlers.forEach(handler => handler(update, header, frame, channelId))
        const ctx = this.getChannelRouteContext(channelId, frame)
        if (!ctx) {
            return
        }
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.headerUpdateHandlers.forEach(handler => handler(update, ctx, frame))
        })
    }

    private processChannelClose(frame: Frame, closed: ClosedChannel, batch: RoutedFrameBatch) {
        batch.closedChannels.push(closed)
        this.channelHeaderDeleteHandlers.forEach(handler => handler(closed.channelId, closed.header, frame))
        const ctx = { channelId: closed.channelId, header: closed.header, closed }
        this.matchingChannelRoutes(ctx, frame).forEach(route => {
            route.closeHandlers.forEach(handler => handler(ctx, frame))
        })
        for (let i = 0; i < closed.entityNids.length; i++) {
            this.untrack(closed.entityNids[i])
            batch.deletedNids.add(closed.entityNids[i])
            batch.changedNids.add(closed.entityNids[i])
        }
    }

    private processEcsCreateComponent(frame: Frame, component: IEntity, batch: RoutedFrameBatch) {
        batch.ecsCreateComponents.push(component)
        this.ecsCreateComponentHandlers.forEach(handler => handler(component, frame))
    }

    private processEcsDeleteEntity(frame: Frame, pid: number, batch: RoutedFrameBatch) {
        batch.ecsDeleteEntities.push(pid)
        this.ecsDeleteEntityHandlers.forEach(handler => handler(pid, frame))
    }

    private processCreate(frame: Frame, entity: IEntity, batch: RoutedFrameBatch) {
        if (this.defaultMode !== null && !this.tracked.has(entity.nid)) {
            this.trackEntity(entity, { mode: this.defaultMode })
        }

        const tracked = this.tracked.get(entity.nid)
        if (tracked) {
            tracked.deleted = false
            tracked.ntype = entity.ntype
        }

        batch.createEntities.push(entity)
        batch.createdNids.add(entity.nid)
        batch.changedNids.add(entity.nid)

        const channelId = this.client.network.store.getChannelId(entity.nid)
        const channelContext = channelId === undefined ? undefined : this.getChannelRouteContext(channelId, frame)

        this.anyCreateHandlers.forEach(handler => handler(entity, tracked, frame))
        const handlers = this.createHandlers.get(entity.ntype) || []
        handlers.forEach(handler => handler(entity, tracked, frame))
        if (channelContext) {
            this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                const channelHandlers = route.createHandlers.get(entity.ntype) || []
                channelHandlers.forEach(handler => handler(entity, tracked, channelContext, frame))
            })
        }
    }

    private processUpdate(frame: Frame, update: AppliedEntityChange, batch: RoutedFrameBatch) {
        const entity = this.client.network.store.get(update.nid)
        const tracked = this.tracked.get(update.nid)
        const channelId = this.client.network.store.getChannelId(update.nid)
        const channelContext = channelId === undefined ? undefined : this.getChannelRouteContext(channelId, frame)

        batch.updateEntities.push(update)
        batch.updatedNids.add(update.nid)
        batch.changedNids.add(update.nid)

        const ntype = entity?.ntype ?? tracked?.ntype
        this.anyUpdateHandlers.forEach(handler => handler(update, entity, tracked, frame))
        if (ntype !== undefined) {
            const handlers = this.updateHandlers.get(ntype) || []
            handlers.forEach(handler => handler(update, entity, tracked, frame))
            if (channelContext) {
                this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                    const channelHandlers = route.updateHandlers.get(ntype) || []
                    channelHandlers.forEach(handler => handler(update, entity, tracked, channelContext, frame))
                })
            }
        }
    }

    private processDelete(frame: Frame, deleted: DeletedEntity, batch: RoutedFrameBatch) {
        const tracked = this.tracked.get(deleted.nid)
        const ntype = deleted.entity?.ntype ?? tracked?.ntype

        if (tracked) {
            tracked.deleted = true
            if (tracked.mode !== ClientEntityMode.Interpolated) {
                this.tracked.delete(deleted.nid)
                this.interpolatedVisible.delete(deleted.nid)
            }
        }

        batch.deleteEntities.push(deleted.nid)
        batch.deletedEntities.push(deleted)
        batch.deletedNids.add(deleted.nid)
        batch.changedNids.add(deleted.nid)

        this.anyDeleteHandlers.forEach(handler => handler(deleted.nid, deleted, tracked, frame))
        if (ntype !== undefined) {
            const handlers = this.deleteHandlers.get(ntype) || []
            handlers.forEach(handler => handler(deleted.nid, deleted, tracked, frame))
            if (deleted.channelId !== undefined) {
                const channelContext = this.getChannelRouteContext(deleted.channelId, frame)
                if (channelContext) {
                    this.matchingChannelRoutes(channelContext, frame).forEach(route => {
                        const channelHandlers = route.deleteHandlers.get(ntype) || []
                        channelHandlers.forEach(handler => handler(deleted.nid, deleted, tracked, channelContext, frame))
                    })
                }
            }
        }
    }

    private processMessage(frame: Frame, message: any, batch: RoutedFrameBatch) {
        batch.messages.push(message)
        this.anyMessageHandlers.forEach(handler => handler(message, frame))
        const handlers = this.messageHandlers.get(message.ntype) || []
        handlers.forEach(handler => handler(message, frame))
    }

    private processInterpolatedMessages(targetFrameTick: number) {
        const messages: any[] = []
        const frames = this.client.network.frames
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i]
            if (frame.tick <= this.lastInterpolatedMessageTick || frame.tick > targetFrameTick) {
                continue
            }
            for (let j = 0; j < frame.messages.length; j++) {
                const message = frame.messages[j]
                messages.push(message)
                this.anyInterpolatedMessageHandlers.forEach(handler => handler(message, frame))
                const handlers = this.interpolatedMessageHandlers.get(message.ntype) || []
                handlers.forEach(handler => handler(message, frame))
            }
        }
        if (Number.isFinite(targetFrameTick)) {
            this.lastInterpolatedMessageTick = Math.max(this.lastInterpolatedMessageTick, targetFrameTick)
        }
        return messages
    }

    private getChannelRouteContext(channelId: number, frame: Frame): ChannelRouteContext | undefined {
        const header = this.client.network.store.getChannelHeader(channelId) ||
            frame.channelHeaderDeletes.find(deleted => deleted.channelId === channelId)?.header
        if (!header) {
            return undefined
        }
        return { channelId, header }
    }

    private matchingChannelRoutes(ctx: ChannelRouteContext, frame: Frame) {
        const routes: ChannelRoute[] = []
        for (let i = 0; i < this.channelRoutes.length; i++) {
            const route = this.channelRoutes[i]
            if (route.predicate(ctx, frame)) {
                routes.push(route)
            }
        }
        return routes
    }
}
