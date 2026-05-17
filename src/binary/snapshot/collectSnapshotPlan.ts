import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { IEntity } from '../../common/IEntity'
import { EntityChange } from '../../common/binary/schema/util'
import { createEmptySnapshotPlan, SnapshotPlan } from './SnapshotPlan'

const MAX_RESPONSES_PER_FRAME = 255

function collectCreateEntities(instance: Instance, toCreate: number[]): IEntity[] {
    const createEntities: IEntity[] = []

    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema)
            }
            createEntities.push(entity)
        } else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
        }
    }

    return createEntities
}

function collectUpdateEntities(instance: Instance, toUpdate: number[]): EntityChange[] {
    const updateEntities: EntityChange[] = []

    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        const diffs = instance.cache.getAndDiff(instance.tick, entity, nschema)
        for (let j = 0; j < diffs.length; j++) {
            updateEntities.push(diffs[j])
        }
    }

    return updateEntities
}

export function collectSnapshotPlan(user: User, instance: Instance): SnapshotPlan {
    const { toCreate, toUpdate, toDelete } = user.checkVisibility(instance.tick)
    const plan = createEmptySnapshotPlan()

    plan.createEntities = collectCreateEntities(instance, toCreate)
    plan.updateEntities = collectUpdateEntities(instance, toUpdate)
    plan.deleteEntities = toDelete

    plan.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []

    plan.messages = user.messageQueue
    user.messageQueue = []

    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)

    return plan
}

export { MAX_RESPONSES_PER_FRAME }
