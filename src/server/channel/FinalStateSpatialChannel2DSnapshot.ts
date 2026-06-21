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
import { FinalStateSpatialChannel2D } from './FinalStateSpatialChannel2D'

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

function addChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: FinalStateSpatialChannel2D) {
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

export function isFinalStateSpatialChannel2D(channel: any): channel is FinalStateSpatialChannel2D {
    return channel?.finalStateSpatialChannelMode === true &&
        typeof channel.nid === 'number' &&
        typeof channel.getVisibleNetworkedNids === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.updateEntity === 'function'
}

export function getSingleFinalStateSpatialChannel2D(user: User) {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isFinalStateSpatialChannel2D(channel) ? channel : null
}

function addFinalStateSpatialUpdates(plan: SnapshotPlan, instance: Instance, toUpdate: number[]) {
    for (let i = 0; i < toUpdate.length; i++) {
        addRegularUpdate(plan, instance, toUpdate[i])
    }
}

export function collectFinalStateSpatialChannel2DPlan(user: User, instance: Instance, channel: FinalStateSpatialChannel2D) {
    const { toCreate, toUpdate, toDelete } = user.checkChannelVisibility(channel, instance.tick)
    const plan = createEmptySnapshotPlan()

    addChannelHeader(plan, user, instance, channel)
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i])
    }
    plan.deleteEntities = toDelete
    addChannelMessages(plan, user, channel, true)
    return { plan, toCreate, toUpdate, toDelete }
}

function canUseSharedUpdateFragment(
    user: User,
    instance: Instance,
    channel: FinalStateSpatialChannel2D,
    toCreate: number[],
    toUpdate: number[],
    toDelete: number[]
) {
    if (!instance.network.sharedUpdateFragmentsEnabled ||
        instance.network.debugBinaryWrites ||
        toCreate.length > 0 ||
        toDelete.length > 0 ||
        toUpdate.length === 0
    ) {
        return false
    }

    const visibleCellKeys = channel.getVisibleCellKeys(user.id)
    return visibleCellKeys.length === 1
}

function getFinalStateSpatialUpdateFragment(user: User, instance: Instance, channel: FinalStateSpatialChannel2D, toUpdate: number[]) {
    const protocol = instance.network.getProtocol()
    const visibleSignature = channel.getVisibleNetworkedNidSignature(user.id)
    const key = [
        instance.tick,
        channel.nid,
        'final-state-spatial:update',
        channel.localState.entityTreeVersion,
        visibleSignature,
        protocol.nidType,
        protocol.ntypeType
    ].join(':')
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached
    }

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
    addFinalStateSpatialUpdates(plan, instance, toUpdate)
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

    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedUpdateProps: sumPlanGroupedUpdateProps([{ plan }])
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

function createFinalStateSpatialChannel2DSnapshotBufferInner(user: User, instance: Instance, channel: FinalStateSpatialChannel2D) {
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
    const collected = collectFinalStateSpatialChannel2DPlan(user, instance, channel)
    const channelPlan = collected.plan
    const sharedUpdateFragment = canUseSharedUpdateFragment(
        user,
        instance,
        channel,
        collected.toCreate,
        collected.toUpdate,
        collected.toDelete
    )
        ? getFinalStateSpatialUpdateFragment(user, instance, channel, collected.toUpdate)
        : null
    if (!sharedUpdateFragment) {
        addFinalStateSpatialUpdates(channelPlan, instance, collected.toUpdate)
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks = [
        createSnapshotPlanChunk('FinalStateSpatialEnvelope', envelope, instance.context, protocol)
    ]
    if (hasSnapshotPlanContent(channelPlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('FinalStateSpatialChannelPlan', channelPlan, instance.context, protocol))
    }
    if (sharedUpdateFragment) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createPayloadCopyChunk(
            'FinalStateSpatialUpdateFragment',
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

export function createFinalStateSpatialChannel2DSnapshotBuffer(user: User, instance: Instance, channel: FinalStateSpatialChannel2D) {
    return user.withChannelVisibilityState(channel.nid, () =>
        createFinalStateSpatialChannel2DSnapshotBufferInner(user, instance, channel)
    )
}
