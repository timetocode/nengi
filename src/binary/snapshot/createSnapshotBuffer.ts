import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { IChannel } from '../../server/channel/IChannel'
import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { collectSkipInterpolationNids, collectSnapshotPlan, MAX_RESPONSES_PER_FRAME } from './collectSnapshotPlan'
import { commitSnapshotPlan } from './commitSnapshotPlan'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot } from './writeSnapshot'
import { createEmptySnapshotPlan, SnapshotPlan } from './SnapshotPlan'
import {
    createSnapshotChunk,
    createSnapshotPlanChunk,
    SnapshotChunk,
    sumSnapshotChunkBytes,
    writeSnapshotChunks
} from './SnapshotChunk'
import {
    countEcsManualUpdateBytes,
    countManualGroupedProps,
    countManualUpdateBytes,
    EcsManualUpdateLog,
    getManualUpdateFragment,
    ManualUpdateFragment,
    writeEcsManualUpdates,
    writeManualUpdates
} from './manualUpdates'
import {
    CellFragmentChannel,
    EcsSnapshotChannel,
    EcsSpatialSnapshotChannel,
    getSingleCellFragmentChannel,
    getSingleEcsSnapshotChannel,
    getSingleEcsSpatialSnapshotChannel,
    getSingleManualUpdateChannel,
    getSingleSharedChannel,
    isEcsSnapshotChannel,
    isCellFragmentChannel,
    isManualUpdateChannel,
    isManualSpatialCellFragmentChannel,
    ManualSpatialCellFragmentChannel,
    ManualUpdateChannel,
    SharedUpdateChannel
} from './channelModes'
import {
    getSharedMessageFragments,
    sumSharedMessageFragmentBytes,
    sumSharedMessageFragmentMessages,
    writeSharedMessageFragments
} from './messageFragments'
import { addEcsVisibilityCrud } from './ecsSnapshotCrud'
import {
    countPlanMessages,
    sumPlanCreates,
    sumPlanDeletes,
    sumPlanGroupedUpdateProps,
    sumPlanMessages,
    sumPlanUpdateGroups,
    sumPlanUpdateProps
} from './snapshotPlanStats'
import {
    CellEntityFragment,
    sumCellFragmentCreates,
    sumCellFragmentDeletes,
    sumCellFragmentGroupedProps,
    sumCellFragmentUpdateGroups,
    sumCellFragmentUpdateProps
} from './cellEntityFragments'
import {
    createCellFragmentChunk,
    createChannelScopeChunk,
    createPayloadCopyChunk,
    createProtocolPreludeChunk,
    createSharedMessageFragmentChunk
} from './snapshotChunkBuilders'
import { addChannelMessages } from './channelMessages'
import {
    addRegularCreate,
    addRegularUpdate,
    collectCreateEntitiesForRoots
} from './entitySnapshotPlans'
import { writePayload } from './snapshotPayload'
import { ProtocolConfig } from '../../common/binary/Protocol'
import {
    applyCellEntityFragmentsToUser,
    cellMayHaveUpdates,
    getCellCreateFragment,
    getCellDeleteFragment,
    getCellUpdateFragment,
    getManualSpatialCellUpdateFragment
} from './cellFragmentBuilders'
import {
    applySharedChannelDeltasToUser,
    canUseSharedDeltaFragments,
    countEntityDeltaFragmentBytes,
    countEntityDeltaFragmentCreates,
    countEntityDeltaFragmentDeletes,
    getEntityDeltaFragments,
    getSharedUpdateFragment,
    writeEntityDeltaFragments
} from './sharedEntityFragments'

function collectEnvelopePlan(user: User) {
    const plan = createEmptySnapshotPlan()
    const queuedResponses = user.responseQueue.length
    addEnvelopeQueues(plan, user)
    return { plan, queuedResponses }
}

function addEnvelopeQueues(plan: SnapshotPlan, user: User) {
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
}

function protocolWillChange(user: User, instance: Instance) {
    const protocol = instance.network.getProtocol()
    return user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType
}

function canUseSharedUpdateFragment(user: User, channel: SharedUpdateChannel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.membershipVersion &&
        user.currentlyVisible.length === countChannelVisibleEntities(user.instance!, channel)
}

function channelHasHeaderPending(user: User, channel: { nid: number, header: any, headerVersion?: number }) {
    const header = channel.header
    const headerVersion = channel.headerVersion || 0
    if (!header || !hasSchemaBackedChannelHeader(header) || headerVersion <= 0) {
        return false
    }
    return user.knownChannelHeaderVersions.get(channel.nid) !== headerVersion
}

function canUseCellFragments(channel: CellFragmentChannel, userId: number) {
    const stableKeys = channel.getStableVisibleCellKeys(userId)
    if (stableKeys) {
        return stableKeys.length <= channel.stableFragmentCellLimit
    }
    return channel.getVisibleCellKeys(userId).length <= channel.fragmentCellLimit
}

function hasChannelDeltas(channel: SharedUpdateChannel) {
    return channel.deltaBaseVersion !== channel.membershipVersion
}

function rememberCellFragmentChannelVisibility(user: User) {
    for (const channel of user.subscriptions.values()) {
        if (isCellFragmentChannel(channel)) {
            channel.rememberVisibleCells(user.id)
        }
    }
}

function rememberSharedChannelVersion(user: User) {
    const channel = getSingleSharedChannel(user)
    if (!channel) {
        return
    }
    if (user.currentlyVisible.length === countChannelVisibleEntities(user.instance!, channel)) {
        user.sharedChannelVersions.set(channel.nid, channel.membershipVersion)
    }
}

