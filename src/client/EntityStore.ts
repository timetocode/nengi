import { IEntity } from '../common/IEntity'
import { Context } from '../common/Context'
import { AppliedEntityChange, ClosedChannel, DeletedEntity, Frame } from './Frame'
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
    channelHeaders: Map<number, IEntity> = new Map()
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

    getChannelId(nid: number) {
        return this.entityChannels.get(nid)
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
        const closedChannels: ClosedChannel[] = []
        const ecsCreateEntities: number[] = []
        const ecsCreateComponents: IEntity[] = []
        const ecsDeleteEntities: number[] = []
        const channelEntityCreates = (snapshot.channelEntityCreates || []).slice()
        const channelHeaderCreates = (snapshot.channelHeaderCreates || []).slice()
        const channelHeaderUpdates = (snapshot.channelHeaderUpdates || []).slice()
        const channelHeaderDeletes = (snapshot.channelHeaderDeletes || []).slice()
        const changedNids = new Set<number>()
        const snapshotDeleteNids = new Set(snapshot.deleteEntities)

        channelHeaderDeletes.forEach(headerDelete => {
            const previous = this.channelHeaders.get(headerDelete.channelId)
            if (previous) {
                headerDelete.header = cloneEntity(previous)
            }
            const entityNids = this.purgeChannel(headerDelete.channelId, tick)
            closedChannels.push({
                channelId: headerDelete.channelId,
                header: previous ? cloneEntity(previous) : undefined,
                entityNids
            })
            this.channelHeaders.delete(headerDelete.channelId)
        })

        channelHeaderCreates.forEach(headerCreate => {
            this.channelHeaders.set(headerCreate.channelId, cloneEntity(headerCreate.header))
        })

        channelHeaderUpdates.forEach(headerUpdate => {
            const header = this.channelHeaders.get(headerUpdate.channelId)
            if (!header) {
                return
            }
            headerUpdate.changes.forEach(update => {
                const nschema = this.context.getSchema(header.ntype)
                const propData = nschema.props[update.prop]
                header[update.prop] = propData.binary.clone(update.value)
            })
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
            changedNids.add(stored.nid)
        })

        snapshot.createEntities.forEach(entity => {
            const stored = cloneEntity(entity)
            this.entities.set(stored.nid, stored)
            this.ntypes.set(stored.nid, stored.ntype)
            createEntities.push(cloneEntity(stored))
            changedNids.add(stored.nid)
        })

        channelEntityCreates.forEach(create => {
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
            changedNids.add(update.nid)
        })

        changedNids.forEach(nid => {
            const entity = this.entities.get(nid)
            if (entity) {
                this.history.recordState(tick, entity)
            }
        })

        return new Frame({
            tick,
            timestamp: snapshot.timestamp,
            receivedAt,
            confirmedClientTick: snapshot.confirmedClientTick,
            ecsCreateEntities,
            ecsCreateComponents,
            ecsDeleteEntities,
            channelEntityCreates,
            channelHeaderCreates,
            channelHeaderUpdates,
            channelHeaderDeletes,
            closedChannels,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice()
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
