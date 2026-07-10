import { IEntity } from '../common/IEntity'
import { Context } from '../common/Context'
import { ChannelHeader, cloneChannelHeader } from '../common/ChannelHeader'
import { ChannelFrame, ClosedChannel, Frame, OpenedChannel } from './Frame'
import { Snapshot } from './Snapshot'
import type { SnapshotChannel } from '../binary/snapshot/SnapshotPlan'
import { getLocalTime } from './time'
import { EntityHistory } from './EntityHistory'

function cloneEntity(entity: IEntity): IEntity {
    return Object.assign({}, entity)
}

type ApplyState = {
    changedNids: Set<number>
}

export class EntityStore {
    context: Context
    entities: Map<number, IEntity> = new Map()
    ntypes: Map<number, number> = new Map()
    channels: Set<number> = new Set()
    channelHeaders: Map<number, ChannelHeader> = new Map()
    entityChannels: Map<number, number> = new Map()
    ecsEntities: Set<number> = new Set()
    ecsComponentsByParent: Map<number, Set<number>> = new Map()
    ecsComponentParent: Map<number, number> = new Map()
    /**
     * Latest authoritative entities live in `entities`; history is only the
     * resolved past states needed by interpolation.
     */
    history: EntityHistory

    constructor(context: Context) {
        this.context = context
        this.history = new EntityHistory(context)
    }

    get(nid: number) {
        return this.entities.get(nid)
    }

    getByNType(ntype: number) {
        return Array.from(this.entities.values()).filter(entity => entity.ntype === ntype)
    }

    getEntityChannelId(nid: number) {
        return this.entityChannels.get(nid)
    }

    getChannelId(nid: number) {
        return this.getEntityChannelId(nid)
    }

    getChannelHeaderById(channelId: number) {
        return this.channelHeaders.get(channelId)
    }

    getEntityChannelHeader(nid: number) {
        const channelId = this.entityChannels.get(nid)
        return channelId === undefined ? undefined : this.channelHeaders.get(channelId)
    }

    getChannelHeader(channelOrEntityNid: number) {
        const entityChannelId = this.entityChannels.get(channelOrEntityNid)
        return this.channelHeaders.get(entityChannelId === undefined ? channelOrEntityNid : entityChannelId)
    }

    getByChannel(channelId: number) {
        return Array.from(this.entityChannels.entries())
            .filter(([, entityChannelId]) => entityChannelId === channelId)
            .map(([nid]) => this.entities.get(nid))
            .filter((entity): entity is IEntity => !!entity)
    }

    getWhere(prop: string, value: any) {
        return Array.from(this.entities.values()).filter(entity => entity[prop] === value)
    }