function countEntityWithChildren(instance: Instance, nid: number): number {
    let count = 1
    const children = instance.localState.children.get(nid)
    if (children) {
        for (const childNid of children) {
            count += countEntityWithChildren(instance, childNid)
        }
    }
    return count
}

function countChannelVisibleEntities(instance: Instance, channel: SharedUpdateChannel) {
    if (instance.localState.children.size === 0) {
        return channel.entities.size
    }

    let count = 0
    const entityNids = channel.entityNids
    for (let i = 0; i < entityNids.length; i++) {
        count += countEntityWithChildren(instance, entityNids[i])
    }
    return count
}

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

function addChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: IChannel) {
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

function addEcsManualUpdates(plan: SnapshotPlan, instance: Instance, channel: EcsSnapshotChannel, visibleUpdates: Set<number>) {
    for (let i = 0; i < channel.manualPropNids.length; i++) {
        const nid = channel.manualPropNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
            continue
        }
        const prop = channel.manualPropSchemas[i]
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(component.ntype)!,
            prop: prop.prop,
            value: channel.manualPropValues[i]
        })
    }

    for (let i = 0; i < channel.manualGroupNids.length; i++) {
        const nid = channel.manualGroupNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
            continue
        }
        const group = channel.manualGroupSchemas[i]
        const values = []
        let offset = channel.manualGroupValueOffsets[i]
        for (let j = 0; j < group.props.length; j++) {
            values.push(channel.manualGroupValues[offset++])
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(component.ntype)!,
            group,
            values
        })
    }
}

function addManualUpdateLog(
    plan: SnapshotPlan,
    instance: Instance,
    log: {
        manualPropNids: number[]
        manualPropSchemas: any[]
        manualPropValues: any[]
        manualGroupNids: number[]
        manualGroupSchemas: any[]
        manualGroupValueOffsets: number[]
        manualGroupValues: any[]
    },
    visibleUpdates: Set<number>
) {
    for (let i = 0; i < log.manualPropNids.length; i++) {
        const nid = log.manualPropNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const entity = instance.localState.getByNid(nid)
        if (!entity) {
            continue
        }
        const prop = log.manualPropSchemas[i]
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype)!,
            prop: prop.prop,
            value: log.manualPropValues[i]
        })
    }

    for (let i = 0; i < log.manualGroupNids.length; i++) {
        const nid = log.manualGroupNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const entity = instance.localState.getByNid(nid)
        if (!entity) {
            continue
        }
        const group = log.manualGroupSchemas[i]
        const values = []
        let offset = log.manualGroupValueOffsets[i]
        for (let j = 0; j < group.props.length; j++) {
            values.push(log.manualGroupValues[offset++])
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(entity.ntype)!,
            group,
            values
        })
    }
}

function addManualUpdates(plan: SnapshotPlan, instance: Instance, channel: ManualUpdateChannel, visibleUpdates: Set<number>) {
    addManualUpdateLog(plan, instance, channel, visibleUpdates)
}

function addManualSpatialUpdates(
    plan: SnapshotPlan,
    instance: Instance,
    user: User,
    channel: ManualSpatialCellFragmentChannel,
    visibleUpdates: Set<number>
) {
    const cellKeys = channel.getVisibleCellKeys(user.id)
    for (let i = 0; i < cellKeys.length; i++) {
        const log = channel.getManualCellUpdateLog(cellKeys[i])
        if (log) {
            addManualUpdateLog(plan, instance, log, visibleUpdates)
        }
    }
}

function ecsHasManualUpdates(channel: EcsSnapshotChannel) {
    return channel.manualPropNids.length > 0 || channel.manualGroupNids.length > 0
}

function collectSubscribedChannelSnapshotPlan(user: User, instance: Instance, channel: IChannel) {
    const { toCreate, toUpdate, toDelete } = user.checkChannelVisibility(channel, instance.tick)
    const plan = createEmptySnapshotPlan()
    addChannelHeader(plan, user, instance, channel)

    if (isEcsSnapshotChannel(channel)) {
        addEcsVisibilityCrud(plan, channel, toCreate, toDelete)
        addEcsManualUpdates(plan, instance, channel, new Set(toUpdate))
        addChannelMessages(plan, user, channel, instance.network.debugBinaryWrites)
        return plan
    }

    const visibleUpdates = new Set(toUpdate)
    const manualChannel = isManualUpdateChannel(channel)
    const manualSpatialChannel = isManualSpatialCellFragmentChannel(channel)
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i])
    }
    if (!manualChannel && !manualSpatialChannel) {
        for (let i = 0; i < toUpdate.length; i++) {
            addRegularUpdate(plan, instance, toUpdate[i])
        }
    }
    plan.deleteEntities = toDelete
    if (manualChannel) {
        addManualUpdates(plan, instance, channel, visibleUpdates)
    } else if (manualSpatialChannel) {
        addManualSpatialUpdates(plan, instance, user, channel, visibleUpdates)
    }
    addChannelMessages(plan, user, channel, instance.network.debugBinaryWrites)
    return plan
}

function collectPendingVisibilityDeletePlan(user: User) {
    const deletes = user.consumePendingVisibilityDeletes()
    if (deletes.length === 0) {
        return null
    }
    const plan = createEmptySnapshotPlan()
    plan.deleteEntities = deletes
    return plan
}

