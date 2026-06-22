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
import { countPlanMessages } from '../../binary/snapshot/snapshotPlanStats'
import {
    CellFragmentChannel,
    isManualCellFragmentChannel
} from '../../binary/snapshot/channelModes'
import {
    ChannelSnapshotOutput,
    createChunkedChannelSnapshotOutput
} from './ChannelSnapshotOutput'

function collectVisibilityPlan(user: User, instance: Instance, channel: CellFragmentChannel) {
    const visibility = channel.collectSnapshotVisibility(user.id)
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
    addChannelMessages(plan, user, channel as any, instance.network.debugBinaryWrites)
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

export function createCellFragmentChannelOutput(
    user: User,
    instance: Instance,
    channel: CellFragmentChannel,
    protocol: ProtocolConfig
): ChannelSnapshotOutput {
    const previousCellKeys = channel.getRememberedCellKeys(user.id)
    const previousCellKeySet = new Set(previousCellKeys)
    const { plan, visibility } = collectVisibilityPlan(user, instance, channel)
    const previousVisible = visibility.previous
    const currentCellKeys = channel.getVisibleCellKeys(user.id)
    const currentCellKeySet = new Set(currentCellKeys)
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
            channel.rememberSnapshotVisibility(user.id)
        }
    })
}
