import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot } from './writeSnapshot'
import { createEmptySnapshotPlan } from './SnapshotPlan'
import { CellFragmentChannel, isManualSpatialCellFragmentChannel, ManualSpatialCellFragmentChannel } from './channelModes'
import { CellEntityFragment } from './cellEntityFragments'
import {
    collectCreateEntitiesForRoots,
    collectNidsForRoots,
    collectSpatialCellUpdatePlan
} from './entitySnapshotPlans'
import {
    countManualGroupedProps,
    countManualUpdateBytes,
    writeManualUpdates
} from './manualUpdates'

export function applyCellEntityFragmentsToUser(user: User, tick: number, createFragments: CellEntityFragment[], deleteFragments: CellEntityFragment[]) {
    if (deleteFragments.length > 0) {
        const deletedNids = new Set<number>()
        for (let i = 0; i < deleteFragments.length; i++) {
            for (const nid of deleteFragments[i].nids) {
                deletedNids.add(nid)
                user.tickLastSeen.delete(nid)
            }
        }
        user.currentlyVisible = user.currentlyVisible.filter(nid => !deletedNids.has(nid))
    }

    for (let i = 0; i < user.currentlyVisible.length; i++) {
        user.tickLastSeen.set(user.currentlyVisible[i], tick)
    }

    for (let i = 0; i < createFragments.length; i++) {
        for (const nid of createFragments[i].nids) {
            user.markVisible(nid, tick, [], [])
        }
    }

    user.lastVisibleCount = user.currentlyVisible.length
}

export function getCellCreateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string): CellEntityFragment {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:cell:create:${cellKey}:${channel.getCellVersion(cellKey)}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedCreateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached as CellEntityFragment
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
    const collected = collectCreateEntitiesForRoots(instance, channel.getCellEntities(cellKey))
    const plan = createEmptySnapshotPlan()
    plan.createEntities = collected.createEntities
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
        nids: collected.nids,
        creates: plan.createEntities.length,
        deletes: 0,
        updateProps: 0,
        updateGroups: 0,
        groupedUpdateProps: 0
    }
    instance.network.sharedCreateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

export function getCellDeleteFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, nids: number[]): CellEntityFragment {
    const protocol = instance.network.getProtocol()
    const nidSignature = nids.join(',')
    const key = `${instance.tick}:${channel.nid}:cell:delete:${cellKey}:${nidSignature}:${protocol.nidType}`
    const cached = instance.network.sharedDeleteFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached as CellEntityFragment
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0
    const plan = createEmptySnapshotPlan()
    plan.deleteEntities = nids
    if (measure) {
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
        nids: new Set(nids),
        creates: 0,
        deletes: nids.length,
        updateProps: 0,
        updateGroups: 0,
        groupedUpdateProps: 0
    }
    instance.network.sharedDeleteFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

export function getManualSpatialCellUpdateFragment(
    user: User,
    instance: Instance,
    channel: ManualSpatialCellFragmentChannel,
    cellKey: string,
    includeNids = true
): CellEntityFragment {
    const log = channel.getManualCellUpdateLog(cellKey)
    if (!log) {
        return {
            payload: user.networkAdapter.binary.createWriter(0).payload,
            bytes: 0,
            nids: new Set<number>(),
            creates: 0,
            deletes: 0,
            updateProps: 0,
            updateGroups: 0,
            groupedUpdateProps: 0
        }
    }

    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:manual-cell:update:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached as CellEntityFragment
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
        nids: includeNids ? collectNidsForRoots(instance, channel.getCellEntities(cellKey)) : new Set<number>(),
        creates: 0,
        deletes: 0,
        updateProps: log.manualPropNids.length,
        updateGroups: log.manualGroupNids.length,
        groupedUpdateProps: countManualGroupedProps(log)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

export function getCellUpdateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, includeNids = true): CellEntityFragment {
    if (isManualSpatialCellFragmentChannel(channel)) {
        return getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, includeNids)
    }

    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:cell:update:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached as CellEntityFragment
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
    const plan = collectSpatialCellUpdatePlan(instance, channel, cellKey)
    const nids = includeNids ? collectNidsForRoots(instance, channel.getCellEntities(cellKey)) : new Set<number>()
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
        nids,
        creates: 0,
        deletes: 0,
        updateProps: plan.updateEntities.length,
        updateGroups: plan.updateEntityGroups.length,
        groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

export function cellMayHaveUpdates(channel: CellFragmentChannel, cellKey: string) {
    if (isManualSpatialCellFragmentChannel(channel)) {
        return channel.cellHasManualUpdates(cellKey)
    }
    return true
}