function collectManualSpatialVisibilityPlan(user: User, instance: Instance, channel: ManualSpatialCellFragmentChannel) {
    const { toCreate, toDelete } = user.checkChannelVisibility(channel, instance.tick)
    const plan = createEmptySnapshotPlan()
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i])
    }
    plan.deleteEntities = toDelete
    addChannelMessages(plan, user, channel, instance.network.debugBinaryWrites)
    return plan
}

function collectStableEcsStructuralSnapshotBase(user: User, channel: EcsSnapshotChannel) {
    const plan = createEmptySnapshotPlan()
    plan.ecsCreateEntities.push(...channel.createdRoots)
    plan.ecsCreateComponents.push(...channel.createdComponents)
    plan.ecsDeleteEntities.push(...channel.deletedRoots)
    plan.deleteEntities.push(...channel.deletedComponents)

    const deleteNids = new Set<number>()
    for (let i = 0; i < channel.deletedRoots.length; i++) {
        deleteNids.add(channel.deletedRoots[i])
    }
    for (let i = 0; i < channel.rootDeletedComponents.length; i++) {
        deleteNids.add(channel.rootDeletedComponents[i])
    }
    for (let i = 0; i < channel.deletedComponents.length; i++) {
        deleteNids.add(channel.deletedComponents[i])
    }
    if (deleteNids.size > 0) {
        for (let i = user.currentlyVisible.length - 1; i >= 0; i--) {
            const nid = user.currentlyVisible[i]
            if (deleteNids.has(nid)) {
                const last = user.currentlyVisible.pop()!
                if (i < user.currentlyVisible.length) {
                    user.currentlyVisible[i] = last
                }
                user.tickLastSeen.delete(nid)
            }
        }
    }

    for (let i = 0; i < channel.createdRoots.length; i++) {
        const nid = channel.createdRoots[i]
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }
    for (let i = 0; i < channel.createdComponents.length; i++) {
        const nid = channel.createdComponents[i].nid
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }

    const visibleNids = channel.getVisibleNetworkedNids(user.id)
    user.stableVisibleRefs.set(channel.nid, visibleNids)
    user.lastVisibleCount = user.currentlyVisible.length
    addEnvelopeQueues(plan, user)
    addChannelMessages(plan, user, channel, true)
    return { plan, toUpdate: [] }
}

function collectEcsSnapshotBase(user: User, instance: Instance, channel: EcsSnapshotChannel) {
    const plan = createEmptySnapshotPlan()

    if (!channel.hasStructuralDeltas()) {
        const visibleNids = channel.getVisibleNetworkedNids(user.id)
        if (
            user.stableVisibleRefs.get(channel.nid) === visibleNids &&
            user.currentlyVisible.length === visibleNids.length
        ) {
            user.lastVisibleCount = user.currentlyVisible.length
            addEnvelopeQueues(plan, user)
            addChannelMessages(plan, user, channel, true)
            return { plan, toUpdate: [] }
        }
    }
    if (
        channel.hasStructuralDeltas() &&
        !ecsHasManualUpdates(channel) &&
        user.stableVisibleRefs.has(channel.nid)
    ) {
        return collectStableEcsStructuralSnapshotBase(user, channel)
    }

    const { toCreate, toUpdate, toDelete } = user.checkChannelVisibility(channel, instance.tick)
    addEcsVisibilityCrud(plan, channel, toCreate, toDelete)

    addEnvelopeQueues(plan, user)
    addChannelMessages(plan, user, channel, true)

    return { plan, toUpdate }
}

function hasEcsSnapshotCrud(plan: SnapshotPlan) {
    return plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.deleteEntities.length > 0
}

