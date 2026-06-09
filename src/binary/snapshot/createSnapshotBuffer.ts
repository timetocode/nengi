import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { IChannel } from '../../server/channel/IChannel'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { collectSnapshotPlan, MAX_RESPONSES_PER_FRAME } from './collectSnapshotPlan'
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
    isManualUpdateChannel,
    isManualSpatialCellFragmentChannel,
    ManualSpatialCellFragmentChannel,
    ManualUpdateChannel,
    SharedUpdateChannel
} from './channelModes'
import {
    collectBroadcastMessages,
    getSharedMessageFragments,
    sumSharedMessageFragmentBytes,
    sumSharedMessageFragmentMessages,
    writeSharedMessageFragments
} from './messageFragments'
import { writePayload } from './snapshotPayload'

type EntityDeltaFragments = {
    creates: {
        payload: BinaryPayload
        bytes: number
        creates: number
        nids: Set<number>
    } | null
    deletes: {
        payload: BinaryPayload
        bytes: number
        deletes: number
        nids: Set<number>
    } | null
}

type CellEntityFragment = {
    payload: BinaryPayload
    bytes: number
    nids: Set<number>
    creates: number
    deletes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

function collectEnvelopePlan(user: User) {
    const plan = createEmptySnapshotPlan()
    const queuedResponses = user.responseQueue.length
    addEnvelopeQueues(plan, user)
    return { plan, queuedResponses }
}

function addEnvelopeQueues(plan: SnapshotPlan, user: User) {
    plan.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    plan.messages = user.messageQueue
    user.messageQueue = []
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
}

function createPayloadCopyChunk(label: string, instance: Instance, payload: BinaryPayload, bytes: number): SnapshotChunk {
    return createSnapshotChunk(label, bytes, writer => {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, bytes)
        }
    })
}

function createSharedMessageFragmentChunk(instance: Instance, messageFragments: ReturnType<typeof getSharedMessageFragments>) {
    const bytes = sumSharedMessageFragmentBytes(messageFragments)
    if (bytes === 0) {
        return null
    }
    return createSnapshotChunk('MessageFragments', bytes, writer => {
        writeSharedMessageFragments(writer, instance, messageFragments)
    })
}

function createCellFragmentChunk(label: string, instance: Instance, fragments: CellEntityFragment[]) {
    const bytes = sumCellFragmentBytes(fragments)
    if (bytes === 0) {
        return null
    }
    return createSnapshotChunk(label, bytes, writer => {
        writeCellFragments(writer, instance, fragments)
    })
}

function canUseSharedUpdateFragment(user: User, channel: SharedUpdateChannel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.membershipVersion &&
        user.currentlyVisible.length === countChannelVisibleEntities(user.instance!, channel)
}

function channelHasHeaderPending(user: User, channel: { nid: number, header?: any, headerVersion?: number, getHeader?: () => any }) {
    const header = channel.header || channel.getHeader?.()
    const headerVersion = channel.headerVersion || 0
    if (!header || headerVersion <= 0) {
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

function canUseSharedDeltaFragments(user: User, channel: SharedUpdateChannel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.deltaBaseVersion
}

function hasChannelDeltas(channel: SharedUpdateChannel) {
    return channel.deltaBaseVersion !== channel.membershipVersion
}

function writeEntityDeltaFragments(writer: IBinaryWriter, instance: Instance, fragments: EntityDeltaFragments) {
    if (fragments.creates) {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragments.creates.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragments.creates.bytes)
        }
    }

    if (fragments.deletes) {
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragments.deletes.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragments.deletes.bytes)
        }
    }
}

function countEntityDeltaFragmentBytes(fragments: EntityDeltaFragments) {
    return (fragments.creates?.bytes || 0) + (fragments.deletes?.bytes || 0)
}

function countEntityDeltaFragmentCreates(fragments: EntityDeltaFragments) {
    return fragments.creates?.creates || 0
}

function countEntityDeltaFragmentDeletes(fragments: EntityDeltaFragments) {
    return fragments.deletes?.deletes || 0
}

