import { IEntity } from '../common/IEntity'
import { ChannelHeader } from '../common/ChannelHeader'
import { Client } from './Client'
import { ClientEntityMode } from './ClientEntityMode'
import { AppliedEntityChange, ClosedChannel, DeletedEntity, Frame } from './Frame'
import {
    FixedStepInterpolator,
    FixedStepInterpolatorOptions,
    InterpolationSample,
    InterpolationStatus,
    InterpolatedState,
    StaticInterpolator
} from './FixedStepInterpolator'

export type ClientChannel<Header extends IEntity = IEntity> = {
    id: number
    open: boolean
    header: Header & ChannelHeader
}

export type ClientReplicaEntity<Local = any> = {
    nid: number
    ntype: number
    mode: ClientEntityMode
    local: Local
    channel: ClientChannel | null
    deleted: boolean
}

export type ClientReplicaBatch = {
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

export type ClientReplicaSample<Local = any> = {
    status: InterpolationStatus
    sample: InterpolationSample
    state: InterpolatedState | null
    entities: ClientReplicaRoutedEntity<Local>[]
    entered: ClientReplicaRoutedEntity<Local>[]
    exited: ClientReplicaEntity<Local>[]
    messages: any[]
}

export type ClientReplicaRoutedEntity<Local = any> = {
    entity: IEntity
    replica: ClientReplicaEntity<Local>
    channel: ClientChannel | null
}

export type ClientEntityBindingContext<Local = any> = {
    replica: ClientReplica
    ref: ClientReplicaEntity<Local>
    nid: number
    pid?: number
    frame?: Frame
    channel: ClientChannel | null
    update?: AppliedEntityChange
    deleted?: DeletedEntity
    closedChannel?: ClosedChannel
    sample?: ClientReplicaSample<Local>
    state?: InterpolatedState | null
}

export type ClientChannelEntityBindingContext<Header extends IEntity = IEntity, Local = any> =
    Omit<ClientEntityBindingContext<Local>, 'channel'> & {
        channel: ClientChannel<Header>
    }

export type ClientEntityBinding<Entity extends IEntity = IEntity, Local = any> = {
    mode?: ClientEntityMode
    create: (entity: Entity, ctx: ClientEntityBindingContext<Local>) => Local
    update?: (entity: Entity, local: Local, ctx: ClientEntityBindingContext<Local>) => void
    sample?: (entity: Entity, local: Local, ctx: ClientEntityBindingContext<Local>) => void
    destroy?: (local: Local, ctx: ClientEntityBindingContext<Local>) => void
}

export type ClientChannelEntityBinding<Header extends IEntity = IEntity, Entity extends IEntity = IEntity, Local = any> = {
    mode?: ClientEntityMode
    create: (entity: Entity, ctx: ClientChannelEntityBindingContext<Header, Local>) => Local
    update?: (entity: Entity, local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void
    sample?: (entity: Entity, local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void
    destroy?: (local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void
}

export type ClientChannelBinding<Header extends IEntity = IEntity> = {
    open?: (channel: ClientChannel<Header>, frame: Frame) => void
    update?: (channel: ClientChannel<Header>, change: any, frame: Frame) => void
    close?: (channel: ClientChannel<Header>, frame: Frame) => void
}

export type ClientMessageHandler<Message = any> = (message: Message, frame: Frame) => void

export type ClientEcsRootHandler = (pid: number, frame: Frame) => void

export type ClientEcsComponentBindingContext<Local = any> = ClientEntityBindingContext<Local> & {
    pid: number
}

export type ClientEcsComponentBinding<Component extends IEntity & { pid: number } = IEntity & { pid: number }, Local = any> = {
    mode?: ClientEntityMode
    create: (component: Component, ctx: ClientEcsComponentBindingContext<Local>) => Local
    update?: (component: Component, local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void
    sample?: (component: Component, local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void
    destroy?: (local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void
}

export type ClientReplicaOptions = {
    interpolator?: FixedStepInterpolator
    interpolatorOptions?: FixedStepInterpolatorOptions
}

export type ProcessClientReplicaOptions = {
    maxFrames?: number
}

type StoredBinding = {
    mode?: ClientEntityMode
    create: (entity: IEntity, ctx: ClientEntityBindingContext) => any
    update?: (entity: IEntity, local: any, ctx: ClientEntityBindingContext) => void
    sample?: (entity: IEntity, local: any, ctx: ClientEntityBindingContext) => void
    destroy?: (local: any, ctx: ClientEntityBindingContext) => void
}

type StoredChannelEntityBinding = {
    headerNtype: number
    entityNtype: number
    binding: StoredBinding
}

function emptyBatch(frames: Frame[] = []): ClientReplicaBatch {
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

export class ClientReplica {
    client: Client
    interpolator: FixedStepInterpolator
    channels = new Map<number, ClientChannel>()
    entities = new Map<number, ClientReplicaEntity>()
    lastBatch: ClientReplicaBatch = emptyBatch()

    private entityBindings = new Map<number, StoredBinding>()
    private ecsComponentBindings = new Map<number, StoredBinding>()
    private entityBindingsByNid = new Map<number, StoredBinding>()
    private channelBindings = new Map<number, ClientChannelBinding>()
    private channelEntityBindings: StoredChannelEntityBinding[] = []
    private ecsCreateEntityHandlers: ClientEcsRootHandler[] = []
    private ecsDeleteEntityHandlers: ClientEcsRootHandler[] = []
    private messageHandlers = new Map<number, ClientMessageHandler[]>()
    private anyMessageHandlers: ClientMessageHandler[] = []
    private interpolatedMessageHandlers = new Map<number, ClientMessageHandler[]>()
    private anyInterpolatedMessageHandlers: ClientMessageHandler[] = []
    private interpolatedVisible = new Set<number>()
    private lastInterpolatedMessageTick = Number.NEGATIVE_INFINITY

    constructor(client: Client, options: ClientReplicaOptions = {}) {
        this.client = client
        this.interpolator = options.interpolator || (
            options.interpolatorOptions
                ? new FixedStepInterpolator(client, options.interpolatorOptions)
                : new StaticInterpolator(client)
        )
    }

    bindEntity<Entity extends IEntity = IEntity, Local = any>(
        ntype: number,
        binding: ClientEntityBinding<Entity, Local>
    ) {
        this.entityBindings.set(ntype, binding as StoredBinding)
        return this
    }

    bindEcsComponent<Component extends IEntity & { pid: number } = IEntity & { pid: number }, Local = any>(
        ntype: number,
        binding: ClientEcsComponentBinding<Component, Local>
    ) {
        this.ecsComponentBindings.set(ntype, binding as unknown as StoredBinding)
        return this
    }

    onEcsCreateEntity(handler: ClientEcsRootHandler) {
        this.ecsCreateEntityHandlers.push(handler)
        return this
    }

    onEcsDeleteEntity(handler: ClientEcsRootHandler) {
        this.ecsDeleteEntityHandlers.push(handler)
        return this
    }

    bindChannel<Header extends IEntity = IEntity>(
        headerNtype: number,
        binding: ClientChannelBinding<Header>
    ) {
        this.channelBindings.set(headerNtype, binding as ClientChannelBinding)
        return this
    }

    bindChannelEntity<Header extends IEntity = IEntity, Entity extends IEntity = IEntity, Local = any>(
        headerNtype: number,
        entityNtype: number,
        binding: ClientChannelEntityBinding<Header, Entity, Local>
    ) {
        this.channelEntityBindings.push({
            headerNtype,
            entityNtype,
            binding: binding as unknown as StoredBinding
        })
        return this
    }

    onMessage<Message = any>(ntype: number, handler: ClientMessageHandler<Message>) {
        addHandler(this.messageHandlers, ntype, handler as ClientMessageHandler)
        return this
    }

    onMessageAny(handler: ClientMessageHandler) {
        this.anyMessageHandlers.push(handler)
        return this
    }

    onInterpolatedMessage<Message = any>(ntype: number, handler: ClientMessageHandler<Message>) {
        addHandler(this.interpolatedMessageHandlers, ntype, handler as ClientMessageHandler)
        return this
    }

    onInterpolatedMessageAny(handler: ClientMessageHandler) {
        this.anyInterpolatedMessageHandlers.push(handler)
        return this
    }

    process(options: ProcessClientReplicaOptions = {}) {
        const batch = emptyBatch()
        const maxFrames = options.maxFrames ?? Number.POSITIVE_INFINITY

        while (batch.frames.length < maxFrames) {
            const frame = this.client.network.processNextFrame()
            if (!frame) {
                break
            }
            batch.frames.push(frame)
            this.processChannelOpens(frame)
            this.processChannelHeaderUpdates(frame)
            this.processChannelCloses(frame, batch)
            this.processDeletes(frame, batch)
            this.processEcsDeleteEntities(frame, batch)
            this.processEcsCreateEntities(frame, batch)
            this.processEcsCreateComponents(frame, batch)
            this.processCreates(frame, batch)
            this.processUpdates(frame, batch)
            this.processMessages(frame, batch)
        }

        this.lastBatch = batch
        return batch
    }

    setMode(nid: number, mode: ClientEntityMode) {
        const ref = this.entities.get(nid)
        if (!ref) {
            return false
        }
        ref.mode = mode
        if (mode !== ClientEntityMode.Interpolated) {
            this.interpolatedVisible.delete(nid)
        }
        return true
    }

    getEntity(nid: number) {
        return this.client.network.store.get(nid)
    }

    getLastConfirmedClientTick() {
        return this.client.network.latestFrame?.confirmedClientTick ?? -1
    }

    getChangedNids() {
        return Array.from(this.lastBatch.changedNids)
    }

    sampleInterpolated<Local = any>(interpDelay: number, now = Date.now()): ClientReplicaSample<Local> {
        const interpolatedNids: number[] = []
        this.entities.forEach(ref => {
            if (ref.mode === ClientEntityMode.Interpolated) {
                interpolatedNids.push(ref.nid)
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
        const entities: ClientReplicaRoutedEntity<Local>[] = []
        const entered: ClientReplicaRoutedEntity<Local>[] = []
        const exited: ClientReplicaEntity<Local>[] = []

        this.entities.forEach(ref => {
            if (ref.mode !== ClientEntityMode.Interpolated) {
                return
            }
            const entity = state.entities.get(ref.nid)
            if (entity) {
                const routed = this.routedEntity(entity, ref as ClientReplicaEntity<Local>)
                entities.push(routed)
                currentVisible.add(ref.nid)
                if (!this.interpolatedVisible.has(ref.nid)) {
                    entered.push(routed)
                }
            } else if (this.interpolatedVisible.has(ref.nid)) {
                exited.push(ref as ClientReplicaEntity<Local>)
                if (ref.deleted) {
                    this.untrack(ref.nid)
                }
            }
        })

        const messages = this.processInterpolatedMessages(state.targetFrameTick)
        this.interpolatedVisible = currentVisible
        return { status: sample.status, sample, state, entities, entered, exited, messages }
    }

    applyInterpolatedSample<Local = any>(sample: ClientReplicaSample<Local>) {
        let applied = 0
        let destroyed = 0
        const entities = sample.state
            ? sample.entities
            : this.getTrackedByMode<Local>(ClientEntityMode.Interpolated)

        entities.forEach(({ entity, replica }) => {
            const binding = this.entityBindingsByNid.get(replica.nid)
            if (!binding?.sample) {
                return
            }
            binding.sample(entity, replica.local, this.createContext(replica, {
                sample,
                state: sample.state
            }))
            applied++
        })

        sample.exited.forEach(ref => {
            if (this.destroyBinding(ref, {
                sample,
                state: sample.state
            })) {
                destroyed++
            }
        })

        return { applied, destroyed }
    }

    private processChannelOpens(frame: Frame) {
        frame.openedChannels.forEach(opened => {
            const channel = this.ensureChannel(opened.channelId)
            channel.open = true
            channel.header = opened.header
            this.invokeChannelOpen(channel, frame)
        })
    }

    private processChannelHeaderUpdates(frame: Frame) {
        frame.channelHeaderUpdates.forEach(update => {
            const header = this.client.network.store.getChannelHeaderById(update.channelId)
            const channel = this.ensureChannel(update.channelId)
            channel.header = header!
            const binding = this.channelBindings.get(channel.header.ntype)
            if (!binding?.update) {
                return
            }
            update.changes.forEach(change => binding.update!(channel as ClientChannel & { header: IEntity }, change, frame))
        })
    }

    private processChannelCloses(frame: Frame, batch: ClientReplicaBatch) {
        frame.closedChannels.forEach(closed => {
            const channel = this.ensureChannel(closed.channelId)
            channel.header = closed.header
            batch.closedChannels.push(closed)
            const binding = this.channelBindings.get(channel.header.ntype)
            binding?.close?.(channel, frame)
            for (let i = 0; i < closed.entityNids.length; i++) {
                const nid = closed.entityNids[i]
                this.destroyBinding(this.entities.get(nid), {
                    frame,
                    closedChannel: closed,
                    force: true
                })
                this.untrack(nid)
                batch.deletedNids.add(nid)
                batch.changedNids.add(nid)
            }
            channel.open = false
            this.channels.delete(closed.channelId)
        })
    }

    private processCreates(frame: Frame, batch: ClientReplicaBatch) {
        for (let i = 0; i < frame.createEntities.length; i++) {
            const entity = frame.createEntities[i]
            batch.createEntities.push(entity)
            batch.createdNids.add(entity.nid)
            batch.changedNids.add(entity.nid)
            this.applyCreate(frame, entity)
        }
    }

    private processEcsCreateEntities(frame: Frame, batch: ClientReplicaBatch) {
        frame.ecsCreateEntities.forEach(pid => {
            batch.ecsCreateEntities.push(pid)
            this.ecsCreateEntityHandlers.forEach(handler => handler(pid, frame))
        })
    }

    private processEcsCreateComponents(frame: Frame, batch: ClientReplicaBatch) {
        frame.ecsCreateComponents.forEach(component => {
            batch.ecsCreateComponents.push(component)
        })
    }

    private processEcsDeleteEntities(frame: Frame, batch: ClientReplicaBatch) {
        frame.ecsDeleteEntities.forEach(pid => {
            batch.ecsDeleteEntities.push(pid)
            this.ecsDeleteEntityHandlers.forEach(handler => handler(pid, frame))
        })
    }

    private processUpdates(frame: Frame, batch: ClientReplicaBatch) {
        frame.updateEntities.forEach(update => {
            const entity = this.client.network.store.get(update.nid)
            const ref = this.entities.get(update.nid)
            batch.updateEntities.push(update)
            batch.updatedNids.add(update.nid)
            batch.changedNids.add(update.nid)
            if (!entity || !ref) {
                return
            }
            const binding = this.entityBindingsByNid.get(update.nid)
            binding?.update?.(entity, ref.local, this.createContext(ref, {
                frame,
                update
            }))
        })
    }

    private processDeletes(frame: Frame, batch: ClientReplicaBatch) {
        frame.deletedEntities.forEach(deleted => {
            const ref = this.entities.get(deleted.nid)
            if (ref) {
                ref.deleted = true
                this.destroyBinding(ref, {
                    frame,
                    deleted
                })
                if (ref.mode !== ClientEntityMode.Interpolated) {
                    this.untrack(deleted.nid)
                }
            }
            batch.deleteEntities.push(deleted.nid)
            batch.deletedEntities.push(deleted)
            batch.deletedNids.add(deleted.nid)
            batch.changedNids.add(deleted.nid)
        })
    }

    private processMessages(frame: Frame, batch: ClientReplicaBatch) {
        frame.messages.forEach(message => {
            batch.messages.push(message)
            this.anyMessageHandlers.forEach(handler => handler(message, frame))
            const handlers = this.messageHandlers.get(message.ntype) || []
            handlers.forEach(handler => handler(message, frame))
        })
    }

    private applyCreate(frame: Frame, entity: IEntity) {
        const channel = this.getEntityChannel(entity.nid)
        const pid = this.getEcsComponentPid(entity)
        const binding = (pid === undefined ? undefined : this.ecsComponentBindings.get(entity.ntype)) || this.resolveBinding(entity.ntype, channel)
        if (!binding) {
            return
        }

        const ref = {
            nid: entity.nid,
            ntype: entity.ntype,
            mode: binding.mode ?? ClientEntityMode.Raw,
            local: undefined as any,
            channel,
            deleted: false
        }
        const ctx = this.createContext(ref, { frame, pid })
        ref.local = binding.create(entity, ctx)
        this.entities.set(entity.nid, ref)
        this.entityBindingsByNid.set(entity.nid, binding)
    }

    private invokeChannelOpen(channel: ClientChannel, frame: Frame) {
        const binding = this.channelBindings.get(channel.header.ntype)
        binding?.open?.(channel, frame)
    }

    private resolveBinding(ntype: number, channel: ClientChannel | null) {
        if (channel) {
            for (let i = 0; i < this.channelEntityBindings.length; i++) {
                const candidate = this.channelEntityBindings[i]
                if (candidate.headerNtype === channel.header.ntype && candidate.entityNtype === ntype) {
                    return candidate.binding
                }
            }
        }
        return this.entityBindings.get(ntype)
    }

    private routedEntity<Local = any>(entity: IEntity, ref: ClientReplicaEntity<Local>): ClientReplicaRoutedEntity<Local> {
        ref.channel = this.getEntityChannel(ref.nid)
        return {
            entity,
            replica: ref,
            channel: ref.channel
        }
    }

    private getTrackedByMode<Local = any>(mode: ClientEntityMode) {
        const entities: ClientReplicaRoutedEntity<Local>[] = []
        this.entities.forEach(ref => {
            if (ref.mode !== mode) {
                return
            }
            const entity = this.client.network.store.get(ref.nid)
            if (entity) {
                entities.push(this.routedEntity(entity, ref as ClientReplicaEntity<Local>))
            }
        })
        return entities
    }

    private createContext<Local = any>(
        ref: ClientReplicaEntity<Local>,
        options: {
            frame?: Frame
            update?: AppliedEntityChange
            deleted?: DeletedEntity
            closedChannel?: ClosedChannel
            sample?: ClientReplicaSample<Local>
            state?: InterpolatedState | null
            pid?: number
        } = {}
    ): ClientEntityBindingContext<Local> {
        ref.channel = this.getEntityChannel(ref.nid) || ref.channel
        const pid = options.pid ??
            this.client.network.store.ecsComponentParent.get(ref.nid) ??
            (options.deleted?.entity as any)?.pid ??
            (ref.local as any)?.pid
        return {
            replica: this,
            ref,
            nid: ref.nid,
            pid,
            frame: options.frame,
            channel: ref.channel,
            update: options.update,
            deleted: options.deleted,
            closedChannel: options.closedChannel,
            sample: options.sample,
            state: options.state
        }
    }

    private destroyBinding<Local = any>(
        ref: ClientReplicaEntity<Local> | undefined,
        options: {
            frame?: Frame
            deleted?: DeletedEntity
            closedChannel?: ClosedChannel
            sample?: ClientReplicaSample<Local>
            state?: InterpolatedState | null
            force?: boolean
        } = {}
    ) {
        if (!ref) {
            return false
        }
        if (!options.force && ref.mode === ClientEntityMode.Interpolated && !options.sample) {
            return false
        }
        const binding = this.entityBindingsByNid.get(ref.nid)
        if (!binding?.destroy) {
            return false
        }
        binding.destroy(ref.local, this.createContext(ref, options))
        this.entityBindingsByNid.delete(ref.nid)
        return true
    }

    private untrack(nid: number) {
        this.entities.delete(nid)
        this.entityBindingsByNid.delete(nid)
        this.interpolatedVisible.delete(nid)
    }

    private getEntityChannel(nid: number) {
        const channelId = this.client.network.store.getEntityChannelId(nid)
        return channelId === undefined ? null : this.ensureChannel(channelId)
    }

    private getEcsComponentPid(entity: IEntity) {
        return this.client.network.store.ecsComponentParent.get(entity.nid) ?? (entity as any).pid
    }

    private ensureChannel(channelId: number): ClientChannel {
        let channel = this.channels.get(channelId)
        if (!channel) {
            const header = this.client.network.store.getChannelHeaderById(channelId)
            if (!header) {
                throw new Error(`Cannot create client channel ${channelId} without a channel header.`)
            }
            channel = {
                id: channelId,
                open: this.client.network.store.channels.has(channelId),
                header
            }
            this.channels.set(channelId, channel)
        }
        const header = this.client.network.store.getChannelHeaderById(channelId)
        channel.header = header || channel.header
        return channel
    }

    private processInterpolatedMessages(targetFrameTick: number) {
        const messages: any[] = []
        const frames = this.client.network.frames
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i]
            if (frame.tick <= this.lastInterpolatedMessageTick || frame.tick > targetFrameTick) {
                continue
            }
            for (let j = 0; j < frame.interpolatedMessages.length; j++) {
                const message = frame.interpolatedMessages[j]
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
}
