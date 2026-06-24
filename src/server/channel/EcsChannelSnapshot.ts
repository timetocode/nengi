import { ChannelType, hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'
import { BinarySection } from '../../common/binary/BinarySection'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { User } from '../User'
import { ChannelHeaderUpdate } from '../../binary/snapshot/SnapshotPlan'
import {
    SnapshotChunk
} from '../../binary/snapshot/SnapshotChunk'
import {
    countEcsManualUpdateBytes,
    countManualGroupedProps,
    EcsManualUpdateLog,
    getManualUpdateFragment,
    ManualUpdateFragment,
    writeEcsManualUpdates
} from '../../binary/snapshot/manualUpdates'
import { createChannelScopeChunk, createPayloadCopyChunk } from '../../binary/snapshot/snapshotChunkBuilders'
import {
    countChannelHeaderUpdateSection,
    countEcsCreateComponentSection,
    countMessageSection,
    countNetworkIdSection
} from '../../binary/snapshot/countSnapshotBytes'
import {
    writeChannelHeaderUpdateSection,
    writeEcsCreateComponentSection,
    writeNetworkIdSection,
    writeMessageSection
} from '../../binary/snapshot/writeSnapshot'
import type {
    EcsChannel2D,
    EcsChannelVisibilityGroup,
    EcsChannelUserSnapshot
} from './EcsChannel2D'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'

export type EcsChannelSnapshotChannel = {
    nid: number
    channelType: ChannelType
    ecsCulledChannelMode: true
    header: any
    headerVersion: number
    createdRoots: number[]
    deletedEntities: number[]
    createdComponents: any[]
    deletedComponents: number[]
    prepareVisibilityPlan(tick: number): any
    getChannelSnapshot(user: User, tick: number): EcsChannelUserSnapshot | null
    getVisibleCellKeys(userId: number): string[]
    getManualCellUpdateLog(cellKey: string): any
    cellHasManualUpdates(cellKey: string): boolean
    isRootNid(nid: number): boolean
    isComponentNid(nid: number): boolean
    getComponent(nid: number): any
}

type EcsChannelVisibilityFrame = {
    ecsCreateEntities: number[]
    ecsCreateComponents: any[]
    ecsDeleteEntities: number[]
    deleteEntities: number[]
}

type EcsChannelChannelSections = {
    headerVersion?: number
    headerUpdates: ChannelHeaderUpdate[]
    messages: any[]
    interpolatedMessages: any[]
}

function collectChannelHeaderUpdate(
    user: User,
    instance: Instance,
    channel: EcsChannelSnapshotChannel
) {
    const header = channel.header
    const headerVersion = channel.headerVersion || 0
    if (!hasSchemaBackedChannelHeader(header) || headerVersion <= 0) {
        return {}
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
        return { headerVersion }
    }

    if (knownVersion >= headerVersion) {
        return {}
    }

    const diffs = instance.cache.getAndDiffGrouped(instance.tick, header, nschema)
    if (diffs.changes.length === 0 && diffs.groups.length === 0) {
        return { headerVersion }
    }
    return {
        headerVersion,
        headerUpdate: {
            channelId: channel.nid,
            changes: diffs.changes,
            groups: diffs.groups
        }
    }
}

export function isEcsChannel2D(channel: any): channel is EcsChannel2D {
    return isEcsChannelChannel(channel) &&
        channel.channelType === ChannelType.EcsChannel2D
}

export function isEcsChannelChannel(channel: any): channel is EcsChannelSnapshotChannel {
    return channel?.ecsCulledChannelMode === true &&
        typeof channel.nid === 'number' &&
        typeof channel.prepareVisibilityPlan === 'function' &&
        typeof channel.getChannelSnapshot === 'function' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getManualCellUpdateLog === 'function' &&
        typeof channel.cellHasManualUpdates === 'function'
}

export function getSingleEcsChannel2D(user: User) {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isEcsChannel2D(channel) ? channel : null
}

function collectScopedChannelMessages(user: User, channelId: number, messages: any[], interpolatedMessages: any[]) {
    for (let i = user.scopedMessageQueue.length - 1; i >= 0; i--) {
        const queued = user.scopedMessageQueue[i]
        if (queued.channelId !== channelId) {
            continue
        }
        messages.push(queued.message)
        user.scopedMessageQueue.splice(i, 1)
    }
    for (let i = user.scopedInterpolatedMessageQueue.length - 1; i >= 0; i--) {
        const queued = user.scopedInterpolatedMessageQueue[i]
        if (queued.channelId !== channelId) {
            continue
        }
        interpolatedMessages.push(queued.message)
        user.scopedInterpolatedMessageQueue.splice(i, 1)
    }
}

function collectEcsChannelChannelSections(
    user: User,
    instance: Instance,
    channel: EcsChannelSnapshotChannel
) {
    const sections: EcsChannelChannelSections = {
        headerUpdates: [],
        messages: [],
        interpolatedMessages: []
    }
    const header = collectChannelHeaderUpdate(user, instance, channel)
    if (header.headerVersion !== undefined) {
        sections.headerVersion = header.headerVersion
    }
    if (header.headerUpdate) {
        sections.headerUpdates.push(header.headerUpdate)
    }
    collectScopedChannelMessages(user, channel.nid, sections.messages, sections.interpolatedMessages)
    return sections
}

function hasChannelSectionsContent(sections: EcsChannelChannelSections) {
    return sections.headerUpdates.length > 0 ||
        sections.messages.length > 0 ||
        sections.interpolatedMessages.length > 0
}

function countChannelSections(sections: EcsChannelChannelSections, instance: Instance, protocol: ProtocolConfig) {
    return countChannelHeaderUpdateSection(sections.headerUpdates, protocol) +
        countMessageSection(sections.messages, instance.context, protocol) +
        countMessageSection(sections.interpolatedMessages, instance.context, protocol)
}

function writeChannelSections(
    sections: EcsChannelChannelSections,
    instance: Instance,
    writer: any,
    protocol: ProtocolConfig
) {
    writeChannelHeaderUpdateSection(sections.headerUpdates, writer, protocol)
    writeMessageSection(BinarySection.Messages, sections.messages, instance.context, writer, protocol)
    writeMessageSection(BinarySection.InterpolatedMessages, sections.interpolatedMessages, instance.context, writer, protocol)
}

function countChannelSectionGroupedProps(sections: EcsChannelChannelSections) {
    let props = 0
    for (let i = 0; i < sections.headerUpdates.length; i++) {
        const groups = sections.headerUpdates[i].groups
        for (let j = 0; j < groups.length; j++) {
            props += groups[j].group.props.length
        }
    }
    return props
}

function collectVisibilityFrame(channel: EcsChannelSnapshotChannel, snapshot: EcsChannelUserSnapshot): EcsChannelVisibilityFrame {
    const frame: EcsChannelVisibilityFrame = {
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

    for (let i = 0; i < snapshot.toDelete.length; i++) {
        const nid = snapshot.toDelete[i]
        if (channel.isRootNid(nid)) {
            frame.ecsDeleteEntities.push(nid)
        } else if (channel.isComponentNid(nid)) {
            frame.deleteEntities.push(nid)
        }
    }

    return frame
}

function hasVisibilityFrameContent(frame: EcsChannelVisibilityFrame) {
    return frame.ecsCreateEntities.length > 0 ||
        frame.ecsCreateComponents.length > 0 ||
        frame.ecsDeleteEntities.length > 0 ||
        frame.deleteEntities.length > 0
}

function countVisibilityFrame(frame: EcsChannelVisibilityFrame, instance: Instance, protocol: ProtocolConfig) {
    return countNetworkIdSection(frame.ecsCreateEntities, protocol) +
        countEcsCreateComponentSection(frame.ecsCreateComponents, instance.context, protocol) +
        countNetworkIdSection(frame.ecsDeleteEntities, protocol) +
        countNetworkIdSection(frame.deleteEntities, protocol)
}

function writeVisibilityFrame(frame: EcsChannelVisibilityFrame, instance: Instance, protocol: ProtocolConfig, writer: any) {
    writeNetworkIdSection(BinarySection.EcsCreateEntities, frame.ecsCreateEntities, writer, protocol)
    writeEcsCreateComponentSection(frame.ecsCreateComponents, instance.context, writer, protocol)
    writeNetworkIdSection(BinarySection.EcsDeleteEntities, frame.ecsDeleteEntities, writer, protocol)
    writeNetworkIdSection(BinarySection.DeleteEntities, frame.deleteEntities, writer, protocol)
}

function copyVisibleLiveManualLog(
    channel: EcsChannelSnapshotChannel,
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

function getEcsChannelCellUpdateFragment(
    user: User,
    instance: Instance,
    channel: EcsChannelSnapshotChannel,
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
    return getManualUpdateFragment(user, instance, { nid: channel.nid, ...filtered }, `ecs-channel:${cellKey}`)
}

function mergeVisibleCellLogs(channel: EcsChannelSnapshotChannel, cellKeys: string[]) {
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

function getEcsChannelGroupUpdateFragment(
    user: User,
    instance: Instance,
    channel: EcsChannelSnapshotChannel,
    group: EcsChannelVisibilityGroup
) {
    if (group.sharedUpdateFragment) {
        instance.network.recordSharedFragmentHit()
        return group.sharedUpdateFragment
    }

    const merged = mergeVisibleCellLogs(channel, group.visibleCellKeys)
    if (merged.manualPropNids.length === 0 && merged.manualGroupNids.length === 0) {
        return null
    }
    const fragment = getManualUpdateFragment(user, instance, { nid: channel.nid, ...merged }, `ecs-channel-group:${group.cellSignature}`)
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

export function createEcsCulledChannelOutput(
    user: User,
    instance: Instance,
    channel: EcsChannelSnapshotChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const snapshot = channel.getChannelSnapshot(user, instance.tick)
    if (!snapshot) {
        throw new Error(`EcsChannel2D missing snapshot state for user ${user.id}.`)
    }
    const channelSections = collectEcsChannelChannelSections(user, instance, channel)
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
        !instance.network.diagnosticBinaryWrites
        ? getEcsChannelGroupUpdateFragment(user, instance, channel, snapshot.group)
        : null
    if (groupFragment) {
        updateFragments.push(groupFragment)
    } else {
        for (let i = 0; i < snapshot.group.visibleCellKeys.length; i++) {
            const cellKey = snapshot.group.visibleCellKeys[i]
            if (!channel.cellHasManualUpdates(cellKey)) {
                continue
            }
            const fragment = instance.network.sharedUpdateFragmentsEnabled && !instance.network.diagnosticBinaryWrites
                ? getEcsChannelCellUpdateFragment(user, instance, channel, cellKey, blockedNids)
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

    const chunks: SnapshotChunk[] = []
    if (hasChannelSectionsContent(channelSections)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push({
            label: 'EcsChannelChannelSections',
            bytes: countChannelSections(channelSections, instance, protocol),
            write(writer) {
                writeChannelSections(channelSections, instance, writer, protocol)
            }
        })
    }
    if (hasVisibilityFrameContent(visibilityFrame)) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push({
            label: 'EcsChannelVisibilityFrame',
            bytes: countVisibilityFrame(visibilityFrame, instance, protocol),
            write(writer) {
                writeVisibilityFrame(visibilityFrame, instance, protocol, writer)
            }
        })
    }
    for (let i = 0; i < updateFragments.length; i++) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(createPayloadCopyChunk(
            'EcsChannelUpdateFragment',
            instance,
            updateFragments[i].payload,
            updateFragments[i].bytes
        ))
    }
    for (let i = 0; i < directLogs.length; i++) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push({
            label: 'EcsChannelManualUpdates',
            bytes: countEcsManualUpdateBytes(directLogs[i], protocol),
            write(writer) {
                writeEcsManualUpdates(directLogs[i], writer, protocol)
            }
        })
    }

    const directCounts = countDirectManualFragments(directLogs)

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: {
            creates: visibilityFrame.ecsCreateEntities.length + visibilityFrame.ecsCreateComponents.length,
            updateProps: directCounts.props + updateFragments.reduce((total, fragment) => total + fragment.updateProps, 0),
            updateGroups: directCounts.groups + updateFragments.reduce((total, fragment) => total + fragment.updateGroups, 0),
            groupedUpdateProps: directCounts.groupedProps +
                updateFragments.reduce((total, fragment) => total + fragment.groupedUpdateProps, 0) +
                countChannelSectionGroupedProps(channelSections),
            deletes: visibilityFrame.ecsDeleteEntities.length + visibilityFrame.deleteEntities.length,
            messages: channelSections.messages.length + channelSections.interpolatedMessages.length,
            usedSharedFragments: updateFragments.length > 0
        },
        commit() {
            if (channelSections.headerVersion !== undefined) {
                user.knownChannelHeaderVersions.set(channel.nid, channelSections.headerVersion)
            }
        }
    })
}