function applySharedChannelDeltasToUser(user: User, channel: SharedUpdateChannel, tick: number, fragments: EntityDeltaFragments) {
    const deletedNids = fragments.deletes?.nids
    if (deletedNids) {
        for (const nid of deletedNids) {
            user.tickLastSeen.delete(nid)
        }
        user.currentlyVisible = user.currentlyVisible.filter(nid => !deletedNids.has(nid))
    }

    for (let i = 0; i < user.currentlyVisible.length; i++) {
        user.tickLastSeen.set(user.currentlyVisible[i], tick)
    }

    const createdNids = fragments.creates?.nids
    if (createdNids) {
        for (const nid of createdNids) {
            user.markVisible(nid, tick, [], [], null, [])
        }
    }

    user.lastVisibleCount = user.currentlyVisible.length
    user.sharedChannelVersions.set(channel.nid, channel.membershipVersion)
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

function collectChannelUpdatePlan(instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>): SnapshotPlan {
    const plan = createEmptySnapshotPlan()
    const entities = channel.entities.array

    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            if (excludedNids?.has(nid)) {
                return
            }
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan)
        })
    }

    return plan
}

function collectSpatialCellUpdatePlan(instance: Instance, channel: CellFragmentChannel, cellKey: string): SnapshotPlan {
    const plan = createEmptySnapshotPlan()
    const entities = channel.getCellEntities(cellKey)

    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan)
        })
    }

    return plan
}

function collectEntityUpdatePlan(instance: Instance, entity: any, plan: SnapshotPlan) {
    const nschema = instance.context.getSchema(entity.ntype)!
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema)
    for (let j = 0; j < diffs.groups.length; j++) {
        plan.updateEntityGroups.push(diffs.groups[j])
    }
    for (let j = 0; j < diffs.changes.length; j++) {
        plan.updateEntities.push(diffs.changes[j])
    }

}

function writeCellFragments(writer: IBinaryWriter, instance: Instance, fragments: CellEntityFragment[]) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
    }
}

function sumCellFragmentBytes(fragments: CellEntityFragment[]) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes
    }
    return bytes
}

function sumCellFragmentCreates(fragments: CellEntityFragment[]) {
    let creates = 0
    for (let i = 0; i < fragments.length; i++) {
        creates += fragments[i].creates
    }
    return creates
}

function sumCellFragmentDeletes(fragments: CellEntityFragment[]) {
    let deletes = 0
    for (let i = 0; i < fragments.length; i++) {
        deletes += fragments[i].deletes
    }
    return deletes
}

function sumCellFragmentUpdateProps(fragments: CellEntityFragment[]) {
    let props = 0
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].updateProps
    }
    return props
}

function sumCellFragmentUpdateGroups(fragments: CellEntityFragment[]) {
    let groups = 0
    for (let i = 0; i < fragments.length; i++) {
        groups += fragments[i].updateGroups
    }
    return groups
}

function sumCellFragmentGroupedProps(fragments: CellEntityFragment[]) {
    let props = 0
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].groupedUpdateProps
    }
    return props
}

function hasSnapshotPlanContent(plan: SnapshotPlan) {
    return plan.channelEntityCreates.length > 0 ||
        plan.channelHeaderCreates.length > 0 ||
        plan.channelHeaderUpdates.length > 0 ||
        plan.channelHeaderDeletes.length > 0 ||
        plan.ecsCreateEntities.length > 0 ||
        plan.ecsCreateComponents.length > 0 ||
        plan.ecsDeleteEntities.length > 0 ||
        plan.createEntities.length > 0 ||
        plan.updateEntities.length > 0 ||
        plan.updateEntityGroups.length > 0 ||
        plan.deleteEntities.length > 0 ||
        plan.engineMessages.length > 0 ||
        plan.messages.length > 0 ||
        plan.responses.length > 0
}

function sumPlanCreates(plans: SnapshotPlan[]) {
    let creates = 0
    for (let i = 0; i < plans.length; i++) {
        creates += plans[i].ecsCreateEntities.length + plans[i].ecsCreateComponents.length + plans[i].createEntities.length
    }
    return creates
}

