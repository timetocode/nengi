import { ProtocolConfig } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { User } from '../User'
import { createEmptySnapshotPlan, SnapshotPlan } from '../../binary/snapshot/SnapshotPlan'
import { createSnapshotPlanChunk, SnapshotChunk } from '../../binary/snapshot/SnapshotChunk'
import {
    CellEntityFragment,
    sumCellFragmentCreates,
    sumCellFragmentDeletes,
    sumCellFragmentGroupedProps,
    sumCellFragmentUpdateGroups,
    sumCellFragmentUpdateProps
} from '../../binary/snapshot/cellEntityFragments'
import {
    createCellFragmentChunk,
    createChannelScopeChunk
} from '../../binary/snapshot/snapshotChunkBuilders'
import { addChannelMessages } from '../../binary/snapshot/channelMessages'
import { addRegularCreate, addRegularUpdate } from '../../binary/snapshot/entitySnapshotPlans'
import {
    cellMayHaveUpdates,
    getCellCreateFragment,
    getCellDeleteFragment,
    getCellUpdateFragment
} from '../../binary/snapshot/cellFragmentBuilders'
import {
    countManualGroupedProps,
    countManualUpdateBytes,
    ManualUpdateLog,
    writeManualUpdates
} from '../../binary/snapshot/manualUpdates'
import { countPlanMessages } from '../../binary/snapshot/snapshotPlanStats'
import {
    CellFragmentChannel,
    isManualCellFragmentChannel,
    ManualCellFragmentChannel
} from '../../binary/snapshot/channelModes'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'

type CellFragmentVisibility = {
    toCreate: number[]
    toUpdate: number[]
    toDelete: number[]
    previous: Set<number>
    visibleCellKeys?: string[]
    group?: ManualCellFragmentVisibilityGroup
}

type CellFirstManualChannel = CellFragmentChannel & {
    getChannelSnapshot?(user: User, tick: number): CellFragmentVisibility | null
}

type ManualCellFragmentVisibilityGroup = {
    cellSignature: string
    visibleCellKeys: string[]
    visibleNids: number[]
    visibleNidSet?: Set<number>
    sharedUpdateFragment?: CellEntityFragment
}

