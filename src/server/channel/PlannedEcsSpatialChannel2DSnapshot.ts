import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { BinarySection } from '../../common/binary/BinarySection'
import { ProtocolConfig, byteSizeOfNetworkType, writeNetworkId } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { User } from '../User'
import { collectSkipInterpolationNids, MAX_RESPONSES_PER_FRAME } from '../../binary/snapshot/collectSnapshotPlan'
import { commitSnapshotPlan } from '../../binary/snapshot/commitSnapshotPlan'
import { createEmptySnapshotPlan, SnapshotPlan } from '../../binary/snapshot/SnapshotPlan'
import {
    createSnapshotPlanChunk,
    SnapshotChunk,
    sumSnapshotChunkBytes,
    writeSnapshotChunks
} from '../../binary/snapshot/SnapshotChunk'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import {
    countEcsManualUpdateBytes,
    countManualGroupedProps,
    EcsManualUpdateLog,
    getManualUpdateFragment,
    ManualUpdateFragment,
    writeEcsManualUpdates
} from '../../binary/snapshot/manualUpdates'
import { createChannelScopeChunk, createPayloadCopyChunk, createProtocolPreludeChunk } from '../../binary/snapshot/snapshotChunkBuilders'
import {
    countPlanMessages,
    sumPlanGroupedUpdateProps
} from '../../binary/snapshot/snapshotPlanStats'
import countEntity from '../../binary/entity/countEntity'
import { writeEntity } from '../../binary/entity/writeEntity'
import {
    PlannedEcsSpatialChannel2D,
    PlannedEcsSpatialVisibilityGroup,
    PlannedEcsSpatialUserSnapshot
} from './PlannedEcsSpatialChannel2D'

