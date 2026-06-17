import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { IEntity } from '../../common/IEntity'
import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { EntityChange, EntityUpdateGroup } from '../../common/binary/schema/util'
import { createEmptySnapshotPlan, SnapshotPlan } from './SnapshotPlan'
import { collectInterpolatedBroadcastMessages } from './messageFragments'

const MAX_RESPONSES_PER_FRAME = 255

export function collectSkipInterpolationNids(user: User) {
    const nids: number[] = []
    const seen = new Set<number>()

    for (const channel of user.subscriptions.values()) {
        const skipInterpolationNids = (channel as any).skipInterpolationNids as number[] | undefined
        if (!skipInterpolationNids || skipInterpolationNids.length === 0) {
            continue
        }

        const state = user.getChannelVisibilityState(channel.nid)
        for (let i = 0; i < skipInterpolationNids.length; i++) {
            const nid = skipInterpolationNids[i]
            if (seen.has(nid) || !state.tickLastSeen.has(nid)) {
                continue
            }
            seen.add(nid)
            nids.push(nid)
        }
    }

    return nids
}

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

function collectUpdateEntities(instance: Instance, toUpdate: number[]): { updates: EntityChange[], groups: EntityUpdateGroup[] } {
    const updateEntities: EntityChange[] = []
    const updateEntityGroups: EntityUpdateGroup[] = []

    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema)
        for (let j = 0; j < diffs.groups.length; j++) {
            updateEntityGroups.push(diffs.groups[j])
        }
        for (let j = 0; j < diffs.changes.length; j++) {
            updateEntities.push(diffs.changes[j])
        }
    }

    return { updates: updateEntities, groups: updateEntityGroups }
}

export function collectSnapshotPlan(user: User, instance: Instance): SnapshotPlan {
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkVisibility(instance.tick)
    const plan = createEmptySnapshotPlan()

    const channelOpens = user.consumePendingChannelOpens()
    for (let i = 0; i < channelOpens.length; i++) {
        const channel = user.subscriptions.get(channelOpens[i])
        if (channel) {
            plan.channelOpens.push({ channelId: channel.nid, header: channel.header })
        }
    }

    const channelCloses = user.consumePendingChannelCloses()
    for (let i = 0; i < channelCloses.length; i++) {
        plan.channelCloses.push({ channelId: channelCloses[i] })
    }

    plan.channelEntityCreates = channelEntityCreates
    plan.skipInterpolationNids = collectSkipInterpolationNids(user)

    for (const channel of user.subscriptions.values()) {
        const header = channel.header
        const headerVersion = channel.headerVersion || 0
        if (!hasSchemaBackedChannelHeader(header) || headerVersion <= 0) {
            continue
        }
        const knownVersion = user.knownChannelHeaderVersions.get(channel.nid)
        const nschema = instance.context.getSchema(header.ntype)!
        if (knownVersion === undefined) {
            if (!instance.cache.cacheContains(header.nid)) {
                instance.cache.cacheify(instance.tick, header, nschema)
            }
            plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion })
        } else if (knownVersion < headerVersion) {
            const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema)
            if (diffs.changes.length > 0 || diffs.groups.length > 0) {
                plan.channelHeaderUpdates.push({
                    channelId: channel.nid,
                    changes: diffs.changes,
                    groups: diffs.groups
                })
            }
            plan.channelHeaderVersions.push({ channelId: channel.nid, version: headerVersion })
        }
    }

    plan.createEntities = collectCreateEntities(instance, toCreate)
    const updates = collectUpdateEntities(instance, toUpdate)
    plan.updateEntities = updates.updates
    plan.updateEntityGroups = updates.groups
    plan.deleteEntities = toDelete

    plan.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []

    plan.messages = user.messageQueue
    user.messageQueue = []

    plan.interpolatedMessages = user.interpolatedMessageQueue
    user.interpolatedMessageQueue = []
    plan.interpolatedMessages.push(...collectInterpolatedBroadcastMessages(user))

    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)

    return plan
}

export { MAX_RESPONSES_PER_FRAME }
