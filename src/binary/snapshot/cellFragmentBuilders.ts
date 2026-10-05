import { assertBinaryWriteSize } from '../assertBinaryWriteSize'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { ProtocolConfig } from '../../common/binary/Protocol'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot } from './writeSnapshot'
import { createEmptySnapshotPlan, EMPTY_SNAPSHOT_PLAN } from './SnapshotPlan'
import { CellFragmentChannel, isManualCellFragmentChannel, ManualCellFragmentChannel } from './channelModes'
import { CellEntityFragment } from './cellEntityFragments'
import {
    collectCreateEntitiesForRoots,
    collectNidsForRoots,
    collectSpatialCellUpdatePlan
} from './entitySnapshotPlans'
import {
    countManualGroupedProps,
    countManualUpdateBytes,
    ManualUpdateLog,
    writeManualUpdates
} from './manualUpdates'

export function getCellCreateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, protocol = instance.network.getProtocol()): CellEntityFragment {
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
    assertBinaryWriteSize(writer, bytes, 'Cell entity creates')
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

export function getCellDeleteFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, nids: readonly number[], protocol = instance.network.getProtocol()): CellEntityFragment {
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
    const plan = { ...EMPTY_SNAPSHOT_PLAN, deleteEntities: nids }
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
    assertBinaryWriteSize(writer, bytes, 'Cell entity deletes')
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
    channel: ManualCellFragmentChannel,
    cellKey: string,
    includeNids = true,
    protocol: ProtocolConfig = instance.network.getProtocol()
): CellEntityFragment {
    // A prepared plan is discarded by writes, structural changes and cleanup,
    // and is rebuilt for hierarchy changes. Its cache can precede live filtering.
    // Custom channel implementations without that lifetime keep the uncached path.
    const prepared = channel.prepareVisibilityPlan?.(instance.tick)
    const cache = prepared ? (prepared.cellUpdateFragments ??= new Map<string, CellEntityFragment>()) : undefined
    const key = `${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = cache?.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached
    }

    const cellNids = collectNidsForRoots(instance, channel.getCellEntities(cellKey))
    const cellLog = channel.getManualCellUpdateLog(cellKey)
    const log = cellLog ? filterManualCellUpdateLog(cellLog, cellNids) : null
    if (!log || (log.manualPropNids.length === 0 && log.manualGroupNids.length === 0)) {
        const writer = user.networkAdapter.binary.createWriter(0)
        assertBinaryWriteSize(writer, 0, 'Empty manual cell updates')
        const fragment: CellEntityFragment = {
            payload: writer.payload,
            bytes: 0,
            nids: new Set<number>(),
            creates: 0,
            deletes: 0,
            updateProps: 0,
            updateGroups: 0,
            groupedUpdateProps: 0
        }
        cache?.set(key, fragment)
        return fragment
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
    assertBinaryWriteSize(writer, bytes, 'Manual cell updates')
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        nids: includeNids ? cellNids : new Set<number>(),
        creates: 0,
        deletes: 0,
        updateProps: log.manualPropNids.length,
        updateGroups: log.manualGroupNids.length,
        groupedUpdateProps: measure ? countManualGroupedProps(log) : 0
    }
    cache?.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

function filterManualCellUpdateLog(log: ManualUpdateLog, liveNids: Set<number>): ManualUpdateLog {
    let needsFilter = false
    for (let i = 0; i < log.manualPropNids.length; i++) {
        if (!liveNids.has(log.manualPropNids[i])) {
            needsFilter = true
            break
        }
    }
    for (let i = 0; !needsFilter && i < log.manualGroupNids.length; i++) {
        if (!liveNids.has(log.manualGroupNids[i])) {
            needsFilter = true
        }
    }
    if (!needsFilter) {
        return log
    }

    const filtered: ManualUpdateLog = {
        manualPropNids: [],
        manualPropSchemas: [],
        manualPropValues: [],
        manualGroupNids: [],
        manualGroupSchemas: [],
        manualGroupValueOffsets: [],
        manualGroupValues: []
    }
    for (let i = 0; i < log.manualPropNids.length; i++) {
        if (!liveNids.has(log.manualPropNids[i])) {
            continue
        }
        filtered.manualPropNids.push(log.manualPropNids[i])
        filtered.manualPropSchemas.push(log.manualPropSchemas[i])
        filtered.manualPropValues.push(log.manualPropValues[i])
    }
    for (let i = 0; i < log.manualGroupNids.length; i++) {
        const nid = log.manualGroupNids[i]
        const group = log.manualGroupSchemas[i]
        let offset = log.manualGroupValueOffsets[i]
        if (!liveNids.has(nid)) {
            continue
        }
        filtered.manualGroupNids.push(nid)
        filtered.manualGroupSchemas.push(group)
        filtered.manualGroupValueOffsets.push(filtered.manualGroupValues.length)
        for (let j = 0; j < group.props.length; j++) {
            filtered.manualGroupValues.push(log.manualGroupValues[offset++])
        }
    }
    return filtered
}

export function getCellUpdateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, includeNids = true, protocol = instance.network.getProtocol()): CellEntityFragment {
    if (isManualCellFragmentChannel(channel)) {
        return getManualSpatialCellUpdateFragment(user, instance, channel, cellKey, includeNids, protocol)
    }

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
    assertBinaryWriteSize(writer, bytes, 'Cell entity updates')
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
        groupedUpdateProps: measure ? plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0) : 0
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

export function cellMayHaveUpdates(channel: CellFragmentChannel, cellKey: string) {
    if (isManualCellFragmentChannel(channel)) {
        return channel.cellHasManualUpdates(cellKey)
    }
    return true
}
