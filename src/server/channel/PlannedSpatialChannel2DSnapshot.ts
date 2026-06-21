import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { Instance } from '../Instance'
import { User } from '../User'
import { collectSkipInterpolationNids, MAX_RESPONSES_PER_FRAME } from '../../binary/snapshot/collectSnapshotPlan'
import { commitSnapshotPlan } from '../../binary/snapshot/commitSnapshotPlan'
import { countSnapshotBytes } from '../../binary/snapshot/countSnapshotBytes'
import { writeSnapshot } from '../../binary/snapshot/writeSnapshot'
import { createEmptySnapshotPlan, SnapshotPlan } from '../../binary/snapshot/SnapshotPlan'
import {
    createSnapshotPlanChunk,
    sumSnapshotChunkBytes,
    writeSnapshotChunks
} from '../../binary/snapshot/SnapshotChunk'
import { createChannelScopeChunk, createPayloadCopyChunk } from '../../binary/snapshot/snapshotChunkBuilders'
import { addRegularCreate, addRegularUpdate } from '../../binary/snapshot/entitySnapshotPlans'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import {
    countPlanMessages,
    sumPlanGroupedUpdateProps
} from '../../binary/snapshot/snapshotPlanStats'
import {
    PlannedSpatialChannel2D,
    PlannedSpatialUserSnapshot,
    PlannedSpatialVisibilityGroup
} from './PlannedSpatialChannel2D'

function hasSnapshotPlanContent(plan: SnapshotPlan) {
    return plan.channelOpens.length > 0 ||
        plan.channelHeaderUpdates.length > 0 ||
        plan.channelCloses.length > 0 ||
        plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.engineMessages.length > 0 ||
        plan.messages.length > 0 ||
        plan.interpolatedMessages.length > 0 ||
        plan.responses.length > 0
}

function collectEnvelopePlan(user: User) {
    const plan = createEmptySnapshotPlan()
    const queuedResponses = user.responseQueue.length
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
    plan.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    plan.skipInterpolationNids = collectSkipInterpolationNids(user)
    plan.messages = user.messageQueue
    user.messageQueue = []
    plan.interpolatedMessages = user.interpolatedMessageQueue
    user.interpolatedMessageQueue = []
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    return { plan, queuedResponses }
}

function addChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: PlannedSpatialChannel2D) {
    const header = channel.header
    const headerVersion = channel.headerVersion || 0
    if (!hasSchemaBackedChannelHeader(header) || headerVersion <= 0) {
        return
    }

    const knownVersion = user.knownChannelHeaderVersions.get(channel.nid)
    const nschema = instance.context.getSchema(header.ntype)!
    if (!nschema) {
        throw new Error(`Channel header [nid ${header.nid}] [ntype ${header.ntype}] is missing a network schema.`)
    }

    if (knownVersion === undefined) {
        if (!instance.cache.cacheContains(header.nid)) {
            instance.cache.cacheify(instance.tick, header, nschema)
        }
        plan.channelHeaderVersions.push({
            channelId: channel.nid,
            version: headerVersion
        })
        return
    }

    if (knownVersion >= headerVersion) {
        return
    }

    const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema)
    if (diffs.changes.length > 0 || diffs.groups.length > 0) {
        plan.channelHeaderUpdates.push({
            channelId: channel.nid,
            changes: diffs.changes,
            groups: diffs.groups
        })
    }
    plan.channelHeaderVersions.push({
        channelId: channel.nid,
        version: headerVersion
    })
}

export function isPlannedSpatialChannel2D(channel: any): channel is PlannedSpatialChannel2D {
    return channel?.plannedSpatialChannelMode === true &&
        typeof channel.nid === 'number' &&
        typeof channel.prepareVisibilityPlan === 'function' &&
        typeof channel.getPlannedSnapshot === 'function'
}

export function getSinglePlannedSpatialChannel2D(user: User) {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isPlannedSpatialChannel2D(channel) ? channel : null
}

function addPlannedSpatialUpdates(plan: SnapshotPlan, instance: Instance, toUpdate: number[]) {
    for (let i = 0; i < toUpdate.length; i++) {
        addRegularUpdate(plan, instance, toUpdate[i])
    }
}