function createEcsSnapshotBuffer(user: User, instance: Instance, channel: EcsSnapshotChannel) {
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

    const needsProtocolPrelude = protocolWillChange(user, instance)
    instance.network.queueProtocolIfChanged(user)
    const queuedResponses = user.responseQueue.length
    const base = collectEcsSnapshotBase(user, instance, channel)
    const plan = base.plan
    const protocol = instance.network.getProtocol()
    const writeManualLogDirectly = !hasEcsSnapshotCrud(plan)
    if (!writeManualLogDirectly) {
        addEcsManualUpdates(plan, instance, channel, new Set(base.toUpdate))
    }
    const manualFragment = writeManualLogDirectly &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites
        ? getManualUpdateFragment(user, instance, channel, 'ecs-manual')
        : null

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = []
    if (needsProtocolPrelude) {
        chunks.push(createProtocolPreludeChunk(instance, protocol))
    }
    chunks.push(
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('EcsSnapshotPlan', plan, instance.context, protocol)
    )
    if (manualFragment) {
        chunks.push(createSnapshotChunk('EcsManualUpdateFragment', manualFragment.bytes, writer => {
            const copyStart = measure ? performance.now() : 0
            writePayload(writer, manualFragment.payload)
            if (measure) {
                instance.network.recordSharedFragmentCopy(performance.now() - copyStart, manualFragment.bytes)
            }
        }))
    } else if (writeManualLogDirectly) {
        chunks.push(createSnapshotChunk('EcsManualUpdates', countEcsManualUpdateBytes(channel, protocol), writer => {
            writeEcsManualUpdates(channel, writer, protocol)
        }))
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

    commitSnapshotPlan(user, plan)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        if (manualFragment) {
            instance.network.recordSharedSnapshot()
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length,
            updateProps: manualFragment ? manualFragment.updateProps :
                writeManualLogDirectly ? channel.manualPropNids.length : plan.updateEntities.length,
            updateGroups: manualFragment ? manualFragment.updateGroups :
                writeManualLogDirectly ? channel.manualGroupNids.length : plan.updateEntityGroups.length,
            groupedUpdateProps: manualFragment ? manualFragment.groupedUpdateProps :
                writeManualLogDirectly ? countManualGroupedProps(channel) :
                plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length,
            messages: countPlanMessages(plan),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

function collectEcsSpatialSnapshotBase(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel) {
    const plan = createEmptySnapshotPlan()
    const { toCreate, toDelete } = user.checkChannelVisibility(channel, instance.tick)
    addEcsVisibilityCrud(plan, channel, toCreate, toDelete)

    addEnvelopeQueues(plan, user)
    addChannelMessages(plan, user, channel, true)
    return plan
}

function filterEcsSpatialManualLog(channel: EcsSpatialSnapshotChannel, log: EcsManualUpdateLog) {
    for (let i = 0; i < log.manualPropNids.length; i++) {
        if (!channel.getComponent(log.manualPropNids[i])) {
            return copyLiveEcsSpatialManualLog(channel, log)
        }
    }

    for (let i = 0; i < log.manualGroupNids.length; i++) {
        if (!channel.getComponent(log.manualGroupNids[i])) {
            return copyLiveEcsSpatialManualLog(channel, log)
        }
    }

    return log
}

function copyLiveEcsSpatialManualLog(channel: EcsSpatialSnapshotChannel, log: EcsManualUpdateLog) {
    const filtered: EcsManualUpdateLog = {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    }

    for (let i = 0; i < log.manualPropNids.length; i++) {
        const nid = log.manualPropNids[i]
        if (!channel.getComponent(nid)) {
            continue
        }
        filtered.manualPropNids.push(nid)
        filtered.manualPropSchemas.push(log.manualPropSchemas[i])
        filtered.manualPropValues.push(log.manualPropValues[i])
    }

    for (let i = 0; i < log.manualGroupNids.length; i++) {
        const nid = log.manualGroupNids[i]
        const group = log.manualGroupSchemas[i]
        let offset = log.manualGroupValueOffsets[i]
        if (!channel.getComponent(nid)) {
            continue
        }
        filtered.manualGroupNids.push(nid)
        filtered.manualGroupNTypes.push(log.manualGroupNTypes[i])
        filtered.manualGroupSchemas.push(group)
        filtered.manualGroupValueOffsets.push(filtered.manualGroupValues.length)
        for (let j = 0; j < group.props.length; j++) {
            filtered.manualGroupValues.push(log.manualGroupValues[offset++])
        }
    }

    return filtered
}

function getEcsSpatialCellUpdateFragment(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel, cellKey: string) {
    const log = channel.getManualCellUpdateLog(cellKey)
    if (!log) {
        return null
    }
    const filtered = filterEcsSpatialManualLog(channel, log)
    if (filtered.manualPropNids.length === 0 && filtered.manualGroupNids.length === 0) {
        return null
    }
    return getManualUpdateFragment(user, instance, { nid: channel.nid, ...filtered }, `ecs-spatial:${cellKey}`)
}

function createEcsSpatialSnapshotBuffer(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel) {
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

    const needsProtocolPrelude = protocolWillChange(user, instance)
    instance.network.queueProtocolIfChanged(user)
    const queuedResponses = user.responseQueue.length
    const plan = collectEcsSpatialSnapshotBase(user, instance, channel)
    const protocol = instance.network.getProtocol()
    const updateFragments: ManualUpdateFragment[] = []
    const visibleCellKeys = channel.getVisibleCellKeys(user.id)
    for (let i = 0; i < visibleCellKeys.length; i++) {
        const cellKey = visibleCellKeys[i]
        if (!channel.cellHasManualUpdates(cellKey)) {
            continue
        }
        const fragment = getEcsSpatialCellUpdateFragment(user, instance, channel, cellKey)
        if (fragment && (fragment.updateProps > 0 || fragment.updateGroups > 0)) {
            updateFragments.push(fragment)
        }
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = []
    if (needsProtocolPrelude) {
        chunks.push(createProtocolPreludeChunk(instance, protocol))
    }
    chunks.push(
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('EcsSpatialSnapshotPlan', plan, instance.context, protocol)
    )
    for (let i = 0; i < updateFragments.length; i++) {
        chunks.push(createPayloadCopyChunk('EcsSpatialUpdateFragment', instance, updateFragments[i].payload, updateFragments[i].bytes))
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

    commitSnapshotPlan(user, plan)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        if (updateFragments.length > 0) {
            instance.network.recordSharedSnapshot()
        }
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length,
            updateProps: updateFragments.reduce((total, fragment) => total + fragment.updateProps, 0),
            updateGroups: updateFragments.reduce((total, fragment) => total + fragment.updateGroups, 0),
            groupedUpdateProps: updateFragments.reduce((total, fragment) => total + fragment.groupedUpdateProps, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length,
            messages: countPlanMessages(plan),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

function getManualUpdateChannelFragment(user: User, instance: Instance, channel: ManualUpdateChannel) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:manual:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0

    if (measure) {
        countStart = performance.now()
    }
    const bytes = countManualUpdateBytes(channel, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeManualUpdates(channel, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.manualPropNids.length,
        updateGroups: channel.manualGroupNids.length,
        groupedUpdateProps: countManualGroupedProps(channel)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

function createSharedUpdateSnapshotBuffer(user: User, instance: Instance, channel: SharedUpdateChannel) {
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
    user.lastVisibleCount = user.currentlyVisible.length

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)
    const scopedMessagePlan = createEmptySnapshotPlan()
    addChannelMessages(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites)
    const fragment = getSharedUpdateFragment(user, instance, channel)

    if (measure) {
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('SharedUpdateMessages', scopedMessagePlan, instance.context, protocol))
    }
    chunks.push(createChannelScopeChunk(channel.nid, protocol))
    chunks.push(createPayloadCopyChunk('SharedUpdateFragment', instance, fragment.payload, fragment.bytes))
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, envelope)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSharedSnapshot()
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: fragment.updateProps,
            updateGroups: fragment.updateGroups,
            groupedUpdateProps: fragment.groupedUpdateProps,
            deletes: 0,
            messages: countPlanMessages(envelope) + countPlanMessages(scopedMessagePlan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

function createManualUpdateSnapshotBuffer(user: User, instance: Instance, channel: ManualUpdateChannel) {
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
    user.lastVisibleCount = user.currentlyVisible.length

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)
    const scopedMessagePlan = createEmptySnapshotPlan()
    addChannelMessages(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites)
    const fragment = getManualUpdateChannelFragment(user, instance, channel)

    if (measure) {
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('ManualUpdateMessages', scopedMessagePlan, instance.context, protocol))
    }
    chunks.push(createChannelScopeChunk(channel.nid, protocol))
    chunks.push(createPayloadCopyChunk('ManualUpdateFragment', instance, fragment.payload, fragment.bytes))
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, envelope)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSharedSnapshot()
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: fragment.updateProps,
            updateGroups: fragment.updateGroups,
            groupedUpdateProps: fragment.groupedUpdateProps,
            deletes: 0,
            messages: countPlanMessages(envelope) + countPlanMessages(scopedMessagePlan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

function createSharedDeltaSnapshotBuffer(user: User, instance: Instance, channel: SharedUpdateChannel) {
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

    const entityDeltaFragments = getEntityDeltaFragments(user, instance, channel)
    const messageFragments = getSharedMessageFragments(user, instance)
    const scopedMessagePlan = createEmptySnapshotPlan()
    addChannelMessages(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites)
    const updateFragment = getSharedUpdateFragment(user, instance, channel, entityDeltaFragments.creates?.nids)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    const entityDeltaFragmentBytes = countEntityDeltaFragmentBytes(entityDeltaFragments)
    if (entityDeltaFragmentBytes > 0) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotChunk('EntityDeltaFragments', entityDeltaFragmentBytes, writer => {
            writeEntityDeltaFragments(writer, instance, entityDeltaFragments)
        }))
    }
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('SharedDeltaMessages', scopedMessagePlan, instance.context, protocol))
    }
    chunks.push(createChannelScopeChunk(channel.nid, protocol))
    chunks.push(createPayloadCopyChunk('SharedDeltaUpdateFragment', instance, updateFragment.payload, updateFragment.bytes))
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer)
    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    applySharedChannelDeltasToUser(user, channel, instance.tick, entityDeltaFragments)
    commitSnapshotPlan(user, envelope)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: countEntityDeltaFragmentCreates(entityDeltaFragments),
            updateProps: updateFragment.updateProps,
            updateGroups: updateFragment.updateGroups,
            groupedUpdateProps: updateFragment.groupedUpdateProps,
            deletes: countEntityDeltaFragmentDeletes(entityDeltaFragments),
            messages: countPlanMessages(envelope) + countPlanMessages(scopedMessagePlan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

function removeCreateNidsFromPlan(plan: SnapshotPlan, nids: Set<number>) {
    plan.createEntities = plan.createEntities.filter(entity => !nids.has(entity.nid))
}

function removeDeleteNidsFromPlan(plan: SnapshotPlan, nids: Set<number>) {
    plan.deleteEntities = plan.deleteEntities.filter(nid => !nids.has(nid))
}

function removeUpdateNidsFromPlan(plan: SnapshotPlan, nids: Set<number>) {
    plan.updateEntities = plan.updateEntities.filter(update => !nids.has(update.nid))
    plan.updateEntityGroups = plan.updateEntityGroups.filter(update => !nids.has(update.nid))
}

function allRootsWerePreviouslyHidden(channel: CellFragmentChannel, cellKey: string, beforeVisible: Set<number>) {
    const roots = channel.getCellEntityNids(cellKey)
    for (let i = 0; i < roots.length; i++) {
        if (beforeVisible.has(roots[i])) {
            return false
        }
    }
    return roots.length > 0
}

function allNidsArePlannedDeletes(nids: number[], plannedDeletes: Set<number>) {
    if (nids.length === 0) {
        return false
    }
    for (let i = 0; i < nids.length; i++) {
        if (!plannedDeletes.has(nids[i])) {
            return false
        }
    }
    return true
}

function getManualStableVisibleCellKeys(channel: ManualSpatialCellFragmentChannel, userId: number) {
    if (channel.hasStructuralDeltas()) {
        return null
    }

    const rememberedKeys = channel.getRememberedCellKeys(userId)
    if (rememberedKeys.length === 0) {
        return null
    }

    const currentKeys = channel.getVisibleCellKeys(userId)
    if (currentKeys.length > channel.stableFragmentCellLimit || currentKeys.length !== rememberedKeys.length) {
        return null
    }

    const remembered = new Set(rememberedKeys)
    for (let i = 0; i < currentKeys.length; i++) {
        if (!remembered.has(currentKeys[i])) {
            return null
        }
    }
    return currentKeys
}

function getMovementStableVisibleCellKeys(channel: CellFragmentChannel, userId: number) {
    if (channel.hasStructuralDeltas()) {
        return null
    }

    const rememberedKeys = channel.getRememberedCellKeys(userId)
    if (rememberedKeys.length === 0) {
        return null
    }

    const currentKeys = channel.getVisibleCellKeys(userId)
    if (currentKeys.length > channel.stableFragmentCellLimit || currentKeys.length !== rememberedKeys.length) {
        return null
    }

    const visible = new Set(currentKeys)
    for (let i = 0; i < rememberedKeys.length; i++) {
        if (!visible.has(rememberedKeys[i])) {
            return null
        }
    }

    const moves = channel.getMovedRoots()
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i]
        if (visible.has(move.fromCell) !== visible.has(move.toCell)) {
            return null
        }
    }

    return currentKeys
}

function addManualSpatialCreates(instance: Instance, plan: SnapshotPlan, roots: any[], seen: Set<number>) {
    const collected = collectCreateEntitiesForRoots(instance, roots)
    for (let i = 0; i < collected.createEntities.length; i++) {
        const entity = collected.createEntities[i]
        if (seen.has(entity.nid)) {
            continue
        }
        seen.add(entity.nid)
        plan.createEntities.push(entity)
    }
}

function addManualSpatialDeletes(instance: Instance, plan: SnapshotPlan, rootNid: number, seen: Set<number>) {
    instance.localState.collectEntityTreeDeletes(rootNid, plan.deleteEntities)
    for (let i = plan.deleteEntities.length - 1; i >= 0; i--) {
        const nid = plan.deleteEntities[i]
        if (seen.has(nid)) {
            plan.deleteEntities.splice(i, 1)
            continue
        }
        seen.add(nid)
    }
}

function applyManualSpatialVisibilityDeltas(user: User, plan: SnapshotPlan, tick: number) {
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        const nid = plan.deleteEntities[i]
        user.tickLastSeen.delete(nid)
        const index = user.currentlyVisible.indexOf(nid)
        if (index > -1) {
            user.currentlyVisible.splice(index, 1)
        }
    }

    for (let i = 0; i < plan.createEntities.length; i++) {
        const nid = plan.createEntities[i].nid
        if (!user.tickLastSeen.has(nid)) {
            user.currentlyVisible.push(nid)
        }
        user.tickLastSeen.set(nid, tick)
    }
    user.lastVisibleCount = user.currentlyVisible.length
}

function createManualStableSpatialCellSnapshotBuffer(user: User, instance: Instance, channel: ManualSpatialCellFragmentChannel, currentCellKeys: string[]) {
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

    const plan = createEmptySnapshotPlan()
    const visibleCellSet = new Set(currentCellKeys)
    const createNids = new Set<number>()
    const deleteNids = new Set<number>()
    const moves = channel.getMovedRoots()
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i]
        const fromVisible = visibleCellSet.has(move.fromCell)
        const toVisible = visibleCellSet.has(move.toCell)
        if (!fromVisible && toVisible) {
            addManualSpatialCreates(instance, plan, [move.entity], createNids)
        } else if (fromVisible && !toVisible) {
            addManualSpatialDeletes(instance, plan, move.entity.nid, deleteNids)
        }
    }
    addChannelMessages(plan, user, channel, instance.network.debugBinaryWrites)

    const updateFragments: CellEntityFragment[] = []
    for (let i = 0; i < currentCellKeys.length; i++) {
        const cellKey = currentCellKeys[i]
        if (!channel.cellHasManualUpdates(cellKey)) {
            continue
        }
        const fragment = getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, false)
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            updateFragments.push(fragment)
        }
    }
    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol),
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('ManualSpatialMovementPlan', plan, instance.context, protocol)
    ]
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    const updateChunk = createCellFragmentChunk('ManualSpatialUpdateFragments', instance, updateFragments)
    if (updateChunk) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(updateChunk)
    }
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    applyManualSpatialVisibilityDeltas(user, plan, instance.tick)
    commitSnapshotPlan(user, envelope)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSharedSnapshot()
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.createEntities.length,
            updateProps: sumCellFragmentUpdateProps(updateFragments),
            updateGroups: sumCellFragmentUpdateGroups(updateFragments),
            groupedUpdateProps: sumCellFragmentGroupedProps(updateFragments),
            deletes: plan.deleteEntities.length,
            messages: countPlanMessages(envelope) + countPlanMessages(plan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

function createStableCellFragmentSnapshotBuffer(user: User, instance: Instance, channel: CellFragmentChannel, currentCellKeys: string[]) {
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
    const scopedMessagePlan = createEmptySnapshotPlan()
    addChannelMessages(scopedMessagePlan, user, channel, instance.network.debugBinaryWrites)

    const updateFragments: CellEntityFragment[] = []
    for (let i = 0; i < currentCellKeys.length; i++) {
        if (!cellMayHaveUpdates(channel, currentCellKeys[i])) {
            continue
        }
        const fragment = getCellUpdateFragment(user, instance, channel, currentCellKeys[i], false)
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            updateFragments.push(fragment)
        }
    }
    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    if (hasSnapshotPlanContent(scopedMessagePlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('StableCellMessages', scopedMessagePlan, instance.context, protocol))
    }
    const updateChunk = createCellFragmentChunk('StableCellUpdateFragments', instance, updateFragments)
    if (updateChunk) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(updateChunk)
    }
    const bytes = sumSnapshotChunkBytes(chunks)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshotChunks(chunks, writer)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    user.lastVisibleCount = user.currentlyVisible.length
    commitSnapshotPlan(user, envelope)
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSharedSnapshot()
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: 0,
            updateProps: sumCellFragmentUpdateProps(updateFragments),
            updateGroups: sumCellFragmentUpdateGroups(updateFragments),
            groupedUpdateProps: sumCellFragmentGroupedProps(updateFragments),
            deletes: 0,
            messages: countPlanMessages(envelope) + countPlanMessages(scopedMessagePlan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

function createCellFragmentSnapshotBuffer(user: User, instance: Instance, channel: CellFragmentChannel) {
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

    if (isManualSpatialCellFragmentChannel(channel)) {
        const manualStableCellKeys = getManualStableVisibleCellKeys(channel, user.id)
        if (manualStableCellKeys) {
            return createManualStableSpatialCellSnapshotBuffer(user, instance, channel, manualStableCellKeys)
        }
    }

    const movementStableCellKeys = getMovementStableVisibleCellKeys(channel, user.id)
    if (movementStableCellKeys) {
        return createStableCellFragmentSnapshotBuffer(user, instance, channel, movementStableCellKeys)
    }

    const stableCellKeys = channel.getStableVisibleCellKeys(user.id)
    if (stableCellKeys && stableCellKeys.length <= channel.stableFragmentCellLimit) {
        return createStableCellFragmentSnapshotBuffer(user, instance, channel, stableCellKeys)
    }

    instance.network.queueProtocolIfChanged(user)
    const queuedResponses = user.responseQueue.length
    const previousCellKeys = channel.getRememberedCellKeys(user.id)
    const previousCellKeySet = new Set(previousCellKeys)
    const beforeVisible = new Set(user.currentlyVisible)
    const plan = isManualSpatialCellFragmentChannel(channel)
        ? collectManualSpatialVisibilityPlan(user, instance, channel)
        : collectSnapshotPlan(user, instance)
    if (!isManualSpatialCellFragmentChannel(channel)) {
        addChannelMessages(plan, user, channel, instance.network.debugBinaryWrites)
    }
    const currentCellKeys = channel.getVisibleCellKeys(user.id)
    const currentCellKeySet = new Set(currentCellKeys)
    const protocol = instance.network.getProtocol()
    const createFragments: CellEntityFragment[] = []
    const deleteFragments: CellEntityFragment[] = []
    const updateFragments: CellEntityFragment[] = []
    const plannedDeletes = new Set(plan.deleteEntities)

    for (let i = 0; i < currentCellKeys.length; i++) {
        const cellKey = currentCellKeys[i]
        if (previousCellKeySet.has(cellKey)) {
            if (!cellMayHaveUpdates(channel, cellKey)) {
                continue
            }
            const fragment = getCellUpdateFragment(user, instance, channel, cellKey)
            if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                updateFragments.push(fragment)
                removeUpdateNidsFromPlan(plan, fragment.nids)
            }
            continue
        }

        if (allRootsWerePreviouslyHidden(channel, cellKey, beforeVisible)) {
            const fragment = getCellCreateFragment(user, instance, channel, cellKey)
            if (fragment.creates > 0) {
                createFragments.push(fragment)
                removeCreateNidsFromPlan(plan, fragment.nids)
            }
        } else if (isManualSpatialCellFragmentChannel(channel) && channel.cellHasManualUpdates(cellKey)) {
            const fragment = getManualSpatialCellUpdateFragment(user, instance, channel, cellKey)
            if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                updateFragments.push(fragment)
            }
        }
    }

    for (let i = 0; i < previousCellKeys.length; i++) {
        const cellKey = previousCellKeys[i]
        if (currentCellKeySet.has(cellKey)) {
            continue
        }
        const nids = channel.getRememberedCellNids(user.id, cellKey)
        if (allNidsArePlannedDeletes(nids, plannedDeletes)) {
            const fragment = getCellDeleteFragment(user, instance, channel, cellKey, nids)
            if (fragment.deletes > 0) {
                deleteFragments.push(fragment)
                removeDeleteNidsFromPlan(plan, fragment.nids)
            }
        }
    }

    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('CellFragmentSnapshotPlan', plan, instance.context, protocol)
    ]
    const createChunk = createCellFragmentChunk('CellCreateFragments', instance, createFragments)
    if (createChunk) {
        chunks.push(createChunk)
    }
    const deleteChunk = createCellFragmentChunk('CellDeleteFragments', instance, deleteFragments)
    if (deleteChunk) {
        chunks.push(deleteChunk)
    }
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    const updateChunk = createCellFragmentChunk('CellUpdateFragments', instance, updateFragments)
    if (updateChunk) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(updateChunk)
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

    commitSnapshotPlan(user, plan)
    applyCellEntityFragmentsToUser(user, instance.tick, createFragments, deleteFragments)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)
    channel.rememberVisibleCells(user.id)

    if (measure) {
        commitMs = performance.now() - commitStart
        instance.network.recordSharedSnapshot()
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: plan.createEntities.length + sumCellFragmentCreates(createFragments),
            updateProps: plan.updateEntities.length + sumCellFragmentUpdateProps(updateFragments),
            updateGroups: plan.updateEntityGroups.length + sumCellFragmentUpdateGroups(updateFragments),
            groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) +
                sumCellFragmentGroupedProps(updateFragments),
            deletes: plan.deleteEntities.length + sumCellFragmentDeletes(deleteFragments),
            messages: countPlanMessages(plan) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