type PlannedEcsSpatialVisibilityFrame = {
    ecsCreateEntities: number[]
    ecsCreateComponents: any[]
    ecsDeleteEntities: number[]
    deleteEntities: number[]
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

function protocolWillChange(user: User, instance: Instance) {
    const protocol = instance.network.getProtocol()
    return user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType
}

function addChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: PlannedEcsSpatialChannel2D) {
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

export function isPlannedEcsSpatialChannel2D(channel: any): channel is PlannedEcsSpatialChannel2D {
    return channel?.plannedEcsSpatialChannelMode === true &&
        channel?.ecsSpatialChannelMode === true &&
        typeof channel.nid === 'number' &&
        typeof channel.prepareVisibilityPlan === 'function' &&
        typeof channel.getPlannedSnapshot === 'function' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getManualCellUpdateLog === 'function' &&
        typeof channel.cellHasManualUpdates === 'function'
}

export function getSinglePlannedEcsSpatialChannel2D(user: User) {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isPlannedEcsSpatialChannel2D(channel) ? channel : null
}

function collectPlannedEcsSpatialChannelPlan(
    user: User,
    instance: Instance,
    channel: PlannedEcsSpatialChannel2D
) {
    const plan = createEmptySnapshotPlan()
    addChannelHeader(plan, user, instance, channel)
    addChannelMessages(plan, user, channel, true)
    return plan
}

function collectVisibilityFrame(channel: PlannedEcsSpatialChannel2D, snapshot: PlannedEcsSpatialUserSnapshot): PlannedEcsSpatialVisibilityFrame {
    const frame: PlannedEcsSpatialVisibilityFrame = {
        ecsCreateEntities: [],
        ecsCreateComponents: [],
        ecsDeleteEntities: [],
        deleteEntities: []
    }

    for (let i = 0; i < snapshot.toCreate.length; i++) {
        const nid = snapshot.toCreate[i]
        if (channel.isRootNid(nid)) {
            frame.ecsCreateEntities.push(nid)
        } else if (channel.isComponentNid(nid)) {
            const component = channel.getComponent(nid)
            if (component) {
                frame.ecsCreateComponents.push(component)
            }
        }
    }

    const deletingRoots = new Set<number>()
    for (let i = 0; i < snapshot.toDelete.length; i++) {
        const nid = snapshot.toDelete[i]
        if (channel.isRootNid(nid)) {
            deletingRoots.add(nid)
            frame.ecsDeleteEntities.push(nid)
        }
    }

    for (let i = 0; i < snapshot.toDelete.length; i++) {
        const nid = snapshot.toDelete[i]
        if (channel.isRootNid(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue
        }
        frame.deleteEntities.push(nid)
    }

    return frame
}

function hasVisibilityFrameContent(frame: PlannedEcsSpatialVisibilityFrame) {
    return frame.ecsCreateEntities.length > 0 ||
        frame.ecsCreateComponents.length > 0 ||
        frame.ecsDeleteEntities.length > 0 ||
        frame.deleteEntities.length > 0
}

function countVisibilityFrame(frame: PlannedEcsSpatialVisibilityFrame, instance: Instance, protocol: ProtocolConfig) {
    let bytes = 0
    const idBytes = byteSizeOfNetworkType(protocol.nidType)
    if (frame.ecsCreateEntities.length > 0) {
        bytes += 1 + 4 + frame.ecsCreateEntities.length * idBytes
    }
    if (frame.ecsCreateComponents.length > 0) {
        bytes += 1 + 4
        for (let i = 0; i < frame.ecsCreateComponents.length; i++) {
            const component = frame.ecsCreateComponents[i]
            bytes += idBytes
            bytes += countEntity(instance.context.getSchema(component.ntype)!, component, protocol.ntypeType, protocol.nidType)
        }
    }
    if (frame.ecsDeleteEntities.length > 0) {
        bytes += 1 + 4 + frame.ecsDeleteEntities.length * idBytes
    }
    if (frame.deleteEntities.length > 0) {
        bytes += 1 + 4 + frame.deleteEntities.length * idBytes
    }
    return bytes
}

function writeVisibilityFrame(frame: PlannedEcsSpatialVisibilityFrame, instance: Instance, protocol: ProtocolConfig, writer: any) {
    if (frame.ecsCreateEntities.length > 0) {
        writer.writeUInt8(BinarySection.EcsCreateEntities)
        writer.writeUInt32(frame.ecsCreateEntities.length)
        for (let i = 0; i < frame.ecsCreateEntities.length; i++) {
            writeNetworkId(frame.ecsCreateEntities[i], protocol.nidType, writer)
        }
    }

    if (frame.ecsCreateComponents.length > 0) {
        writer.writeUInt8(BinarySection.EcsCreateComponents)
        writer.writeUInt32(frame.ecsCreateComponents.length)
        for (let i = 0; i < frame.ecsCreateComponents.length; i++) {
            const component = frame.ecsCreateComponents[i]
            writeNetworkId(component.pid, protocol.nidType, writer)
            writeEntity(component, instance.context.getSchema(component.ntype)!, writer, protocol.ntypeType, protocol.nidType)
        }
    }

    if (frame.ecsDeleteEntities.length > 0) {
        writer.writeUInt8(BinarySection.EcsDeleteEntities)
        writer.writeUInt32(frame.ecsDeleteEntities.length)
        for (let i = 0; i < frame.ecsDeleteEntities.length; i++) {
            writeNetworkId(frame.ecsDeleteEntities[i], protocol.nidType, writer)
        }
    }

    if (frame.deleteEntities.length > 0) {
        writer.writeUInt8(BinarySection.DeleteEntities)
        writer.writeUInt32(frame.deleteEntities.length)
        for (let i = 0; i < frame.deleteEntities.length; i++) {
            writeNetworkId(frame.deleteEntities[i], protocol.nidType, writer)
        }
    }
}

function copyVisibleLiveManualLog(
    channel: PlannedEcsSpatialChannel2D,
    log: EcsManualUpdateLog,
    blockedNids: Set<number>
) {
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
        if (blockedNids.has(nid) || !channel.getComponent(nid)) {
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
        if (blockedNids.has(nid) || !channel.getComponent(nid)) {
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

function getPlannedEcsSpatialCellUpdateFragment(
    user: User,
    instance: Instance,
    channel: PlannedEcsSpatialChannel2D,
    cellKey: string,
    blockedNids: Set<number>
) {
    const log = channel.getManualCellUpdateLog(cellKey)
    if (!log) {
        return null
    }
    const filtered = blockedNids.size === 0 ? log : copyVisibleLiveManualLog(channel, log, blockedNids)
    if (filtered.manualPropNids.length === 0 && filtered.manualGroupNids.length === 0) {
        return null
    }
    return getManualUpdateFragment(user, instance, { nid: channel.nid, ...filtered }, `planned-ecs-spatial:${cellKey}`)
}

function mergeVisibleCellLogs(channel: PlannedEcsSpatialChannel2D, cellKeys: string[]) {
    const merged: EcsManualUpdateLog = {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupNTypes: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    }

    for (let i = 0; i < cellKeys.length; i++) {
        const log = channel.getManualCellUpdateLog(cellKeys[i])
        if (!log) {
            continue
        }
        for (let j = 0; j < log.manualPropNids.length; j++) {
            merged.manualPropNids.push(log.manualPropNids[j])
            merged.manualPropSchemas.push(log.manualPropSchemas[j])
            merged.manualPropValues.push(log.manualPropValues[j])
        }
        for (let j = 0; j < log.manualGroupNids.length; j++) {
            const group = log.manualGroupSchemas[j]
            let offset = log.manualGroupValueOffsets[j]
            merged.manualGroupNids.push(log.manualGroupNids[j])
            merged.manualGroupNTypes.push(log.manualGroupNTypes[j])
            merged.manualGroupSchemas.push(group)
            merged.manualGroupValueOffsets.push(merged.manualGroupValues.length)
            for (let k = 0; k < group.props.length; k++) {
                merged.manualGroupValues.push(log.manualGroupValues[offset++])
            }
        }
    }

    return merged
}

function getPlannedEcsSpatialGroupUpdateFragment(
    user: User,
    instance: Instance,
    channel: PlannedEcsSpatialChannel2D,
    group: PlannedEcsSpatialVisibilityGroup
) {
    if (group.sharedUpdateFragment) {
        instance.network.recordSharedFragmentHit()
        return group.sharedUpdateFragment
    }

    const merged = mergeVisibleCellLogs(channel, group.visibleCellKeys)
    if (merged.manualPropNids.length === 0 && merged.manualGroupNids.length === 0) {
        return null
    }
    const fragment = getManualUpdateFragment(user, instance, { nid: channel.nid, ...merged }, `planned-ecs-spatial-group:${group.cellSignature}`)
    group.sharedUpdateFragment = fragment
    return fragment
}

function countDirectManualFragments(logs: EcsManualUpdateLog[]) {
    return logs.reduce((total, log) => ({
        props: total.props + log.manualPropNids.length,
        groups: total.groups + log.manualGroupNids.length,
        groupedProps: total.groupedProps + countManualGroupedProps(log)
    }), { props: 0, groups: 0, groupedProps: 0 })
}

function createPlannedEcsSpatialChannel2DSnapshotBufferInner(
    user: User,
    instance: Instance,
    channel: PlannedEcsSpatialChannel2D
) {
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
    const protocol = instance.network.getProtocol()
    const { plan: envelope, queuedResponses } = collectEnvelopePlan(user)
    const snapshot = channel.getPlannedSnapshot(user, instance.tick)
    if (!snapshot) {
        throw new Error(`PlannedEcsSpatialChannel2D missing snapshot state for user ${user.id}.`)
    }
    const channelPlan = collectPlannedEcsSpatialChannelPlan(user, instance, channel)
    const visibilityFrame = collectVisibilityFrame(channel, snapshot)
    const blockedNids = new Set<number>()
    for (let i = 0; i < visibilityFrame.ecsCreateEntities.length; i++) {
        blockedNids.add(visibilityFrame.ecsCreateEntities[i])
    }
    for (let i = 0; i < visibilityFrame.ecsCreateComponents.length; i++) {
        blockedNids.add(visibilityFrame.ecsCreateComponents[i].nid)
    }
    for (let i = 0; i < visibilityFrame.ecsDeleteEntities.length; i++) {
        blockedNids.add(visibilityFrame.ecsDeleteEntities[i])
    }
    for (let i = 0; i < visibilityFrame.deleteEntities.length; i++) {
        blockedNids.add(visibilityFrame.deleteEntities[i])
    }

    const updateFragments: ManualUpdateFragment[] = []
    const directLogs: EcsManualUpdateLog[] = []
    const groupFragment = blockedNids.size === 0 &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites
        ? getPlannedEcsSpatialGroupUpdateFragment(user, instance, channel, snapshot.group)
        : null
    if (groupFragment) {
        updateFragments.push(groupFragment)
    } else {
        for (let i = 0; i < snapshot.group.visibleCellKeys.length; i++) {
            const cellKey = snapshot.group.visibleCellKeys[i]
            if (!channel.cellHasManualUpdates(cellKey)) {
                continue
            }
            const fragment = instance.network.sharedUpdateFragmentsEnabled && !instance.network.debugBinaryWrites
                ? getPlannedEcsSpatialCellUpdateFragment(user, instance, channel, cellKey, blockedNids)
                : null
            if (fragment) {
                updateFragments.push(fragment)
                continue
            }
            const log = channel.getManualCellUpdateLog(cellKey)
            if (log) {
                const filtered = blockedNids.size === 0 ? log : copyVisibleLiveManualLog(channel, log, blockedNids)
                if (filtered.manualPropNids.length > 0 || filtered.manualGroupNids.length > 0) {
                    directLogs.push(filtered)
                }
            }
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
    chunks.push(createSnapshotPlanChunk('PlannedEcsSpatialEnvelope', envelope, instance.context, protocol))
    if (hasSnapshotPlanContent(channelPlan)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createSnapshotPlanChunk('PlannedEcsSpatialChannelPlan', channelPlan, instance.context, protocol))
    }
    if (hasVisibilityFrameContent(visibilityFrame)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push({
            label: 'PlannedEcsSpatialVisibilityFrame',
            bytes: countVisibilityFrame(visibilityFrame, instance, protocol),
            write(writer) {
                writeVisibilityFrame(visibilityFrame, instance, protocol, writer)
            }
        })
    }
    for (let i = 0; i < updateFragments.length; i++) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createPayloadCopyChunk(
            'PlannedEcsSpatialUpdateFragment',
            instance,
            updateFragments[i].payload,
            updateFragments[i].bytes
        ))
    }
    for (let i = 0; i < directLogs.length; i++) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push({
            label: 'PlannedEcsSpatialManualUpdates',
            bytes: countEcsManualUpdateBytes(directLogs[i], protocol),
            write(writer) {
                writeEcsManualUpdates(directLogs[i], writer, protocol)
            }
        })
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
        const directCounts = countDirectManualFragments(directLogs)
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
            creates: visibilityFrame.ecsCreateEntities.length + visibilityFrame.ecsCreateComponents.length,
            updateProps: directCounts.props + updateFragments.reduce((total, fragment) => total + fragment.updateProps, 0),
            updateGroups: directCounts.groups + updateFragments.reduce((total, fragment) => total + fragment.updateGroups, 0),
            groupedUpdateProps: directCounts.groupedProps +
                updateFragments.reduce((total, fragment) => total + fragment.groupedUpdateProps, 0) +
                sumPlanGroupedUpdateProps([{ plan: channelPlan }]),
            deletes: visibilityFrame.ecsDeleteEntities.length + visibilityFrame.deleteEntities.length,
            messages: countPlanMessages(envelope) + countPlanMessages(channelPlan),
            engineMessages: envelope.engineMessages.length,
            responses: envelope.responses.length
        })
    }

    return writer.payload
}

export function createPlannedEcsSpatialChannel2DSnapshotBuffer(
    user: User,
    instance: Instance,
    channel: PlannedEcsSpatialChannel2D
) {
    return createPlannedEcsSpatialChannel2DSnapshotBufferInner(user, instance, channel)
}