function sumPlanDeletes(plans: SnapshotPlan[]) {
    let deletes = 0
    for (let i = 0; i < plans.length; i++) {
        deletes += plans[i].ecsDeleteEntities.length + plans[i].deleteEntities.length
    }
    return deletes
}

function sumPlanUpdateProps(plans: SnapshotPlan[]) {
    let updates = 0
    for (let i = 0; i < plans.length; i++) {
        updates += plans[i].updateEntities.length
    }
    return updates
}

function sumPlanUpdateGroups(plans: SnapshotPlan[]) {
    let updates = 0
    for (let i = 0; i < plans.length; i++) {
        updates += plans[i].updateEntityGroups.length
    }
    return updates
}

function sumPlanGroupedUpdateProps(plans: SnapshotPlan[]) {
    let props = 0
    for (let i = 0; i < plans.length; i++) {
        props += plans[i].updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0)
    }
    return props
}

function collectCreateEntitiesForRoots(instance: Instance, roots: any[]) {
    const createEntities: any[] = []
    const nids = new Set<number>()
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            const entity = instance.localState.getByNid(nid)
            const nschema = instance.context.getSchema(entity.ntype)!
            if (!nschema) {
                throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
            }
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema)
            }
            createEntities.push(entity)
            nids.add(nid)
        })
    }
    return { createEntities, nids }
}

function collectNidsForRoots(instance: Instance, roots: any[]) {
    const nids = new Set<number>()
    for (let i = 0; i < roots.length; i++) {
        instance.localState.forEachEntityTree(roots[i].nid, nid => {
            nids.add(nid)
        })
    }
    return nids
}

function getCellCreateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string): CellEntityFragment {
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

function getCellDeleteFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, nids: number[]): CellEntityFragment {
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

function getManualSpatialCellUpdateFragment(user: User, instance: Instance, channel: ManualSpatialCellFragmentChannel, cellKey: string, includeNids = true): CellEntityFragment {
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

function getCellUpdateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, includeNids = true): CellEntityFragment {
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

function cellMayHaveUpdates(channel: CellFragmentChannel, cellKey: string) {
    if (isManualSpatialCellFragmentChannel(channel)) {
        return channel.cellHasManualUpdates(cellKey)
    }
    return true
}

function getSharedCreateFragment(user: User, instance: Instance, channel: SharedUpdateChannel) {
    if (channel.createdRoots.length === 0) {
        return null
    }

    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:create:${channel.deltaBaseVersion}:${channel.membershipVersion}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedCreateFragments.get(key)
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
    const collected = collectCreateEntitiesForRoots(instance, channel.createdRoots)
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
        creates: plan.createEntities.length,
        nids: collected.nids
    }
    instance.network.sharedCreateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

function getSharedDeleteFragment(user: User, instance: Instance, channel: SharedUpdateChannel) {
    if (channel.deletedNids.length === 0) {
        return null
    }

    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:delete:${channel.deltaBaseVersion}:${channel.membershipVersion}:${protocol.nidType}`
    const cached = instance.network.sharedDeleteFragments.get(key)
    if (cached) {
        instance.network.recordSharedFragmentHit()
        return cached
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0
    const plan = createEmptySnapshotPlan()
    plan.deleteEntities = channel.deletedNids
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
        deletes: plan.deleteEntities.length,
        nids: new Set(plan.deleteEntities)
    }
    instance.network.sharedDeleteFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

function getEntityDeltaFragments(user: User, instance: Instance, channel: SharedUpdateChannel): EntityDeltaFragments {
    if (!instance.network.sharedUpdateFragmentsEnabled ||
        instance.network.debugBinaryWrites ||
        !canUseSharedDeltaFragments(user, channel)) {
        return { creates: null, deletes: null }
    }

    return {
        creates: getSharedCreateFragment(user, instance, channel),
        deletes: getSharedDeleteFragment(user, instance, channel)
    }
}

function removeFragmentCreatesFromPlan(plan: SnapshotPlan, fragment: EntityDeltaFragments['creates']) {
    if (!fragment) {
        return
    }
    plan.createEntities = plan.createEntities.filter(entity => !fragment.nids.has(entity.nid))
}

function removeFragmentDeletesFromPlan(plan: SnapshotPlan, fragment: EntityDeltaFragments['deletes']) {
    if (!fragment) {
        return
    }
    plan.deleteEntities = plan.deleteEntities.filter(nid => !fragment.nids.has(nid))
}

function getSharedUpdateFragment(user: User, instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:${protocol.nidType}:${protocol.ntypeType}:${excludedNids ? 'delta' : 'steady'}`
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
    const plan = collectChannelUpdatePlan(instance, channel, excludedNids)
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
        groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs, countMs, writeMs, bytes })
    return fragment
}