const createSnapshotBuffer = (user: User, instance: Instance) => {
    const hasPendingLifecycleWork =
        user.hasPendingVisibilityDeletes() ||
        user.hasPendingChannelOpens() ||
        user.hasPendingChannelCloses()
    const ecsSpatialChannel = getSingleEcsSpatialSnapshotChannel(user)
    const ecsChannel = getSingleEcsSnapshotChannel(user)
    const manualUpdateChannel = getSingleManualUpdateChannel(user)
    const sharedChannel = getSingleSharedChannel(user)
    const cellFragmentChannel = getSingleCellFragmentChannel(user)
    if (!hasPendingLifecycleWork && ecsSpatialChannel && !channelHasHeaderPending(user, ecsSpatialChannel)) {
        return user.withChannelVisibilityState(ecsSpatialChannel.nid, () =>
            createEcsSpatialSnapshotBuffer(user, instance, ecsSpatialChannel)
        )
    }

    if (!hasPendingLifecycleWork && ecsChannel && !channelHasHeaderPending(user, ecsChannel)) {
        return user.withChannelVisibilityState(ecsChannel.nid, () =>
            createEcsSnapshotBuffer(user, instance, ecsChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        sharedChannel &&
        !channelHasHeaderPending(user, sharedChannel) &&
        hasChannelDeltas(sharedChannel) &&
        user.withChannelVisibilityState(sharedChannel.nid, () => canUseSharedDeltaFragments(user, sharedChannel))) {
        return user.withChannelVisibilityState(sharedChannel.nid, () =>
            createSharedDeltaSnapshotBuffer(user, instance, sharedChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        manualUpdateChannel &&
        !channelHasHeaderPending(user, manualUpdateChannel) &&
        user.withChannelVisibilityState(manualUpdateChannel.nid, () => canUseSharedUpdateFragment(user, manualUpdateChannel))) {
        return user.withChannelVisibilityState(manualUpdateChannel.nid, () =>
            createManualUpdateSnapshotBuffer(user, instance, manualUpdateChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        sharedChannel &&
        !channelHasHeaderPending(user, sharedChannel) &&
        user.withChannelVisibilityState(sharedChannel.nid, () => canUseSharedUpdateFragment(user, sharedChannel))) {
        return user.withChannelVisibilityState(sharedChannel.nid, () =>
            createSharedUpdateSnapshotBuffer(user, instance, sharedChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingLifecycleWork &&
        cellFragmentChannel &&
        !channelHasHeaderPending(user, cellFragmentChannel) &&
        canUseCellFragments(cellFragmentChannel, user.id)) {
        return user.withChannelVisibilityState(cellFragmentChannel.nid, () =>
            createCellFragmentSnapshotBuffer(user, instance, cellFragmentChannel)
        )
    }

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
    const channelPlans: { channelId: number, plan: SnapshotPlan }[] = []
    const pendingDeletePlan = collectPendingVisibilityDeletePlan(user)
    // Multi-channel users receive an appended stream per subscribed channel.
    // Do not reintroduce a global visibility union here; channel-specific state
    // is what preserves manual/spatial/ECS fast paths and client identities.
    for (const channel of user.subscriptions.values()) {
        const channelPlan = collectSubscribedChannelSnapshotPlan(user, instance, channel)
        if (hasSnapshotPlanContent(channelPlan)) {
            channelPlans.push({ channelId: channel.nid, plan: channelPlan })
        }
    }

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        countStart = performance.now()
    }

    // The writer uses exact-sized buffers, so normal snapshot creation does a
    // count pass followed by a write pass. The metrics split these deliberately:
    // if count and write both scale with update volume, prop bundles or cached
    // binary fragments are better candidates than generic micro-optimizations.
    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    if (pendingDeletePlan) {
        chunks.push(createSnapshotPlanChunk('PendingVisibilityDeletes', pendingDeletePlan, instance.context, protocol))
    }
    for (let i = 0; i < channelPlans.length; i++) {
        chunks.push(createChannelScopeChunk(channelPlans[i].channelId, protocol))
        chunks.push(createSnapshotPlanChunk('ChannelSnapshotPlan', channelPlans[i].plan, instance.context, protocol))
    }
    const messageFragmentBytes = sumSharedMessageFragmentBytes(messageFragments, protocol)
    if (messageFragmentBytes > 0) {
        chunks.push(createSnapshotChunk('MessageFragments', messageFragmentBytes, writer => {
            writeSharedMessageFragments(writer, instance, messageFragments)
        }))
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
    if (pendingDeletePlan) {
        commitSnapshotPlan(user, pendingDeletePlan)
    }
    for (let i = 0; i < channelPlans.length; i++) {
        commitSnapshotPlan(user, channelPlans[i].plan)
    }
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)
    rememberCellFragmentChannelVisibility(user)
    if (sharedChannel) {
        user.withChannelVisibilityState(sharedChannel.nid, () => rememberSharedChannelVersion(user))
    }

    if (measure) {
        commitMs = performance.now() - commitStart
        // These counts come from the already-built plan so the instrumentation
        // does not walk entity schemas or visibility a second time.
        instance.network.recordSnapshotPerformance({
            collectMs,
            countMs,
            writeMs,
            commitMs,
            sendMs: 0,
            bytes,
            creates: sumPlanCreates(channelPlans),
            updateProps: sumPlanUpdateProps(channelPlans),
            updateGroups: sumPlanUpdateGroups(channelPlans),
            groupedUpdateProps: sumPlanGroupedUpdateProps(channelPlans),
            deletes: sumPlanDeletes(channelPlans),
            messages: countPlanMessages(envelope) + sumPlanMessages(channelPlans) + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

export default createSnapshotBuffer
export { collectSnapshotPlan, collectSnapshotPlan as getVisibleState }
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot }
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan'
