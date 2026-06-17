import { IEntity } from '../common/IEntity'
import { Context } from '../common/Context'
import { ChannelHeader, cloneChannelHeader } from '../common/ChannelHeader'
import { AppliedEntityChange, ChannelFrame, ClosedChannel, DeletedEntity, Frame, OpenedChannel } from './Frame'
import { Snapshot } from './Snapshot'
import { getLocalTime } from './time'
import { EntityHistory } from './EntityHistory'

function cloneEntity(entity: IEntity): IEntity {
    return Object.assign({}, entity)
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

    applySnapshot(snapshot: Snapshot, tick: number, receivedAt = getLocalTime()) {
        const createEntities: IEntity[] = []
        const updateEntities: AppliedEntityChange[] = []
        const deleteEntities: number[] = []
        const deletedEntities: DeletedEntity[] = []
        const openedChannels: OpenedChannel[] = []
        const closedChannels: ClosedChannel[] = []
        const ecsCreateEntities: number[] = []
        const ecsCreateComponents: IEntity[] = []
        const ecsDeleteEntities: number[] = []
        const channelOpens = snapshot.channelOpens || []
        const channelEntityCreates = snapshot.channelEntityCreates || []
        const channelHeaderUpdates = snapshot.channelHeaderUpdates || []
        const channelCloses = snapshot.channelCloses || []
        const scopedChannels = snapshot.channels || []
        const frameChannels: ChannelFrame[] = scopedChannels.map(channel => ({
            channelId: channel.channelId,
            ecsCreateEntities: channel.ecsCreateEntities.slice(),
            ecsCreateComponents: [],
            ecsDeleteEntities: channel.ecsDeleteEntities.slice(),
            createEntities: [],
            updateEntities: [],
            deleteEntities: [],
            deletedEntities: [],
            messages: channel.messages.slice(),
            interpolatedMessages: channel.interpolatedMessages.slice()
        }))
        const channelFramesById = new Map<number, ChannelFrame>()
        frameChannels.forEach(channel => channelFramesById.set(channel.channelId, channel))
        scopedChannels.forEach(channel => {
            snapshot.messages.push(...channel.messages)
            snapshot.interpolatedMessages?.push(...channel.interpolatedMessages)
            snapshot.ecsCreateEntities?.push(...channel.ecsCreateEntities)
            snapshot.ecsCreateComponents?.push(...channel.ecsCreateComponents)
            snapshot.ecsDeleteEntities?.push(...channel.ecsDeleteEntities)
            snapshot.createEntities.push(...channel.createEntities)
            snapshot.updateEntities.push(...channel.updateEntities)
            snapshot.deleteEntities.push(...channel.deleteEntities)
            channel.ecsCreateEntities.forEach(nid => channelEntityCreates.push({ nid, channelId: channel.channelId }))
            channel.ecsCreateComponents.forEach(component => channelEntityCreates.push({ nid: component.nid, channelId: channel.channelId }))
            channel.createEntities.forEach(entity => channelEntityCreates.push({ nid: entity.nid, channelId: channel.channelId }))
        })
        const changedNids = new Set<number>()
        const snapshotDeleteNids = new Set(snapshot.deleteEntities)
        const scopedCreateNidsByChannel = new Map<number, Set<number>>()
        const scopedUpdateNidsByChannel = new Map<number, Set<number>>()
        const scopedDeleteNidsByChannel = new Map<number, Set<number>>()
        scopedChannels.forEach(channel => {
            scopedCreateNidsByChannel.set(channel.channelId, new Set([
                ...channel.createEntities.map(entity => entity.nid),
                ...channel.ecsCreateComponents.map(component => component.nid)
            ]))
            scopedUpdateNidsByChannel.set(channel.channelId, new Set(channel.updateEntities.map(update => update.nid)))
            scopedDeleteNidsByChannel.set(channel.channelId, new Set([
                ...channel.deleteEntities,
                ...channel.ecsDeleteEntities
            ]))
        })

        channelOpens.forEach(open => {
            this.channels.add(open.channelId)
            const header = cloneChannelHeader(open.header)
            this.channelHeaders.set(open.channelId, header)
            openedChannels.push({ channelId: open.channelId, header: cloneChannelHeader(header) })
        })

        channelCloses.forEach(close => {
            const previous = this.channelHeaders.get(close.channelId)
            // Channel close sends only the channel id. The client already knows
            // which local nids arrived through that channel, so it derives the
            // purged list without paying for per-entity deletes on the wire.
            const entityNids = this.purgeChannel(close.channelId, tick)
            closedChannels.push({
                channelId: close.channelId,
                header: cloneChannelHeader(previous!),
                entityNids
            })
            this.channelHeaders.delete(close.channelId)
            this.channels.delete(close.channelId)
        })

        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.channelHeaders.get(headerUpdate.channelId)!
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype)
                const propData = nschema.props[update.prop]
                header[update.prop] = propData.binary.clone(update.value)
            })
        })

        channelEntityCreates.forEach(create => {
            this.channels.add(create.channelId)
            this.entityChannels.set(create.nid, create.channelId)
        })

        ;(snapshot.ecsDeleteEntities || []).forEach(pid => {
            const components = this.ecsComponentsByParent.get(pid)
            if (components) {
                components.forEach(nid => {
                    if (snapshotDeleteNids.has(nid)) {
                        return
                    }
                    const previous = this.entities.get(nid)
                    const channelId = this.entityChannels.get(nid)
                    this.entities.delete(nid)
                    this.ntypes.delete(nid)
                    this.entityChannels.delete(nid)
                    this.ecsComponentParent.delete(nid)
                    deleteEntities.push(nid)
                    deletedEntities.push({
                        nid,
                        entity: previous ? cloneEntity(previous) : undefined,
                        channelId
                    })
                    this.history.recordDelete(tick, nid)
                })
            }
            this.ecsComponentsByParent.delete(pid)
            this.ecsEntities.delete(pid)
            this.entityChannels.delete(pid)
            ecsDeleteEntities.push(pid)
        })

        snapshot.deleteEntities.forEach(nid => {
            const previous = this.entities.get(nid)
            const channelId = this.entityChannels.get(nid)
            this.entities.delete(nid)
            this.ntypes.delete(nid)
            this.entityChannels.delete(nid)
            const pid = this.ecsComponentParent.get(nid)
            if (pid !== undefined) {
                this.ecsComponentParent.delete(nid)
                this.ecsComponentsByParent.get(pid)?.delete(nid)
            }
            deleteEntities.push(nid)
            deletedEntities.push({
                nid,
                entity: previous ? cloneEntity(previous) : undefined,
                channelId
            })
            this.history.recordDelete(tick, nid)
        })

        ;(snapshot.ecsCreateEntities || []).forEach(pid => {
            this.ecsEntities.add(pid)
            if (!this.ecsComponentsByParent.has(pid)) {
                this.ecsComponentsByParent.set(pid, new Set())
            }
            ecsCreateEntities.push(pid)
        })

        ;(snapshot.ecsCreateComponents || []).forEach(component => {
            const stored = cloneEntity(component)
            const pid = (stored as any).pid
            this.entities.set(stored.nid, stored)
            this.ntypes.set(stored.nid, stored.ntype)
            this.ecsComponentParent.set(stored.nid, pid)
            if (!this.ecsComponentsByParent.has(pid)) {
                this.ecsComponentsByParent.set(pid, new Set())
            }
            this.ecsComponentsByParent.get(pid)!.add(stored.nid)
            createEntities.push(cloneEntity(stored))
            ecsCreateComponents.push(cloneEntity(stored))
            const channelId = this.entityChannels.get(stored.nid)
            if (channelId !== undefined && scopedCreateNidsByChannel.get(channelId)?.has(stored.nid)) {
                channelFramesById.get(channelId)?.ecsCreateComponents.push(cloneEntity(stored))
                channelFramesById.get(channelId)?.createEntities.push(cloneEntity(stored))
            }
            changedNids.add(stored.nid)
        })

        snapshot.createEntities.forEach(entity => {
            const stored = cloneEntity(entity)
            this.entities.set(stored.nid, stored)
            this.ntypes.set(stored.nid, stored.ntype)
            createEntities.push(cloneEntity(stored))
            const channelId = this.entityChannels.get(stored.nid)
            if (channelId !== undefined && scopedCreateNidsByChannel.get(channelId)?.has(stored.nid)) {
                channelFramesById.get(channelId)?.createEntities.push(cloneEntity(stored))
            }
            changedNids.add(stored.nid)
        })

        channelEntityCreates.forEach(create => {
            this.channels.add(create.channelId)
            this.entityChannels.set(create.nid, create.channelId)
        })

        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid)
            if (!entity) {
                return
            }
            const nschema = this.context.getSchema(entity.ntype)
            const propData = nschema.props[update.prop]
            const previous = propData.binary.clone(entity[update.prop])
            const value = propData.binary.clone(update.value)
            if (propData.binary.compare(previous, value)) {
                return
            }
            entity[update.prop] = propData.binary.clone(update.value)
            updateEntities.push({
                nid: update.nid,
                prop: update.prop,
                previous,
                value
            })
            const channelId = this.entityChannels.get(update.nid)
            if (channelId !== undefined && scopedUpdateNidsByChannel.get(channelId)?.has(update.nid)) {
                channelFramesById.get(channelId)?.updateEntities.push({
                    nid: update.nid,
                    prop: update.prop,
                    previous,
                    value
                })
            }
            changedNids.add(update.nid)
        })

        deletedEntities.forEach(deleted => {
            const channelId = deleted.channelId
            if (channelId !== undefined && scopedDeleteNidsByChannel.get(channelId)?.has(deleted.nid)) {
                const channelFrame = channelFramesById.get(channelId)
                if (channelFrame) {
                    channelFrame.deleteEntities.push(deleted.nid)
                    channelFrame.deletedEntities.push(deleted)
                }
            }
        })

        changedNids.forEach(nid => {
            const entity = this.entities.get(nid)
            if (entity) {
                this.history.recordState(tick, entity)
            }
        })

        const dedupedChannelEntityCreates: typeof channelEntityCreates = []
        const seenChannelEntityCreates = new Set<string>()
        channelEntityCreates.forEach(create => {
            const key = `${create.channelId}:${create.nid}`
            if (seenChannelEntityCreates.has(key)) {
                return
            }
            seenChannelEntityCreates.add(key)
            dedupedChannelEntityCreates.push(create)
        })

        return new Frame({
            tick,
            timestamp: snapshot.timestamp,
            receivedAt,
            confirmedClientTick: snapshot.confirmedClientTick,
            ecsCreateEntities,
            ecsCreateComponents,
            ecsDeleteEntities,
            channelOpens,
            channelEntityCreates: dedupedChannelEntityCreates,
            channelHeaderUpdates,
            channelCloses,
            skipInterpolationNids: (snapshot.skipInterpolationNids || []).slice(),
            openedChannels,
            closedChannels,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice(),
            interpolatedMessages: (snapshot.interpolatedMessages || []).slice(),
            channels: frameChannels
        })
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