    applySnapshot(snapshot: Snapshot, tick: number, receivedAtMs = getLocalTime()) {
        this.assertNoTopLevelEntityCrud(snapshot)
        const openedChannels: OpenedChannel[] = []
        const closedChannels: ClosedChannel[] = []
        const channelOpens = snapshot.channelOpens || []
        const channelHeaderUpdates = snapshot.channelHeaderUpdates || []
        const channelCloses = snapshot.channelCloses || []
        const scopedChannels = snapshot.channels || []
        const frameChannels: ChannelFrame[] = scopedChannels.map(channel => ({
            channelId: channel.channelId,
            ecsCreateEntities: [],
            ecsCreateComponents: [],
            ecsDeleteEntities: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: [],
            deletedEntities: [],
            messages: channel.messages.slice(),
            interpolatedMessages: channel.interpolatedMessages.slice()
        }))
        const channelFramesById = new Map<number, ChannelFrame>()
        frameChannels.forEach(channel => channelFramesById.set(channel.channelId, channel))
        const changedNids = new Set<number>()

        channelCloses.forEach(close => {
            const previous = this.requireChannelHeader(close.channelId)
            const entityNids = this.purgeChannel(close.channelId, tick)
            closedChannels.push({
                channelId: close.channelId,
                header: cloneChannelHeader(previous),
                entityNids
            })
            this.channelHeaders.delete(close.channelId)
            this.channels.delete(close.channelId)
        })

        channelOpens.forEach(open => {
            this.channels.add(open.channelId)
            const header = cloneChannelHeader(open.header)
            this.channelHeaders.set(open.channelId, header)
            openedChannels.push({ channelId: open.channelId, header: cloneChannelHeader(header) })
        })

        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.requireChannelHeader(headerUpdate.channelId)
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype)
                const propData = nschema.props[update.prop]
                header[update.prop] = propData.binary.clone(update.value)
            })
        })

        scopedChannels.forEach(channel => {
            const frameChannel = channelFramesById.get(channel.channelId)!
            this.applyChannelSnapshot(channel, frameChannel, tick, {
                changedNids
            })
        })

        changedNids.forEach(nid => {
            const entity = this.entities.get(nid)
            if (entity) {
                this.history.recordState(tick, entity)
            }
        })

        return new Frame({
            tick,
            serverTimeMs: snapshot.serverTimeMs,
            receivedAtMs,
            confirmedCommandFrameNumber: snapshot.confirmedCommandFrameNumber,
            channelOpens,
            channelHeaderUpdates,
            channelCloses,
            skipInterpolationNids: (snapshot.skipInterpolationNids || []).slice(),
            openedChannels,
            closedChannels,
            messages: snapshot.messages.slice(),
            interpolatedMessages: (snapshot.interpolatedMessages || []).slice(),
            channels: frameChannels
        })
    }

    private applyChannelSnapshot(channel: SnapshotChannel, frame: ChannelFrame, tick: number, state: ApplyState) {
        this.requireChannelHeader(channel.channelId)

        channel.ecsCreateEntities.forEach(pid => {
            this.createEcsEntity(channel.channelId, pid, frame)
        })

        channel.ecsCreateComponents.forEach(component => {
            this.createEcsComponent(channel.channelId, component, frame, state)
        })

        channel.createEntities.forEach(entity => {
            this.createEntity(channel.channelId, entity, frame, state)
        })

        channel.updateEntities.forEach(update => {
            this.updateEntity(channel.channelId, update, frame, state)
        })

        channel.deleteEntities.forEach(nid => {
            this.deleteEntity(channel.channelId, nid, frame, state, tick)
        })

        channel.ecsDeleteEntities.forEach(pid => {
            this.deleteEcsEntity(channel.channelId, pid, frame, state, tick)
        })
    }

    private createEcsEntity(channelId: number, pid: number, frame: ChannelFrame) {
        this.assertNidAvailable(pid, channelId)
        this.ecsEntities.add(pid)
        this.entityChannels.set(pid, channelId)
        if (!this.ecsComponentsByParent.has(pid)) {
            this.ecsComponentsByParent.set(pid, new Set())
        }
        frame.ecsCreateEntities.push(pid)
    }

    private createEcsComponent(channelId: number, component: IEntity, frame: ChannelFrame, state: ApplyState) {
        const pid = (component as any).pid
        if (typeof pid !== 'number') {
            throw new Error(`ECS component ${component.nid} is missing pid.`)
        }
        this.assertOwnedByChannel(pid, channelId)
        this.assertNidAvailable(component.nid, channelId)
        const stored = cloneEntity(component)
        this.entities.set(stored.nid, stored)
        this.ntypes.set(stored.nid, stored.ntype)
        this.entityChannels.set(stored.nid, channelId)
        this.ecsComponentParent.set(stored.nid, pid)
        this.ecsComponentsByParent.get(pid)!.add(stored.nid)
        const clone = cloneEntity(stored)
        frame.createEntities.push(clone)
        frame.ecsCreateComponents.push(cloneEntity(stored))
        state.changedNids.add(stored.nid)
    }

    private createEntity(channelId: number, entity: IEntity, frame: ChannelFrame, state: ApplyState) {
        this.assertNidAvailable(entity.nid, channelId)
        const stored = cloneEntity(entity)
        this.entities.set(stored.nid, stored)
        this.ntypes.set(stored.nid, stored.ntype)
        this.entityChannels.set(stored.nid, channelId)
        frame.createEntities.push(cloneEntity(stored))
        state.changedNids.add(stored.nid)
    }

    private updateEntity(channelId: number, update: any, frame: ChannelFrame, state: ApplyState) {
        this.assertOwnedByChannel(update.nid, channelId)
        const entity = this.entities.get(update.nid)
        if (!entity) {
            throw new Error(`Cannot update missing entity nid ${update.nid} in channel ${channelId}.`)
        }
        const nschema = this.context.getSchema(entity.ntype)
        const propData = nschema.props[update.prop]
        const previous = propData.binary.clone(entity[update.prop])
        const value = propData.binary.clone(update.value)
        if (propData.binary.compare(previous, value)) {
            return
        }
        entity[update.prop] = propData.binary.clone(update.value)
        const applied = {
            nid: update.nid,
            prop: update.prop,
            previous,
            value
        }
        frame.updateEntities.push(applied)
        state.changedNids.add(update.nid)
    }

    private deleteEntity(channelId: number, nid: number, frame: ChannelFrame, state: ApplyState, tick: number) {
        this.assertOwnedByChannel(nid, channelId)
        const previous = this.entities.get(nid)
        if (!previous) {
            throw new Error(`Cannot delete missing entity nid ${nid} in channel ${channelId}.`)
        }
        this.entities.delete(nid)
        this.ntypes.delete(nid)
        this.entityChannels.delete(nid)
        const pid = this.ecsComponentParent.get(nid)
        if (pid !== undefined) {
            this.ecsComponentParent.delete(nid)
            this.ecsComponentsByParent.get(pid)?.delete(nid)
        }
        const deleted = {
            nid,
            entity: cloneEntity(previous),
            channelId
        }
        frame.deleteEntities.push(nid)
        frame.deletedEntities.push(deleted)
        this.history.recordDelete(tick, nid)
    }

    private deleteEcsEntity(channelId: number, pid: number, frame: ChannelFrame, state: ApplyState, tick: number) {
        this.assertOwnedByChannel(pid, channelId)
        const components = Array.from(this.ecsComponentsByParent.get(pid) || [])
        for (let i = 0; i < components.length; i++) {
            const componentNid = components[i]
            if (this.entities.has(componentNid)) {
                this.deleteEntity(channelId, componentNid, frame, state, tick)
            }
        }
        this.ecsComponentsByParent.delete(pid)
        this.ecsEntities.delete(pid)
        this.entityChannels.delete(pid)
        frame.ecsDeleteEntities.push(pid)
        this.history.recordDelete(tick, pid)
    }

    private assertNoTopLevelEntityCrud(snapshot: Snapshot) {
        const hasTopLevelCrud =
            snapshot.createEntities.length > 0 ||
            snapshot.updateEntities.length > 0 ||
            snapshot.deleteEntities.length > 0 ||
            (snapshot.ecsCreateEntities?.length || 0) > 0 ||
            (snapshot.ecsCreateComponents?.length || 0) > 0 ||
            (snapshot.ecsDeleteEntities?.length || 0) > 0

        if (hasTopLevelCrud) {
            throw new Error('EntityStore requires channel-scoped entity CRUD.')
        }
    }

    private requireChannelHeader(channelId: number) {
        const header = this.channelHeaders.get(channelId)
        if (!header) {
            throw new Error(`Missing channel ${channelId}.`)
        }
        return header
    }

    private assertNidAvailable(nid: number, channelId: number) {
        const existingChannelId = this.entityChannels.get(nid)
        if (existingChannelId !== undefined) {
            throw new Error(`Nid ${nid} already belongs to channel ${existingChannelId}, cannot create in channel ${channelId}.`)
        }
    }

    private assertOwnedByChannel(nid: number, channelId: number) {
        const existingChannelId = this.entityChannels.get(nid)
        if (existingChannelId !== channelId) {
            throw new Error(`Nid ${nid} belongs to channel ${existingChannelId ?? 'none'}, not channel ${channelId}.`)
        }
    }

    private purgeChannel(channelId: number, tick: number) {
        const purged: number[] = []
        const entries = Array.from(this.entityChannels.entries())
        for (let i = 0; i < entries.length; i++) {
            const [nid, entityChannelId] = entries[i]
            if (entityChannelId !== channelId) {
                continue
            }
            if (this.entityChannels.get(nid) !== channelId) {
                continue
            }
            purged.push(nid)
            this.entityChannels.delete(nid)
            this.ntypes.delete(nid)
            this.entities.delete(nid)
            this.ecsEntities.delete(nid)
            const pid = this.ecsComponentParent.get(nid)
            if (pid !== undefined) {
                this.ecsComponentParent.delete(nid)
                this.ecsComponentsByParent.get(pid)?.delete(nid)
            }
            const components = this.ecsComponentsByParent.get(nid)
            if (components) {
                components.forEach(componentNid => {
                    this.entityChannels.delete(componentNid)
                    this.ntypes.delete(componentNid)
                    this.entities.delete(componentNid)
                    this.ecsComponentParent.delete(componentNid)
                    purged.push(componentNid)
                    this.history.recordDelete(tick, componentNid)
                })
                this.ecsComponentsByParent.delete(nid)
            }
            this.history.recordDelete(tick, nid)
        }
        return purged
    }
}
