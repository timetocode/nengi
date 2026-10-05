import { assertBinaryWriteSize } from '../../binary/assertBinaryWriteSize'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { Instance } from '../Instance'
import { User } from '../User'
import { createEmptySnapshotPlan, EMPTY_SNAPSHOT_PLAN, SnapshotPlan } from '../../binary/snapshot/SnapshotPlan'
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
    sharedUpdateFragment?: CellEntityFragment | null
    sharedUpdateNidType?: ProtocolConfig['nidType']
    sharedUpdateNtypeType?: ProtocolConfig['ntypeType']
}

function collectVisibilityPlan(user: User, instance: Instance, channel: CellFragmentChannel, stableCells: boolean) {
    let plan: SnapshotPlan | undefined
    const isManual = isManualCellFragmentChannel(channel)
    let visibility: CellFragmentVisibility | undefined
    if (!stableCells) {
        const manualCellFirstSnapshot = isManual ?
            (channel as CellFirstManualChannel).getChannelSnapshot?.(user, instance.tick) :
            null
        visibility = manualCellFirstSnapshot || channel.collectSnapshotVisibility(user.id)
        if (visibility.toCreate.length > 0 || visibility.toDelete.length > 0 || (!isManual && visibility.toUpdate.length > 0)) {
            plan = createEmptySnapshotPlan()
            for (let i = 0; i < visibility.toCreate.length; i++) {
                addRegularCreate(plan, instance, visibility.toCreate[i])
            }
            if (!isManual) {
                for (let i = 0; i < visibility.toUpdate.length; i++) {
                    addRegularUpdate(plan, instance, visibility.toUpdate[i])
                }
            }
            plan.deleteEntities = visibility.toDelete
        }
    }
    const messageChannel = channel as CellFragmentChannel & {
        broadcastMessages?: any[]
        interpolatedBroadcastMessages?: any[]
    }
    if (user.scopedMessageQueue.length > 0 || user.scopedInterpolatedMessageQueue.length > 0 ||
        (instance.network.diagnosticBinaryWrites && messageChannel.broadcastMessages?.length) ||
        messageChannel.interpolatedBroadcastMessages?.length) {
        plan ??= createEmptySnapshotPlan()
        addChannelMessages(plan, user, messageChannel, instance.network.diagnosticBinaryWrites)
    }
    return { plan, visibility }
}

function removeCreateNidsFromPlan(plan: SnapshotPlan | undefined, nids: Set<number>) {
    if (!plan || plan.createEntities.length === 0) return
    plan.createEntities = plan.createEntities.filter(entity => !nids.has(entity.nid))
}

function removeDeleteNidsFromPlan(plan: SnapshotPlan | undefined, nids: Set<number>) {
    if (!plan || plan.deleteEntities.length === 0) return
    plan.deleteEntities = plan.deleteEntities.filter(nid => !nids.has(nid))
}