function addRegularCreate(plan: SnapshotPlan, instance: Instance, nid: number) {
    const entity = instance.localState.getByNid(nid)
    const nschema = instance.context.getSchema(entity.ntype)!
    if (!nschema) {
        throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
    }
    if (!instance.cache.cacheContains(nid)) {
        instance.cache.cacheify(instance.tick, entity, nschema)
    }
    plan.createEntities.push(entity)
}

function addRegularUpdate(plan: SnapshotPlan, instance: Instance, nid: number) {
    const entity = instance.localState.getByNid(nid)
    const nschema = instance.context.getSchema(entity.ntype)!
    const diffs = instance.cache.getAndDiffGrouped(instance.tick, entity, nschema)
    for (let i = 0; i < diffs.groups.length; i++) {
        plan.updateEntityGroups.push(diffs.groups[i])
    }
    for (let i = 0; i < diffs.changes.length; i++) {
        plan.updateEntities.push(diffs.changes[i])
    }
}

function addChannelHeader(plan: SnapshotPlan, user: User, instance: Instance, channel: IChannel) {
    const header = channel.header || channel.getHeader?.()
    const headerVersion = channel.headerVersion || 0
    if (!header || headerVersion <= 0) {
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
        plan.channelHeaderCreates.push({
            channelId: channel.nid,
            header,
            version: headerVersion
        })
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
            groups: diffs.groups,
            version: headerVersion
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

function channelHasHeader(channel: { header?: any, getHeader?: () => any }) {
    return !!(channel.header || channel.getHeader?.())
}

function addChannelEntityCreate(plan: SnapshotPlan, channel: { nid: number, header?: any, getHeader?: () => any }, nid: number) {
    if (!channelHasHeader(channel)) {
        return
    }
    plan.channelEntityCreates.push({
        nid,
        channelId: channel.nid
    })
}

function collectSubscribedChannelSnapshotPlan(user: User, instance: Instance, channel: IChannel) {
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick)
    const plan = createEmptySnapshotPlan()
    addChannelHeader(plan, user, instance, channel)
    plan.channelEntityCreates = channelEntityCreates

    if (isEcsSnapshotChannel(channel)) {
        for (let i = 0; i < toCreate.length; i++) {
            const nid = toCreate[i]
            if (channel.isRootNid(nid)) {
                plan.ecsCreateEntities.push(nid)
            } else if (channel.isComponentNid(nid)) {
                const component = channel.getComponent(nid)
                if (component) {
                    plan.ecsCreateComponents.push(component)
                }
            }
        }

        const deletingRoots = new Set<number>()
        for (let i = 0; i < toDelete.length; i++) {
            const nid = toDelete[i]
            if (channel.isRootNid(nid)) {
                deletingRoots.add(nid)
                plan.ecsDeleteEntities.push(nid)
            }
        }

        for (let i = 0; i < toDelete.length; i++) {
            const nid = toDelete[i]
            if (channel.isRootNid(nid)) {
                continue
            }
            const component = channel.getComponent(nid)
            if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
                continue
            }
            plan.deleteEntities.push(nid)
        }

        addEcsManualUpdates(plan, instance, channel, new Set(toUpdate))
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
    return plan
}

function collectPendingVisibilityDeletePlan(user: User) {
    const deletes = user.consumePendingVisibilityDeletes()
    const headerDeletes = user.consumePendingChannelHeaderDeletes()
    if (deletes.length === 0 && headerDeletes.length === 0) {
        return null
    }
    const plan = createEmptySnapshotPlan()
    plan.deleteEntities = deletes
    for (let i = 0; i < headerDeletes.length; i++) {
        plan.channelHeaderDeletes.push({ channelId: headerDeletes[i] })
    }
    return plan
}

function collectManualSpatialVisibilityPlan(user: User, instance: Instance, channel: ManualSpatialCellFragmentChannel) {
    const { toCreate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick)
    const plan = createEmptySnapshotPlan()
    plan.channelEntityCreates = channelEntityCreates
    for (let i = 0; i < toCreate.length; i++) {
        addRegularCreate(plan, instance, toCreate[i])
    }
    plan.deleteEntities = toDelete
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
        addChannelEntityCreate(plan, channel, nid)
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }
    for (let i = 0; i < channel.createdComponents.length; i++) {
        const nid = channel.createdComponents[i].nid
        addChannelEntityCreate(plan, channel, nid)
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }

    const visibleNids = channel.getVisibleNetworkedNids(user.id)
    user.stableVisibleRefs.set(channel.nid, visibleNids)
    user.lastVisibleCount = user.currentlyVisible.length
    addEnvelopeQueues(plan, user)
    return { plan, toUpdate: [] }
}