function collectVisibilityPlan(user: User, instance: Instance, channel: CellFragmentChannel) {
    const manualCellFirstSnapshot = isManualCellFragmentChannel(channel) ?
        (channel as CellFirstManualChannel).getChannelSnapshot?.(user, instance.tick) :
        null
    const visibility: CellFragmentVisibility = manualCellFirstSnapshot || channel.collectSnapshotVisibility(user.id)
    const plan = createEmptySnapshotPlan()
    const isManual = isManualCellFragmentChannel(channel)
    for (let i = 0; i < visibility.toCreate.length; i++) {
        addRegularCreate(plan, instance, visibility.toCreate[i])
    }
    if (!isManual) {
        for (let i = 0; i < visibility.toUpdate.length; i++) {
            addRegularUpdate(plan, instance, visibility.toUpdate[i])
        }
    }
    plan.deleteEntities = visibility.toDelete
    addChannelMessages(plan, user, channel as any, instance.network.diagnosticBinaryWrites)
    return { plan, visibility }
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

function getGroupVisibleNids(group: ManualCellFragmentVisibilityGroup) {
    if (!group.visibleNidSet) {
        group.visibleNidSet = new Set(group.visibleNids)
    }
    return group.visibleNidSet
}

function mergeManualGroupUpdateLog(channel: ManualCellFragmentChannel, group: ManualCellFragmentVisibilityGroup) {
    const visibleNids = getGroupVisibleNids(group)
    const merged: ManualUpdateLog = {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    }

    for (let i = 0; i < group.visibleCellKeys.length; i++) {
        const log = channel.getManualCellUpdateLog(group.visibleCellKeys[i])
        if (!log) {
            continue
        }
        for (let j = 0; j < log.manualPropNids.length; j++) {
            const nid = log.manualPropNids[j]
            if (!visibleNids.has(nid)) {
                continue
            }
            merged.manualPropNids.push(nid)
            merged.manualPropSchemas.push(log.manualPropSchemas[j])
            merged.manualPropValues.push(log.manualPropValues[j])
        }
        for (let j = 0; j < log.manualGroupNids.length; j++) {
            const nid = log.manualGroupNids[j]
            const updateGroup = log.manualGroupSchemas[j]
            let offset = log.manualGroupValueOffsets[j]
            if (!visibleNids.has(nid)) {
                continue
            }
            merged.manualGroupNids.push(nid)
            merged.manualGroupSchemas.push(updateGroup)
            merged.manualGroupValueOffsets.push(merged.manualGroupValues.length)
            for (let k = 0; k < updateGroup.props.length; k++) {
                merged.manualGroupValues.push(log.manualGroupValues[offset++])
            }
        }
    }

    return merged
}

function getManualGroupUpdateFragment(
    user: User,
    instance: Instance,
    channel: ManualCellFragmentChannel,
    group: ManualCellFragmentVisibilityGroup
) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:manual-group:update:${group.cellSignature}:${protocol.nidType}:${protocol.ntypeType}`
    if (group.sharedUpdateFragment) {
        instance.network.recordSharedFragmentHit()
        return group.sharedUpdateFragment
    }
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        group.sharedUpdateFragment = cached as CellEntityFragment
        return group.sharedUpdateFragment
    }

    const log = mergeManualGroupUpdateLog(channel, group)
    if (log.manualPropNids.length === 0 && log.manualGroupNids.length === 0) {
        return null
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0

    if (measure) {
        countStart = performance.now()
    }
    const bytes = countManualUpdateBytes(log, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeManualUpdates(log, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        nids: new Set<number>(),
        creates: 0,
        deletes: 0,
        updateProps: log.manualPropNids.length,
        updateGroups: log.manualGroupNids.length,
        groupedUpdateProps: countManualGroupedProps(log)
    }
    group.sharedUpdateFragment = fragment
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

export function createCellFragmentChannelOutput(
    user: User,
    instance: Instance,
    channel: CellFragmentChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const previousCellKeys = channel.getRememberedCellKeys(user.id)
    const previousCellKeySet = new Set(previousCellKeys)
    const { plan, visibility } = collectVisibilityPlan(user, instance, channel)
    const isManual = isManualCellFragmentChannel(channel)
    const previousVisible = visibility.previous
    const currentCellKeys = visibility.visibleCellKeys || channel.getVisibleCellKeys(user.id)
    const currentCellKeySet = new Set(currentCellKeys)
    const createFragments: CellEntityFragment[] = []
    const deleteFragments: CellEntityFragment[] = []
    const updateFragments: CellEntityFragment[] = []
    const plannedDeletes = new Set(plan.deleteEntities)
    const manualGroupUpdateFragment = isManual &&
        instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.diagnosticBinaryWrites &&
        visibility.toCreate.length === 0 &&
        visibility.toDelete.length === 0 &&
        visibility.group
        ? getManualGroupUpdateFragment(user, instance, channel as ManualCellFragmentChannel, visibility.group)
        : null

    if (manualGroupUpdateFragment) {
        updateFragments.push(manualGroupUpdateFragment)
    } else {
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

            if (allRootsWerePreviouslyHidden(channel, cellKey, previousVisible)) {
                const fragment = getCellCreateFragment(user, instance, channel, cellKey)
                if (fragment.creates > 0) {
                    createFragments.push(fragment)
                    removeCreateNidsFromPlan(plan, fragment.nids)
                }
            } else if (isManualCellFragmentChannel(channel) && channel.cellHasManualUpdates(cellKey)) {
                const fragment = getCellUpdateFragment(user, instance, channel, cellKey)
                if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                    updateFragments.push(fragment)
                }
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

    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('CellFragmentChannelPlan', plan, instance.context, protocol)
    ]
    const createChunk = createCellFragmentChunk('CellFragmentCreates', instance, createFragments)
    if (createChunk) {
        chunks.push(createChunk)
    }
    const deleteChunk = createCellFragmentChunk('CellFragmentDeletes', instance, deleteFragments)
    if (deleteChunk) {
        chunks.push(deleteChunk)
    }
    const updateChunk = createCellFragmentChunk('CellFragmentUpdates', instance, updateFragments)
    if (updateChunk) {
        chunks.push(createChannelScopeChunk(channel.nid, protocol))
        chunks.push(updateChunk)
    }

    return createChunkedChannelSnapshotOutput({
        channelId: channel.nid,
        chunks,
        stats: {
            creates: plan.createEntities.length + sumCellFragmentCreates(createFragments),
            updateProps: plan.updateEntities.length + sumCellFragmentUpdateProps(updateFragments),
            updateGroups: plan.updateEntityGroups.length + sumCellFragmentUpdateGroups(updateFragments),
            groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) +
                sumCellFragmentGroupedProps(updateFragments),
            deletes: plan.deleteEntities.length + sumCellFragmentDeletes(deleteFragments),
            messages: countPlanMessages(plan),
            usedSharedFragments: createFragments.length > 0 || deleteFragments.length > 0 || updateFragments.length > 0
        },
        commit() {
            channel.rememberSnapshotVisibility(user.id, visibility)
        }
    })
}