function removeUpdateNidsFromPlan(plan: SnapshotPlan | undefined, nids: Set<number>) {
    if (!plan) return
    if (plan.updateEntities.length > 0) plan.updateEntities = plan.updateEntities.filter(update => !nids.has(update.nid))
    if (plan.updateEntityGroups.length > 0) plan.updateEntityGroups = plan.updateEntityGroups.filter(update => !nids.has(update.nid))
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

function allNidsArePlannedDeletes(nids: readonly number[], plannedDeletes: Set<number>) {
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
    let merged: ManualUpdateLog | undefined

    for (let i = 0; i < group.visibleCellKeys.length; i++) {
        const log = channel.getManualCellUpdateLog(group.visibleCellKeys[i])
        if (!log) {
            continue
        }
        const visibleNids = getGroupVisibleNids(group)
        merged ??= {
            manualPropNids: [],
            manualPropSchemas: [],
            manualPropValues: [],
            manualGroupNids: [],
            manualGroupSchemas: [],
            manualGroupValueOffsets: [],
            manualGroupValues: []
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
    group: ManualCellFragmentVisibilityGroup,
    protocol: ProtocolConfig
) {
    if (group.sharedUpdateFragment !== undefined && (!group.sharedUpdateFragment ||
        (group.sharedUpdateNidType === protocol.nidType && group.sharedUpdateNtypeType === protocol.ntypeType))) {
        if (group.sharedUpdateFragment) instance.network.recordSharedFragmentHit()
        return group.sharedUpdateFragment
    }
    const log = mergeManualGroupUpdateLog(channel, group)
    if (!log || (log.manualPropNids.length === 0 && log.manualGroupNids.length === 0)) {
        // The group belongs to this tick. Remember absence as well as payloads.
        group.sharedUpdateFragment = null
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
    assertBinaryWriteSize(writer, bytes, 'Manual visibility group updates')
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
        groupedUpdateProps: measure ? countManualGroupedProps(log) : 0
    }
    group.sharedUpdateFragment = fragment
    group.sharedUpdateNidType = protocol.nidType
    group.sharedUpdateNtypeType = protocol.ntypeType
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

export function createCellFragmentChannelOutput(
    user: User,
    instance: Instance,
    channel: CellFragmentChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const isManual = isManualCellFragmentChannel(channel)
    // Membership stability does not imply unchanged properties. The existing
    // cell fragments still diff those properties once per tick across users.
    // Stability is per view: cell revisions cover root membership changes,
    // and the signature also covers hierarchy edits outside the spatial grid.
    const stableCellKeys = !isManual && !instance.network.diagnosticBinaryWrites
        ? channel.getStableVisibleCellKeys(user.id)
        : null
    const { plan, visibility } = collectVisibilityPlan(user, instance, channel, stableCellKeys !== null)
    const createFragments: CellEntityFragment[] = []
    const deleteFragments: CellEntityFragment[] = []
    const updateFragments: CellEntityFragment[] = []

    if (stableCellKeys) {
        for (let i = 0; i < stableCellKeys.length; i++) {
            const fragment = getCellUpdateFragment(user, instance, channel, stableCellKeys[i], false, protocol)
            if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                updateFragments.push(fragment)
            }
        }
    } else if (visibility) {
        const useManualGroupFragment = isManual &&
            instance.network.sharedUpdateFragmentsEnabled &&
            !instance.network.diagnosticBinaryWrites &&
            visibility.toCreate.length === 0 &&
            visibility.toDelete.length === 0 &&
            visibility.group !== undefined

        if (useManualGroupFragment) {
            const fragment = getManualGroupUpdateFragment(user, instance, channel as ManualCellFragmentChannel, visibility.group!, protocol)
            if (fragment) updateFragments.push(fragment)
        } else {
            const previousCellKeys = channel.getRememberedCellKeys(user.id)
            const previousCellKeySet = new Set(previousCellKeys)
            const previousVisible = visibility.previous
            const currentCellKeys = visibility.visibleCellKeys || channel.getVisibleCellKeys(user.id)
            for (let i = 0; i < currentCellKeys.length; i++) {
                const cellKey = currentCellKeys[i]
                if (previousCellKeySet.has(cellKey)) {
                    if (!cellMayHaveUpdates(channel, cellKey)) {
                        continue
                    }
                    const fragment = getCellUpdateFragment(user, instance, channel, cellKey, true, protocol)
                    if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                        updateFragments.push(fragment)
                        removeUpdateNidsFromPlan(plan, fragment.nids)
                    }
                    continue
                }

                if (allRootsWerePreviouslyHidden(channel, cellKey, previousVisible)) {
                    const fragment = getCellCreateFragment(user, instance, channel, cellKey, protocol)
                    if (fragment.creates > 0) {
                        createFragments.push(fragment)
                        removeCreateNidsFromPlan(plan, fragment.nids)
                    }
                } else if (isManualCellFragmentChannel(channel) && channel.cellHasManualUpdates(cellKey)) {
                    const fragment = getCellUpdateFragment(user, instance, channel, cellKey, true, protocol)
                    if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
                        updateFragments.push(fragment)
                    }
                }
            }

            if (plan && plan.deleteEntities.length > 0) {
                const currentCellKeySet = new Set(currentCellKeys)
                const plannedDeletes = new Set(plan.deleteEntities)
                for (let i = 0; i < previousCellKeys.length; i++) {
                    const cellKey = previousCellKeys[i]
                    if (currentCellKeySet.has(cellKey)) continue
                    const nids = channel.getRememberedCellNids(user.id, cellKey)
                    if (allNidsArePlannedDeletes(nids, plannedDeletes)) {
                        const fragment = getCellDeleteFragment(user, instance, channel, cellKey, nids, protocol)
                        if (fragment.deletes > 0) {
                            deleteFragments.push(fragment)
                            removeDeleteNidsFromPlan(plan, fragment.nids)
                        }
                    }
                }
            }
        }
    }

    const outputPlan = plan || EMPTY_SNAPSHOT_PLAN
    const chunks: SnapshotChunk[] = [
        createChannelScopeChunk(channel.nid, protocol),
        createSnapshotPlanChunk('CellFragmentChannelPlan', outputPlan, instance.context, protocol)
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
        stats: instance.network.snapshotPerformanceEnabled ? {
            creates: outputPlan.createEntities.length + sumCellFragmentCreates(createFragments),
            updateProps: outputPlan.updateEntities.length + sumCellFragmentUpdateProps(updateFragments),
            updateGroups: outputPlan.updateEntityGroups.length + sumCellFragmentUpdateGroups(updateFragments),
            groupedUpdateProps: outputPlan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) +
                sumCellFragmentGroupedProps(updateFragments),
            deletes: outputPlan.deleteEntities.length + sumCellFragmentDeletes(deleteFragments),
            messages: countPlanMessages(outputPlan),
            usedSharedFragments: createFragments.length > 0 || deleteFragments.length > 0 || updateFragments.length > 0
        } : null,
        commit() {
            channel.rememberSnapshotVisibility(user.id, visibility)
        }
    })
}