function removeVisibleNid(user: User, nid: number) {
    for (let i = user.currentlyVisible.length - 1; i >= 0; i--) {
        if (user.currentlyVisible[i] !== nid) {
            continue
        }
        const last = user.currentlyVisible.pop()!
        if (i < user.currentlyVisible.length) {
            user.currentlyVisible[i] = last
        }
        user.tickLastSeen.delete(nid)
        return
    }
}

function addVisibleNid(user: User, nid: number, tick: number) {
    if (user.tickLastSeen.has(nid)) {
        user.tickLastSeen.set(nid, tick)
        return
    }
    user.currentlyVisible.push(nid)
    user.tickLastSeen.set(nid, tick)
}

function collectStableEcsSpatialMovementSnapshotBase(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel) {
    const plan = createEmptySnapshotPlan()
    const moves = channel.getMovedRoots()
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i]
        const wasVisible = channel.isCellVisible(user.id, move.fromCell)
        const isVisible = channel.isCellVisible(user.id, move.toCell)
        if (wasVisible === isVisible) {
            continue
        }

        if (isVisible) {
            plan.ecsCreateEntities.push(move.pid)
            addChannelEntityCreate(plan, channel, move.pid)
            addVisibleNid(user, move.pid, instance.tick)
            const components = channel.getRootComponents(move.pid)
            for (let j = 0; j < components.length; j++) {
                plan.ecsCreateComponents.push(components[j])
                addChannelEntityCreate(plan, channel, components[j].nid)
                addVisibleNid(user, components[j].nid, instance.tick)
            }
        } else {
            plan.ecsDeleteEntities.push(move.pid)
            removeVisibleNid(user, move.pid)
            const components = channel.getRootComponents(move.pid)
            for (let j = 0; j < components.length; j++) {
                removeVisibleNid(user, components[j].nid)
            }
        }
    }

    user.lastVisibleCount = user.currentlyVisible.length
    addEnvelopeQueues(plan, user)
    return plan
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

    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick)
    plan.channelEntityCreates = channelEntityCreates

    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        if (channel.isRootNid(nid)) {
            plan.ecsCreateEntities.push(nid)
        } else if (channel.isComponentNid(nid)) {
            const component = channel.getComponent(nid)
            if (component) {
                plan.ecsCreateComponents.push(component)
            }
        }
    }

    const deletingRoots = new Set<number>()
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            deletingRoots.add(nid)
            plan.ecsDeleteEntities.push(nid)
        }
    }

    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue
        } else {
            plan.deleteEntities.push(nid)
        }
    }

    addEnvelopeQueues(plan, user)

    return { plan, toUpdate }
}

