import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { SharedUpdateChannel } from './channelModes'
import { countSnapshotBytes } from './countSnapshotBytes'
import { collectChannelUpdatePlan, collectCreateEntitiesForRoots } from './entitySnapshotPlans'
import { writePayload } from './snapshotPayload'
import { createEmptySnapshotPlan } from './SnapshotPlan'
import { writeSnapshot } from './writeSnapshot'

export type EntityDeltaFragments = {
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

export function writeEntityDeltaFragments(writer: IBinaryWriter, instance: Instance, fragments: EntityDeltaFragments) {
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

export function countEntityDeltaFragmentBytes(fragments: EntityDeltaFragments) {
    return (fragments.creates?.bytes || 0) + (fragments.deletes?.bytes || 0)
}

export function countEntityDeltaFragmentCreates(fragments: EntityDeltaFragments) {
    return fragments.creates?.creates || 0
}

export function countEntityDeltaFragmentDeletes(fragments: EntityDeltaFragments) {
    return fragments.deletes?.deletes || 0
}

export function applySharedChannelDeltasToUser(user: User, channel: SharedUpdateChannel, tick: number, fragments: EntityDeltaFragments) {
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
            user.markVisible(nid, tick, [], [])
        }
    }

    user.lastVisibleCount = user.currentlyVisible.length
    user.sharedChannelVersions.set(channel.nid, channel.membershipVersion)
}

export function canUseSharedDeltaFragments(user: User, channel: SharedUpdateChannel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.deltaBaseVersion
}

export function getEntityDeltaFragments(user: User, instance: Instance, channel: SharedUpdateChannel): EntityDeltaFragments {
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

export function getSharedUpdateFragment(user: User, instance: Instance, channel: SharedUpdateChannel, excludedNids?: Set<number>) {
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