function collectPlannedSpatialChannelPlan(
    user: User,
    instance: Instance,
    channel: PlannedSpatialChannel2D,
    snapshot: PlannedSpatialUserSnapshot
) {
    const plan = createEmptySnapshotPlan()
    addChannelHeader(plan, user, instance, channel)
    for (let i = 0; i < snapshot.toCreate.length; i++) {
        addRegularCreate(plan, instance, snapshot.toCreate[i])
    }
    plan.deleteEntities = snapshot.toDelete
    addChannelMessages(plan, user, channel, true)
    return plan
}

function canUseSharedGroupUpdateFragment(
    instance: Instance,
    group: PlannedSpatialVisibilityGroup,
    snapshot: PlannedSpatialUserSnapshot
) {
    return instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        group.users.length > 1 &&
        snapshot.toCreate.length === 0 &&
        snapshot.toDelete.length === 0 &&
        snapshot.toUpdate.length > 0
}

function getPlannedSpatialUpdateFragment(
    user: User,
    instance: Instance,
    group: PlannedSpatialVisibilityGroup,
    toUpdate: number[]
) {
    if (group.sharedUpdateFragment) {
        instance.network.recordSharedFragmentHit()
        return group.sharedUpdateFragment
    }

    const protocol = instance.network.getProtocol()
    const measure = instance.network.snapshotPerformanceEnabled
    let collectStart = 0
    let collectMs = 0
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0

    if (measure) {
        collectStart = performance.now()
    }
    const plan = createEmptySnapshotPlan()
    addPlannedSpatialUpdates(plan, instance, toUpdate)
    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }
    const bytes = countSnapshotBytes(plan, instance.context, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeSnapshot(plan, instance.context, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    group.sharedUpdateFragment = {
        payload: writer.payload,
        bytes,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedUpdateProps: sumPlanGroupedUpdateProps([{ plan }])
    }
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return group.sharedUpdateFragment
}

function createPlannedSpatialChannel2DSnapshotBufferInner(user: User, instance: Instance, channel: PlannedSpatialChannel2D) {
    const measure = instance.network.snapshotPerformanceEnabled
    let collectStart = 0
    let collectMs = 0
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0
    let commitStart = 0
    let commitMs = 0

    if (measure) {
        collectStart = performance.now()
    }

    instance.network.queueProtocolIfChanged(user)
    const protocol = instance.network.getProtocol()
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user)
    const snapshot = channel.getPlannedSnapshot(user, instance.tick)
    if (!snapshot) {
        throw new Error(`PlannedSpatialChannel2D missing snapshot state for user ${user.id}.`)
    }
    const channelPlan = collectPlannedSpatialChannelPlan(user, instance, channel, snapshot)
    const sharedUpdateFragment = canUseSharedGroupUpdateFragment(instance, snapshot.group, snapshot)
        ? getPlannedSpatialUpdateFragment(user, instance, snapshot.group, snapshot.toUpdate)
        : null
    if (!sharedUpdateFragment) {
        addPlannedSpatialUpdates(channelPlan, instance, snapshot.toUpdate)
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks = [
        createSnapshotPlanChunk('PlannedSpatialEnvelope', envelope, instance.context, protocol)
    ]
    if (hasSnapshotPlanContent(channelPlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('PlannedSpatialChannelPlan', channelPlan, instance.context, protocol))
    }
    if (sharedUpdateFragment) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createPayloadCopyChunk(
            'PlannedSpatialUpdateFragment',
            instance,
            sharedUpdateFragment.payload,
            sharedUpdateFragment.bytes
        ))
    }
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer, {
        debug: instance.network.debugBinaryWrites,
        createWriter: byteLength => user.networkAdapter.binary.createWriter(byteLength)
    })

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, envelope)
    commitSnapshotPlan(user, channelPlan)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        if (sharedUpdateFragment) {
            instance.network.recordSharedSnapshot()
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: channelPlan.createEntities.length,
            updateProps: channelPlan.updateEntities.length + (sharedUpdateFragment?.updateProps || 0),
            updateGroups: channelPlan.updateEntityGroups.length + (sharedUpdateFragment?.updateGroups || 0),
            groupedUpdateProps: sumPlanGroupedUpdateProps([{ plan: channelPlan }]) + (sharedUpdateFragment?.groupedUpdateProps || 0),
            deletes: channelPlan.deleteEntities.length,
            messages: countPlanMessages(envelope) + countPlanMessages(channelPlan),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

export function createPlannedSpatialChannel2DSnapshotBuffer(user: User, instance: Instance, channel: PlannedSpatialChannel2D) {
    return createPlannedSpatialChannel2DSnapshotBufferInner(user, instance, channel)
}