function collectEcsSnapshotPlan(user: User, instance: Instance, channel: EcsSnapshotChannel) {
    const { plan, toUpdate } = collectEcsSnapshotBase(user, instance, channel)
    addEcsManualUpdates(plan, instance, channel, new Set(toUpdate))
    return plan
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

    instance.network.queueProtocolIfChanged(user)
    const queuedResponses = user.responseQueue.length
    const base = collectEcsSnapshotBase(user, instance, channel)
    const plan = base.plan
    const protocol = instance.network.getProtocol()
    if (instance.network.debugBinaryWrites) {
        plan.messages.push(...collectBroadcastMessages(user))
    }
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

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('EcsSnapshotPlan', plan, instance.context, protocol)
    ]
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
            messages: plan.messages.length,
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

function collectEcsSpatialSnapshotBase(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel) {
    const plan = createEmptySnapshotPlan()
    if (!channel.hasStructuralDeltas() && user.stableVisibleRefs.has(channel.nid)) {
        user.lastVisibleCount = user.currentlyVisible.length
        addEnvelopeQueues(plan, user)
        return plan
    }
    if (channel.hasOnlyMovementDeltas() && user.stableVisibleRefs.has(channel.nid)) {
        return collectStableEcsSpatialMovementSnapshotBase(user, instance, channel)
    }

    const { toCreate, toDelete, channelEntityCreates } = user.checkChannelVisibility(channel, instance.tick)
    plan.channelEntityCreates = channelEntityCreates
    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        if (channel.isRootNid(nid)) {
            plan.ecsCreateEntities.push(nid)
        } else if (channel.isComponentNid(nid)) {
            const component = channel.getComponent(nid)
            if (component) {
                plan.ecsCreateComponents.push(component)
            }
        }
    }

    const deletingRoots = new Set<number>()
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            deletingRoots.add(nid)
            plan.ecsDeleteEntities.push(nid)
        }
    }

    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        if (channel.isRootNid(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue
        } else {
            plan.deleteEntities.push(nid)
        }
    }

    addEnvelopeQueues(plan, user)
    return plan
}

