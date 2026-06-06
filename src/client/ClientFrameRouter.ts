import { IEntity } from '../common/IEntity'
import { Client } from './Client'
import { AppliedEntityChange, DeletedEntity, Frame } from './Frame'
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
}

type CreateHandler = (entity: IEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void
type UpdateHandler = (update: AppliedEntityChange, entity: IEntity | undefined, tracked: TrackedClientEntity | undefined, frame: Frame) => void
type DeleteHandler = (nid: number, deleted: DeletedEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void
type MessageHandler = (message: any, frame: Frame) => void

export type ClientStateRouterOptions = {
    defaultMode?: ClientEntityMode | null
    interpolator?: FixedStepInterpolator
    interpolatorOptions?: FixedStepInterpolatorOptions
}

export type ClientFrameRouterOptions = ClientStateRouterOptions

export type ProcessServerFramesOptions = {
    maxFrames?: number
}

function emptyBatch(frames: Frame[] = []): RoutedFrameBatch {
    return {
        frames,
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

export class ClientStateRouter {
    client: Client
    interpolator: FixedStepInterpolator
    defaultMode: ClientEntityMode | null
    tracked = new Map<number, TrackedClientEntity>()
    lastBatch: RoutedFrameBatch = emptyBatch()

    private createHandlers = new Map<number, CreateHandler[]>()
    private updateHandlers = new Map<number, UpdateHandler[]>()
    private deleteHandlers = new Map<number, DeleteHandler[]>()
    private messageHandlers = new Map<number, MessageHandler[]>()
    private anyCreateHandlers: CreateHandler[] = []
    private anyUpdateHandlers: UpdateHandler[] = []
    private anyDeleteHandlers: DeleteHandler[] = []
    private anyMessageHandlers: MessageHandler[] = []
    private interpolatedVisible = new Set<number>()

    constructor(client: Client, options: ClientStateRouterOptions = {}) {
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
            frame.deletedEntities.forEach(deleted => {
                this.processDelete(frame, deleted, batch)
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
                exited: []
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

        this.interpolatedVisible = currentVisible
        return { status: sample.status, sample, state, entities, entered, exited }
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

        this.anyCreateHandlers.forEach(handler => handler(entity, tracked, frame))
        const handlers = this.createHandlers.get(entity.ntype) || []
        handlers.forEach(handler => handler(entity, tracked, frame))
    }

    private processUpdate(frame: Frame, update: AppliedEntityChange, batch: RoutedFrameBatch) {
        const entity = this.client.network.store.get(update.nid)
        const tracked = this.tracked.get(update.nid)

        batch.updateEntities.push(update)
        batch.updatedNids.add(update.nid)
        batch.changedNids.add(update.nid)

        const ntype = entity?.ntype ?? tracked?.ntype
        this.anyUpdateHandlers.forEach(handler => handler(update, entity, tracked, frame))
        if (ntype !== undefined) {
            const handlers = this.updateHandlers.get(ntype) || []
            handlers.forEach(handler => handler(update, entity, tracked, frame))
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
        }
    }

    private processMessage(frame: Frame, message: any, batch: RoutedFrameBatch) {
        batch.messages.push(message)
        this.anyMessageHandlers.forEach(handler => handler(message, frame))
        const handlers = this.messageHandlers.get(message.ntype) || []
        handlers.forEach(handler => handler(message, frame))
    }
}

export { ClientStateRouter as ClientFrameRouter }
