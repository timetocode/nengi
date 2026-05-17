import { IEntity } from '../common/IEntity'
import { binaryGet } from '../common/binary/BinaryExt'
import { Context } from '../common/Context'
import { AppliedEntityChange, DeletedEntity, Frame } from './Frame'
import { Snapshot } from './Snapshot'

function cloneEntity(entity: IEntity): IEntity {
    return Object.assign({}, entity)
}

export class EntityStore {
    context: Context
    entities: Map<number, IEntity> = new Map()
    ntypes: Map<number, number> = new Map()

    constructor(context: Context) {
        this.context = context
    }

    get(nid: number) {
        return this.entities.get(nid)
    }

    getByNType(ntype: number) {
        return Array.from(this.entities.values()).filter(entity => entity.ntype === ntype)
    }

    getWhere(prop: string, value: any) {
        return Array.from(this.entities.values()).filter(entity => entity[prop] === value)
    }

    applySnapshot(snapshot: Snapshot, tick: number) {
        const createEntities: IEntity[] = []
        const updateEntities: AppliedEntityChange[] = []
        const deleteEntities: number[] = []
        const deletedEntities: DeletedEntity[] = []

        snapshot.deleteEntities.forEach(nid => {
            const previous = this.entities.get(nid)
            this.entities.delete(nid)
            this.ntypes.delete(nid)
            deleteEntities.push(nid)
            deletedEntities.push({
                nid,
                entity: previous ? cloneEntity(previous) : undefined
            })
        })

        snapshot.createEntities.forEach(entity => {
            const stored = cloneEntity(entity)
            this.entities.set(stored.nid, stored)
            this.ntypes.set(stored.nid, stored.ntype)
            createEntities.push(cloneEntity(stored))
        })

        snapshot.updateEntities.forEach(update => {
            const entity = this.entities.get(update.nid)
            if (!entity) {
                return
            }
            const nschema = this.context.getSchema(entity.ntype)
            const propData = nschema.props[update.prop]
            const binaryUtil = binaryGet(propData.type)
            const previous = binaryUtil.clone(entity[update.prop])
            const value = binaryUtil.clone(update.value)
            entity[update.prop] = binaryUtil.clone(update.value)
            updateEntities.push({
                nid: update.nid,
                prop: update.prop,
                previous,
                value
            })
        })

        return new Frame({
            tick,
            timestamp: snapshot.timestamp,
            confirmedClientTick: snapshot.confirmedClientTick,
            createEntities,
            updateEntities,
            deleteEntities,
            deletedEntities,
            messages: snapshot.messages.slice()
        })
    }
}