function getEcsSpatialCellUpdateFragment(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel, cellKey: string) {
    const log = channel.getManualCellUpdateLog(cellKey)
    if (!log) {
        return null
    }
    return getManualUpdateFragment(user, instance, { nid: channel.nid, ...log }, `ecs-spatial:${cellKey}`)
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

    instance.network.queueProtocolIfChanged(user)
    const queuedResponses = user.responseQueue.length
    const plan = collectEcsSpatialSnapshotBase(user, instance, channel)
    const protocol = instance.network.getProtocol()
    if (instance.network.debugBinaryWrites) {
        plan.messages.push(...collectBroadcastMessages(user))
    }

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

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('EcsSpatialSnapshotPlan', plan, instance.context, protocol)
    ]
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
            messages: plan.messages.length,
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
    const updateFragment = getSharedUpdateFragment(user, instance, channel, entityDeltaFragments.creates?.nids)
    if (entityDeltaFragments.creates && channelHasHeader(channel)) {
        for (const nid of entityDeltaFragments.creates.nids) {
            envelope.channelEntityCreates.push({ nid, channelId: channel.nid })
        }
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const chunks: SnapshotChunk[] = [
        createSnapshotPlanChunk('Envelope', envelope, instance.context, protocol)
    ]
    const entityDeltaFragmentBytes = countEntityDeltaFragmentBytes(entityDeltaFragments)
    if (entityDeltaFragmentBytes > 0) {
        chunks.push(createSnapshotChunk('EntityDeltaFragments', entityDeltaFragmentBytes, writer => {
            writeEntityDeltaFragments(writer, instance, entityDeltaFragments)
        }))
    }
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
    if (plan.createEntities.length > 0 && channelHasHeader(channel)) {
        for (let i = 0; i < plan.createEntities.length; i++) {
            envelope.channelEntityCreates.push({
                nid: plan.createEntities[i].nid,
                channelId: channel.nid
            })
        }
    }

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
        createSnapshotPlanChunk('ManualSpatialMovementPlan', plan, instance.context, protocol)
    ]
    const messageChunk = createSharedMessageFragmentChunk(instance, messageFragments)
    if (messageChunk) {
        chunks.push(messageChunk)
    }
    const updateChunk = createCellFragmentChunk('ManualSpatialUpdateFragments', instance, updateFragments)
    if (updateChunk) {
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
    const updateChunk = createCellFragmentChunk('StableCellUpdateFragments', instance, updateFragments)
    if (updateChunk) {
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
    const currentCellKeys = channel.getVisibleCellKeys(user.id)
    const currentCellKeySet = new Set(currentCellKeys)
    const protocol = instance.network.getProtocol()
    if (instance.network.debugBinaryWrites) {
        plan.messages.push(...collectBroadcastMessages(user))
    }

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
            messages: plan.messages.length + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

const createSnapshotBuffer = (user: User, instance: Instance) => {
    const hasPendingVisibilityDeletes = user.hasPendingVisibilityDeletes() || user.hasPendingChannelHeaderDeletes()
    const ecsSpatialChannel = getSingleEcsSpatialSnapshotChannel(user)
    const ecsChannel = getSingleEcsSnapshotChannel(user)
    const manualUpdateChannel = getSingleManualUpdateChannel(user)
    const sharedChannel = getSingleSharedChannel(user)
    const cellFragmentChannel = getSingleCellFragmentChannel(user)
    if (!hasPendingVisibilityDeletes && ecsSpatialChannel && !channelHasHeaderPending(user, ecsSpatialChannel)) {
        return user.withChannelVisibilityState(ecsSpatialChannel.nid, () =>
            createEcsSpatialSnapshotBuffer(user, instance, ecsSpatialChannel)
        )
    }

    if (!hasPendingVisibilityDeletes && ecsChannel && !channelHasHeaderPending(user, ecsChannel)) {
        return user.withChannelVisibilityState(ecsChannel.nid, () =>
            createEcsSnapshotBuffer(user, instance, ecsChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingVisibilityDeletes &&
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
        !hasPendingVisibilityDeletes &&
        manualUpdateChannel &&
        !channelHasHeaderPending(user, manualUpdateChannel) &&
        user.withChannelVisibilityState(manualUpdateChannel.nid, () => canUseSharedUpdateFragment(user, manualUpdateChannel))) {
        return user.withChannelVisibilityState(manualUpdateChannel.nid, () =>
            createManualUpdateSnapshotBuffer(user, instance, manualUpdateChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingVisibilityDeletes &&
        sharedChannel &&
        !channelHasHeaderPending(user, sharedChannel) &&
        user.withChannelVisibilityState(sharedChannel.nid, () => canUseSharedUpdateFragment(user, sharedChannel))) {
        return user.withChannelVisibilityState(sharedChannel.nid, () =>
            createSharedUpdateSnapshotBuffer(user, instance, sharedChannel)
        )
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        !hasPendingVisibilityDeletes &&
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
    if (instance.network.debugBinaryWrites) {
        envelope.messages.push(...collectBroadcastMessages(user))
    }

    const channelPlans: SnapshotPlan[] = []
    const pendingDeletePlan = collectPendingVisibilityDeletePlan(user)
    if (pendingDeletePlan) {
        channelPlans.push(pendingDeletePlan)
    }
    // Multi-channel users receive an appended stream per subscribed channel.
    // Do not reintroduce a global visibility union here; channel-specific state
    // is what preserves manual/spatial/ECS fast paths and client identities.
    for (const channel of user.subscriptions.values()) {
        const channelPlan = collectSubscribedChannelSnapshotPlan(user, instance, channel)
        if (hasSnapshotPlanContent(channelPlan)) {
            channelPlans.push(channelPlan)
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
    for (let i = 0; i < channelPlans.length; i++) {
        chunks.push(createSnapshotPlanChunk('ChannelSnapshotPlan', channelPlans[i], instance.context, protocol))
    }
    const messageFragmentBytes = sumSharedMessageFragmentBytes(messageFragments)
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
    for (let i = 0; i < channelPlans.length; i++) {
        commitSnapshotPlan(user, channelPlans[i])
    }
    instance.network.reportResponseBacklog(user, queuedResponses, envelope.responses.length)
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
            messages: envelope.messages.length + sumSharedMessageFragmentMessages(messageFragments),
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
