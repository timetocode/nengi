import { Instance } from '../../server/Instance'
import { Channel } from '../../server/Channel'
import { User } from '../../server/User'
import { BinarySection } from '../../common/binary/BinarySection'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { MutationMode } from '../../server/LocalState'
import { ProtocolConfig, byteSizeOfNetworkType, writeNetworkId } from '../../common/binary/Protocol'
import { collectSnapshotPlan, MAX_RESPONSES_PER_FRAME } from './collectSnapshotPlan'
import { commitSnapshotPlan } from './commitSnapshotPlan'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot, writeSnapshotDebug } from './writeSnapshot'
import { createBinaryDebugError } from '../BinaryDebugError'
import { createEmptySnapshotPlan, SnapshotPlan } from './SnapshotPlan'
import { SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'

type SharedUpdateChannel = Channel & {
    entityNids: number[]
    membershipVersion: number
    deltaBaseVersion: number
    createdRoots: any[]
    deletedNids: number[]
}

type SharedMessageChannel = {
    nid: number
    broadcastMessages: any[]
}

type MutationUpdateChannel = SharedUpdateChannel & {
    mutationChannelMode: true
    mutationMode: MutationMode
    dirtyNids: Set<number>
    propMutations: Map<number, Set<string>>
    groupMutations: Map<number, Set<string>>
}

type TrustedMutationUpdateChannel = SharedUpdateChannel & {
    trustedMutationChannelMode: true
} & TrustedMutationUpdateLog

type TrustedMutationUpdateLog = {
    trustedPropNids: number[]
    trustedPropSchemas: SchemaProp[]
    trustedPropValues: any[]
    trustedGroupNids: number[]
    trustedGroupSchemas: SchemaUpdateGroup[]
    trustedGroupValueOffsets: number[]
    trustedGroupValues: any[]
}

type EcsTrustedMutationUpdateLog = TrustedMutationUpdateLog & {
    trustedGroupNTypes: number[]
}

type EcsSnapshotChannel = EcsTrustedMutationUpdateLog & {
    ecsChannelMode: true
    nid: number
    clientIdentity?: any
    broadcastMessages: any[]
    createdRoots: number[]
    deletedRoots: number[]
    createdComponents: any[]
    deletedComponents: number[]
    rootDeletedComponents: number[]
    trustedGroupNTypes: number[]
    getVisibleNetworkedNids(userId: number): number[]
    hasStructuralDeltas(): boolean
    isRootNid(nid: number): boolean
    isComponentNid(nid: number): boolean
    isRootDeletedComponentNid(nid: number): boolean
    getComponent(nid: number): any
}

type EcsSpatialSnapshotChannel = EcsSnapshotChannel & {
    ecsSpatialChannelMode: true
    dirtyCells: Set<string>
    getVisibleCellKeys(userId: number): string[]
    getTrustedCellUpdateLog(cellKey: string): EcsTrustedMutationUpdateLog | null
    cellHasTrustedUpdates(cellKey: string): boolean
    getMovedRoots(): { pid: number, fromCell: string, toCell: string }[]
    hasOnlyMovementDeltas(): boolean
    isCellVisible(userId: number, key: string): boolean
    getRootComponents(pid: number): any[]
}

type TrustedSpatialCellFragmentChannel = CellFragmentChannel & {
    trustedMutationSpatialMode: true
    dirtyCells: Set<string>
    getTrustedCellUpdateLog(cellKey: string): TrustedMutationUpdateLog | null
    cellHasTrustedUpdates(cellKey: string): boolean
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

type SpatialCellChannel = {
    nid: number
    cellVisibilityMode: true
    membershipVersion: number
    fragmentCellLimit: number
    dirtyCells: Set<string>
    getVisibleCellKeys(userId: number): string[]
    getVisibleEntities(userId: number): number[]
    getCellEntities(key: string): any[]
    getUserViewVersion(userId: number): number
    getVisibleCellVersionSignature(userId: number): string
}

type CellFragmentChannel = {
    nid: number
    clientIdentity?: any
    cellFragmentMode: true
    membershipVersion: number
    fragmentCellLimit: number
    stableFragmentCellLimit: number
    getVisibleCellKeys(userId: number): string[]
    getVisibleEntities(userId: number): number[]
    getCellEntities(key: string): any[]
    getCellEntityNids(key: string): number[]
    getCellVersion(key: string): number
    getRememberedCellKeys(userId: number): string[]
    getRememberedCellNids(userId: number, key: string): number[]
    hasStableRememberedCells(userId: number): boolean
    getStableVisibleCellKeys(userId: number): string[] | null
    rememberVisibleCells(userId: number): void
    getMovedRoots(): { entity: any, fromCell: string, toCell: string }[]
    hasStructuralDeltas(): boolean
}

type MutationCellFragmentChannel = CellFragmentChannel & {
    mutationCellFragmentMode: true
    mutationMode: MutationMode
    dirtyNids: Set<number>
    propMutations: Map<number, Set<string>>
    groupMutations: Map<number, Set<string>>
    getDirtyNidsForCell(cellKey: string): Set<number>
    shouldFullScanDirtyCell(cellKey: string): boolean
}

type MessageFragment = {
    payload: BinaryPayload
    bytes: number
    messages: number
}

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

type TrustedUpdateFragment = {
    payload: BinaryPayload
    bytes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

function payloadBytes(payload: BinaryPayload) {
    if (payload instanceof Uint8Array) {
        return payload
    }
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload)
    }
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
}

function writePayload(writer: IBinaryWriter, payload: BinaryPayload) {
    writer.writeBytes(payloadBytes(payload))
}

function isSharedUpdateChannel(channel: any): channel is SharedUpdateChannel {
    return Array.isArray(channel.entityNids) &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.deltaBaseVersion === 'number' &&
        Array.isArray(channel.createdRoots) &&
        Array.isArray(channel.deletedNids) &&
        channel.entities?.array
}

function isSharedMessageChannel(channel: any): channel is SharedMessageChannel {
    return Array.isArray(channel.broadcastMessages)
}

function isMutationUpdateChannel(channel: any): channel is MutationUpdateChannel {
    const candidate = channel as any
    return isSharedUpdateChannel(channel) &&
        candidate?.mutationChannelMode === true &&
        (candidate.mutationMode === 'implicit' ||
            candidate.mutationMode === 'dirtyEntity' ||
            candidate.mutationMode === 'explicit') &&
        candidate.dirtyNids instanceof Set &&
        candidate.propMutations instanceof Map &&
        candidate.groupMutations instanceof Map
}

function isTrustedMutationUpdateChannel(channel: any): channel is TrustedMutationUpdateChannel {
    const candidate = channel as any
    return isSharedUpdateChannel(channel) &&
        candidate?.trustedMutationChannelMode === true &&
        Array.isArray(candidate.trustedPropNids) &&
        Array.isArray(candidate.trustedPropSchemas) &&
        Array.isArray(candidate.trustedPropValues) &&
        Array.isArray(candidate.createdRoots) &&
        Array.isArray(candidate.deletedRoots) &&
        Array.isArray(candidate.createdComponents) &&
        Array.isArray(candidate.deletedComponents) &&
        Array.isArray(candidate.rootDeletedComponents) &&
        Array.isArray(candidate.trustedGroupNids) &&
        Array.isArray(candidate.trustedGroupSchemas) &&
        Array.isArray(candidate.trustedGroupValueOffsets) &&
        Array.isArray(candidate.trustedGroupValues)
}

function isEcsSnapshotChannel(channel: any): channel is EcsSnapshotChannel {
    const candidate = channel as any
    return candidate?.ecsChannelMode === true &&
        Array.isArray(candidate.trustedPropNids) &&
        Array.isArray(candidate.trustedPropSchemas) &&
        Array.isArray(candidate.trustedPropValues) &&
        Array.isArray(candidate.trustedGroupNids) &&
        Array.isArray(candidate.trustedGroupSchemas) &&
        Array.isArray(candidate.trustedGroupValueOffsets) &&
        Array.isArray(candidate.trustedGroupValues) &&
        typeof candidate.getVisibleNetworkedNids === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function' &&
        typeof candidate.isRootNid === 'function' &&
        typeof candidate.isComponentNid === 'function' &&
        typeof candidate.isRootDeletedComponentNid === 'function' &&
        typeof candidate.getComponent === 'function'
}

function getSingleEcsSnapshotChannel(user: User): EcsSnapshotChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isEcsSnapshotChannel(channel) ? channel : null
}

function isEcsSpatialSnapshotChannel(channel: any): channel is EcsSpatialSnapshotChannel {
    const candidate = channel as any
    return isEcsSnapshotChannel(channel) &&
        candidate?.ecsSpatialChannelMode === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getVisibleCellKeys === 'function' &&
        typeof candidate.getTrustedCellUpdateLog === 'function' &&
        typeof candidate.cellHasTrustedUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasOnlyMovementDeltas === 'function' &&
        typeof candidate.isCellVisible === 'function' &&
        typeof candidate.getRootComponents === 'function'
}

function getSingleEcsSpatialSnapshotChannel(user: User): EcsSpatialSnapshotChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isEcsSpatialSnapshotChannel(channel) ? channel : null
}

function getEcsSnapshotChannels(user: User): EcsSnapshotChannel[] {
    const channels: EcsSnapshotChannel[] = []
    for (const channel of user.subscriptions.values()) {
        if (isEcsSnapshotChannel(channel)) {
            channels.push(channel)
        }
    }
    return channels
}

function isSpatialCellChannel(channel: any): channel is SpatialCellChannel {
    return channel?.cellVisibilityMode === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        channel.dirtyCells instanceof Set &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getUserViewVersion === 'function' &&
        typeof channel.getVisibleCellVersionSignature === 'function'
}

function isCellFragmentChannel(channel: any): channel is CellFragmentChannel {
    return channel?.cellFragmentMode === true &&
        typeof channel.membershipVersion === 'number' &&
        typeof channel.fragmentCellLimit === 'number' &&
        typeof channel.stableFragmentCellLimit === 'number' &&
        typeof channel.getVisibleCellKeys === 'function' &&
        typeof channel.getVisibleEntities === 'function' &&
        typeof channel.getCellEntities === 'function' &&
        typeof channel.getCellEntityNids === 'function' &&
        typeof channel.getCellVersion === 'function' &&
        typeof channel.getRememberedCellKeys === 'function' &&
        typeof channel.getRememberedCellNids === 'function' &&
        typeof channel.hasStableRememberedCells === 'function' &&
        typeof channel.getStableVisibleCellKeys === 'function' &&
        typeof channel.rememberVisibleCells === 'function' &&
        typeof channel.getMovedRoots === 'function' &&
        typeof channel.hasStructuralDeltas === 'function'
}

function isMutationCellFragmentChannel(channel: any): channel is MutationCellFragmentChannel {
    const candidate = channel as any
    return isCellFragmentChannel(channel) &&
        candidate?.mutationCellFragmentMode === true &&
        (candidate.mutationMode === 'implicit' ||
            candidate.mutationMode === 'dirtyEntity' ||
            candidate.mutationMode === 'explicit') &&
        candidate.dirtyNids instanceof Set &&
        candidate.propMutations instanceof Map &&
        candidate.groupMutations instanceof Map &&
        typeof candidate.getDirtyNidsForCell === 'function' &&
        typeof candidate.shouldFullScanDirtyCell === 'function'
}

function isTrustedSpatialCellFragmentChannel(channel: any): channel is TrustedSpatialCellFragmentChannel {
    const candidate = channel as any
    return isCellFragmentChannel(channel) &&
        candidate?.trustedMutationSpatialMode === true &&
        candidate.dirtyCells instanceof Set &&
        typeof candidate.getTrustedCellUpdateLog === 'function' &&
        typeof candidate.cellHasTrustedUpdates === 'function' &&
        typeof candidate.getMovedRoots === 'function' &&
        typeof candidate.hasStructuralDeltas === 'function'
}

function getSingleSharedChannel(user: User): SharedUpdateChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isSharedUpdateChannel(channel) ? channel : null
}

function getSingleMutationUpdateChannel(user: User): MutationUpdateChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isMutationUpdateChannel(channel) ? channel : null
}

function getSingleTrustedMutationUpdateChannel(user: User): TrustedMutationUpdateChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isTrustedMutationUpdateChannel(channel) ? channel : null
}

function getSingleSpatialCellChannel(user: User): SpatialCellChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isSpatialCellChannel(channel) ? channel : null
}

function canUseSharedUpdateFragment(user: User, channel: SharedUpdateChannel) {
    return user.sharedChannelVersions.get(channel.nid) === channel.membershipVersion &&
        user.currentlyVisible.length === countChannelVisibleEntities(user.instance!, channel)
}

function getSingleCellFragmentChannel(user: User): CellFragmentChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isCellFragmentChannel(channel) ? channel : null
}

function getSingleMutationCellFragmentChannel(user: User): MutationCellFragmentChannel | null {
    if (user.subscriptions.size !== 1) {
        return null
    }
    const channel = user.subscriptions.values().next().value
    return isMutationCellFragmentChannel(channel) ? channel : null
}

function canUseSpatialCellFragments(user: User, channel: SpatialCellChannel) {
    const visibleCellKeys = channel.getVisibleCellKeys(user.id)
    return user.spatialCellVersionSignatures.get(channel.nid) === channel.getVisibleCellVersionSignature(user.id) &&
        user.spatialCellViewVersions.get(channel.nid) === channel.getUserViewVersion(user.id) &&
        visibleCellKeys.length <= channel.fragmentCellLimit &&
        user.currentlyVisible.length === countSpatialCellVisibleEntities(user.instance!, channel, user.id)
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

function collectBroadcastMessages(user: User) {
    const messages: any[] = []
    user.subscriptions.forEach((channel: any) => {
        if (isSharedMessageChannel(channel) && channel.broadcastMessages.length > 0) {
            for (let i = 0; i < channel.broadcastMessages.length; i++) {
                messages.push(channel.broadcastMessages[i])
            }
        }
    })
    return messages
}

function getSharedMessageFragment(user: User, instance: Instance, channel: SharedMessageChannel): MessageFragment {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:${protocol.ntypeType}`
    const cached = instance.network.sharedMessageFragments.get(key)
    if (cached) {
        instance.network.recordSharedMessageFragmentHit()
        return cached
    }

    const measure = instance.network.snapshotPerformanceEnabled
    let countStart = 0
    let countMs = 0
    let writeStart = 0
    let writeMs = 0
    const plan = createEmptySnapshotPlan()
    plan.messages = channel.broadcastMessages

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
        messages: channel.broadcastMessages.length
    }
    instance.network.sharedMessageFragments.set(key, fragment)
    instance.network.recordSharedMessageFragmentBuild({ countMs, writeMs, bytes, messages: fragment.messages })
    return fragment
}

function getSharedMessageFragments(user: User, instance: Instance) {
    if (instance.network.debugBinaryWrites) {
        return []
    }

    const fragments: MessageFragment[] = []
    user.subscriptions.forEach((channel: any) => {
        if (isSharedMessageChannel(channel) && channel.broadcastMessages.length > 0) {
            fragments.push(getSharedMessageFragment(user, instance, channel))
        }
    })
    return fragments
}

function sumSharedMessageFragmentBytes(fragments: ReturnType<typeof getSharedMessageFragments>) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes
    }
    return bytes
}

function sumSharedMessageFragmentMessages(fragments: ReturnType<typeof getSharedMessageFragments>) {
    let messages = 0
    for (let i = 0; i < fragments.length; i++) {
        messages += fragments[i].messages
    }
    return messages
}

function writeSharedMessageFragments(writer: IBinaryWriter, instance: Instance, fragments: ReturnType<typeof getSharedMessageFragments>) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedMessageFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
    }
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

function rememberSpatialCellChannelVersion(user: User) {
    const channel = getSingleSpatialCellChannel(user)
    if (!channel) {
        return
    }
    if (user.currentlyVisible.length === countSpatialCellVisibleEntities(user.instance!, channel, user.id)) {
        user.spatialCellChannelVersions.set(channel.nid, channel.membershipVersion)
        user.spatialCellVersionSignatures.set(channel.nid, channel.getVisibleCellVersionSignature(user.id))
        user.spatialCellViewVersions.set(channel.nid, channel.getUserViewVersion(user.id))
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

function countSpatialCellVisibleEntities(instance: Instance, channel: SpatialCellChannel, userId: number) {
    const nids = channel.getVisibleEntities(userId)
    if (instance.localState.children.size === 0) {
        return nids.length
    }

    let count = 0
    for (let i = 0; i < nids.length; i++) {
        count += countEntityWithChildren(instance, nids[i])
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

function channelOwnsNid(instance: Instance, channel: SharedUpdateChannel, nid: number): boolean {
    if (channel.entities.get(nid)) {
        return true
    }

    const sources = instance.localState.sources.get(nid)
    if (!sources) {
        return false
    }

    for (const sourceId of sources) {
        if (sourceId === channel.nid || channelOwnsNid(instance, channel, sourceId)) {
            return true
        }
    }
    return false
}

function collectDirtyEntityUpdatePlan(instance: Instance, channel: MutationUpdateChannel, excludedNids?: Set<number>): SnapshotPlan {
    const plan = createEmptySnapshotPlan()

    for (const nid of channel.dirtyNids) {
        if (excludedNids?.has(nid)) {
            continue
        }
        if (!channelOwnsNid(instance, channel, nid)) {
            continue
        }
        instance.localState.forEachEntityTree(nid, treeNid => {
            if (excludedNids?.has(treeNid)) {
                return
            }
            collectEntityUpdatePlan(instance, instance.localState.getByNid(treeNid), plan)
        })
    }

    return plan
}

function getSchemaUpdateGroup(instance: Instance, ntype: number, groupName: string) {
    const nschema = instance.context.getSchema(ntype)!
    for (let i = 0; i < nschema.updateGroups.length; i++) {
        if (nschema.updateGroups[i].name === groupName) {
            return nschema.updateGroups[i]
        }
    }
    return null
}

function collectExplicitMutationUpdatePlan(instance: Instance, channel: MutationUpdateChannel, excludedNids?: Set<number>): SnapshotPlan {
    const plan = createEmptySnapshotPlan()

    const collectNid = (nid: number, groups?: Set<string>, props?: Set<string>) => {
        if (excludedNids?.has(nid) || !channelOwnsNid(instance, channel, nid)) {
            return
        }
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        const cached = instance.cache.cache[nid]
        if (!cached) {
            collectEntityUpdatePlan(instance, entity, plan)
            return
        }

        const emittedGroups = new Set<number>()
        if (groups) {
            for (const groupName of groups.keys()) {
                const group = getSchemaUpdateGroup(instance, entity.ntype, groupName)
                if (!group) {
                    throw new Error(`MutationChannel explicit mutation group "${groupName}" is not in schema for ntype ${entity.ntype}.`)
                }
                emittedGroups.add(group.key)
                const values: any[] = []
                for (let i = 0; i < group.props.length; i++) {
                    const groupProp = group.props[i]
                    const value = entity[groupProp.prop]
                    values.push(groupProp.binary.clone(value))
                    cached[groupProp.prop] = groupProp.binary.clone(value)
                }
                plan.updateEntityGroups.push({ nid, nschema, group, values })
            }
        }

        if (!props) {
            return
        }
        for (const prop of props.keys()) {
            const propSpec = nschema.props[prop]
            if (!propSpec) {
                throw new Error(`MutationChannel explicit mutation prop "${prop}" is not in schema for ntype ${entity.ntype}.`)
            }
            const group = propSpec.updateGroup
            if (group) {
                if (emittedGroups.has(group.key)) {
                    continue
                }
                emittedGroups.add(group.key)
                const values: any[] = []
                for (let i = 0; i < group.props.length; i++) {
                    const groupProp = group.props[i]
                    const value = entity[groupProp.prop]
                    values.push(groupProp.binary.clone(value))
                    cached[groupProp.prop] = groupProp.binary.clone(value)
                }
                plan.updateEntityGroups.push({ nid, nschema, group, values })
            } else {
                const value = entity[propSpec.prop]
                plan.updateEntities.push({ nid, nschema, prop: propSpec.prop, value: propSpec.binary.clone(value) })
                cached[propSpec.prop] = propSpec.binary.clone(value)
            }
        }
    }

    let groupNids: Set<number> | null = null
    if (channel.groupMutations.size > 0 && channel.propMutations.size > 0) {
        groupNids = new Set()
    }

    for (const [nid, groups] of channel.groupMutations) {
        groupNids?.add(nid)
        collectNid(nid, groups, channel.propMutations.get(nid))
    }

    for (const [nid, props] of channel.propMutations) {
        if (groupNids?.has(nid)) {
            continue
        }
        collectNid(nid, undefined, props)
    }

    return plan
}

function collectMutationChannelUpdatePlan(instance: Instance, channel: MutationUpdateChannel, excludedNids?: Set<number>) {
    if (channel.mutationMode === 'implicit') {
        return collectChannelUpdatePlan(instance, channel, excludedNids)
    }
    if (channel.mutationMode === 'explicit') {
        return collectExplicitMutationUpdatePlan(instance, channel, excludedNids)
    }
    return collectDirtyEntityUpdatePlan(instance, channel, excludedNids)
}

function collectSpatialCellUpdatePlan(instance: Instance, channel: SpatialCellChannel, cellKey: string): SnapshotPlan {
    const plan = createEmptySnapshotPlan()
    const entities = channel.getCellEntities(cellKey)

    for (let i = 0; i < entities.length; i++) {
        instance.localState.forEachEntityTree(entities[i].nid, nid => {
            collectEntityUpdatePlan(instance, instance.localState.getByNid(nid), plan)
        })
    }

    return plan
}

function collectDirtyMutationCellUpdatePlan(instance: Instance, channel: MutationCellFragmentChannel, cellKey: string): SnapshotPlan {
    if (channel.shouldFullScanDirtyCell(cellKey)) {
        return collectSpatialCellUpdatePlan(instance, channel as any, cellKey)
    }

    const plan = createEmptySnapshotPlan()
    const dirtyNids = channel.getDirtyNidsForCell(cellKey)

    for (const dirtyNid of dirtyNids) {
        instance.localState.forEachEntityTree(dirtyNid, nid => {
            const entity = instance.localState.getByNid(nid)
            if (entity) {
                collectEntityUpdatePlan(instance, entity, plan)
            }
        })
    }

    return plan
}

function collectExplicitMutationCellUpdatePlan(instance: Instance, channel: MutationCellFragmentChannel, cellKey: string): SnapshotPlan {
    if (channel.shouldFullScanDirtyCell(cellKey)) {
        return collectSpatialCellUpdatePlan(instance, channel as any, cellKey)
    }

    const plan = createEmptySnapshotPlan()
    const dirtyNids = channel.getDirtyNidsForCell(cellKey)

    for (const nid of dirtyNids) {
        const entity = instance.localState.getByNid(nid)
        if (!entity) {
            continue
        }

        const nschema = instance.context.getSchema(entity.ntype)!
        const cached = instance.cache.cache[nid]
        if (!cached) {
            collectEntityUpdatePlan(instance, entity, plan)
            continue
        }

        const emittedGroups = new Set<string>()
        const groupMutations = channel.groupMutations.get(nid)
        if (groupMutations) {
            for (const groupName of groupMutations) {
                const group = getSchemaUpdateGroup(instance, entity.ntype, groupName)
                if (!group) {
                    throw new Error(`MutationCellChannel explicit mutation group "${groupName}" is not in schema for ntype ${entity.ntype}.`)
                }
                const values = []
                for (let i = 0; i < group.props.length; i++) {
                    const groupProp = group.props[i]
                    const value = entity[groupProp.prop]
                    values.push(groupProp.binary.clone(value))
                    cached[groupProp.prop] = groupProp.binary.clone(value)
                }
                plan.updateEntityGroups.push({ nid, nschema, group, values })
                emittedGroups.add(String(group.key))
            }
        }

        const propMutations = channel.propMutations.get(nid)
        if (!propMutations) {
            continue
        }

        for (const prop of propMutations.keys()) {
            const propSpec = nschema.props[prop]
            if (!propSpec) {
                throw new Error(`MutationCellChannel explicit mutation prop "${prop}" is not in schema for ntype ${entity.ntype}.`)
            }

            const group = propSpec.updateGroup
            if (group) {
                if (emittedGroups.has(String(group.key))) {
                    continue
                }
                const values = []
                for (let i = 0; i < group.props.length; i++) {
                    const groupProp = group.props[i]
                    const value = entity[groupProp.prop]
                    values.push(groupProp.binary.clone(value))
                    cached[groupProp.prop] = groupProp.binary.clone(value)
                }
                plan.updateEntityGroups.push({ nid, nschema, group, values })
                emittedGroups.add(String(group.key))
                continue
            }

            const value = entity[propSpec.prop]
            plan.updateEntities.push({ nid, nschema, prop: propSpec.prop, value: propSpec.binary.clone(value) })
            cached[propSpec.prop] = propSpec.binary.clone(value)
        }
    }

    return plan
}

function collectMutationCellUpdatePlan(instance: Instance, channel: MutationCellFragmentChannel, cellKey: string) {
    if (channel.mutationMode === 'implicit') {
        return collectSpatialCellUpdatePlan(instance, channel as any, cellKey)
    }
    if (channel.mutationMode === 'explicit') {
        return collectExplicitMutationCellUpdatePlan(instance, channel, cellKey)
    }
    return collectDirtyMutationCellUpdatePlan(instance, channel, cellKey)
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

function getSpatialCellUpdateFragment(user: User, instance: Instance, channel: SpatialCellChannel, cellKey: string) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:cell:${cellKey}:${protocol.nidType}:${protocol.ntypeType}`
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
    const plan = collectSpatialCellUpdatePlan(instance, channel, cellKey)
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

function getSpatialCellUpdateFragments(user: User, instance: Instance, channel: SpatialCellChannel) {
    const visibleCellKeys = channel.getVisibleCellKeys(user.id)
    const fragments = []

    for (let i = 0; i < visibleCellKeys.length; i++) {
        const cellKey = visibleCellKeys[i]
        if (!channel.dirtyCells.has(cellKey)) {
            continue
        }
        const fragment = getSpatialCellUpdateFragment(user, instance, channel, cellKey)
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            fragments.push(fragment)
        }
    }

    return fragments
}

function sumUpdateFragmentBytes(fragments: ReturnType<typeof getSpatialCellUpdateFragments>) {
    let bytes = 0
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes
    }
    return bytes
}

function sumUpdateFragmentProps(fragments: ReturnType<typeof getSpatialCellUpdateFragments>) {
    let props = 0
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].updateProps
    }
    return props
}

function sumUpdateFragmentGroups(fragments: ReturnType<typeof getSpatialCellUpdateFragments>) {
    let groups = 0
    for (let i = 0; i < fragments.length; i++) {
        groups += fragments[i].updateGroups
    }
    return groups
}

function sumUpdateFragmentGroupedProps(fragments: ReturnType<typeof getSpatialCellUpdateFragments>) {
    let props = 0
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].groupedUpdateProps
    }
    return props
}

function writeUpdateFragments(writer: IBinaryWriter, instance: Instance, fragments: ReturnType<typeof getSpatialCellUpdateFragments>) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i]
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
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

function getTrustedSpatialCellUpdateFragment(user: User, instance: Instance, channel: TrustedSpatialCellFragmentChannel, cellKey: string, includeNids = true): CellEntityFragment {
    const log = channel.getTrustedCellUpdateLog(cellKey)
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
    const key = `${instance.tick}:${channel.nid}:trusted-cell:update:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`
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
    const bytes = countTrustedUpdateBytes(log, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeTrustedUpdates(log, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        nids: includeNids ? collectNidsForRoots(instance, channel.getCellEntities(cellKey)) : new Set<number>(),
        creates: 0,
        deletes: 0,
        updateProps: log.trustedPropNids.length,
        updateGroups: log.trustedGroupNids.length,
        groupedUpdateProps: countTrustedGroupedProps(log)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

function getCellUpdateFragment(user: User, instance: Instance, channel: CellFragmentChannel, cellKey: string, includeNids = true): CellEntityFragment {
    if (isTrustedSpatialCellFragmentChannel(channel)) {
        return getTrustedSpatialCellUpdateFragment(user, instance, channel, cellKey, includeNids)
    }

    const protocol = instance.network.getProtocol()
    const mutationMode = isMutationCellFragmentChannel(channel) ? `mutation:${channel.mutationMode}` : 'implicit'
    const key = `${instance.tick}:${channel.nid}:cell:update:${mutationMode}:${cellKey}:${includeNids ? 'nids' : 'steady'}:${protocol.nidType}:${protocol.ntypeType}`
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
    const plan = isMutationCellFragmentChannel(channel)
        ? collectMutationCellUpdatePlan(instance, channel, cellKey)
        : collectSpatialCellUpdatePlan(instance, channel as any, cellKey)
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
    if (isTrustedSpatialCellFragmentChannel(channel)) {
        return channel.cellHasTrustedUpdates(cellKey)
    }
    return !isMutationCellFragmentChannel(channel) ||
        channel.mutationMode === 'implicit' ||
        channel.getDirtyNidsForCell(cellKey).size > 0
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

function getMutationUpdateFragment(user: User, instance: Instance, channel: MutationUpdateChannel, excludedNids?: Set<number>) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:mutation:${channel.mutationMode}:${protocol.nidType}:${protocol.ntypeType}:${excludedNids ? 'delta' : 'steady'}`
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
    const plan = collectMutationChannelUpdatePlan(instance, channel, excludedNids)
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

function countTrustedGroupUpdates(channel: TrustedMutationUpdateLog, protocol: ProtocolConfig) {
    const count = channel.trustedGroupNids.length
    if (count === 0) {
        return 0
    }

    let bytes = 1 + 4
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const values = channel.trustedGroupValues
    for (let i = 0; i < count; i++) {
        const group = channel.trustedGroupSchemas[i]
        let offset = channel.trustedGroupValueOffsets[i]
        bytes += nidBytes + 1
        for (let j = 0; j < group.props.length; j++) {
            bytes += group.props[j].binary.byteSize(values[offset++])
        }
    }
    return bytes
}

function countTrustedPropUpdates(channel: TrustedMutationUpdateLog, protocol: ProtocolConfig) {
    const count = channel.trustedPropNids.length
    if (count === 0) {
        return 0
    }

    let bytes = 1 + 4
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const props = channel.trustedPropSchemas
    const values = channel.trustedPropValues
    for (let i = 0; i < count; i++) {
        bytes += nidBytes + 1 + props[i].binary.byteSize(values[i])
    }
    return bytes
}

function writeTrustedPropUpdates(channel: TrustedMutationUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const count = channel.trustedPropNids.length
    if (count === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntities)
    writer.writeUInt32(count)
    const nids = channel.trustedPropNids
    const props = channel.trustedPropSchemas
    const values = channel.trustedPropValues
    for (let i = 0; i < count; i++) {
        writeNetworkId(nids[i], protocol.nidType, writer)
        writer.writeUInt8(props[i].key)
        props[i].binary.write(values[i], writer)
    }
}

function writeTrustedGroupUpdates(channel: TrustedMutationUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const count = channel.trustedGroupNids.length
    if (count === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntityGroups)
    writer.writeUInt32(count)
    const nids = channel.trustedGroupNids
    const groups = channel.trustedGroupSchemas
    const offsets = channel.trustedGroupValueOffsets
    const values = channel.trustedGroupValues
    for (let i = 0; i < count; i++) {
        const group = groups[i]
        let offset = offsets[i]
        writeNetworkId(nids[i], protocol.nidType, writer)
        writer.writeUInt8(group.key)
        for (let j = 0; j < group.props.length; j++) {
            group.props[j].binary.write(values[offset++], writer)
        }
    }
}

function countTrustedUpdateBytes(channel: TrustedMutationUpdateLog, protocol: ProtocolConfig) {
    return countTrustedPropUpdates(channel, protocol) + countTrustedGroupUpdates(channel, protocol)
}

function writeTrustedUpdates(channel: TrustedMutationUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    writeTrustedPropUpdates(channel, writer, protocol)
    writeTrustedGroupUpdates(channel, writer, protocol)
}

type TrustedGroupBatch = {
    ntype: number
    group: SchemaUpdateGroup
    count: number
}

function collectTrustedGroupBatches(channel: EcsTrustedMutationUpdateLog) {
    const batches: TrustedGroupBatch[] = []
    const ntypes = channel.trustedGroupNTypes
    const groups = channel.trustedGroupSchemas

    for (let i = 0; i < groups.length; i++) {
        const ntype = ntypes[i]
        const group = groups[i]
        let batch: TrustedGroupBatch | null = null
        for (let j = 0; j < batches.length; j++) {
            const candidate = batches[j]
            if (candidate.ntype === ntype && candidate.group.key === group.key) {
                batch = candidate
                break
            }
        }
        if (batch) {
            batch.count++
        } else {
            batches.push({ ntype, group, count: 1 })
        }
    }

    return batches
}

function countEcsTrustedUpdateBytes(channel: EcsTrustedMutationUpdateLog, protocol: ProtocolConfig) {
    let bytes = countTrustedPropUpdates(channel, protocol)
    const batches = collectTrustedGroupBatches(channel)
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const ntypeBytes = byteSizeOfNetworkType(protocol.ntypeType)
    const ntypes = channel.trustedGroupNTypes
    const groups = channel.trustedGroupSchemas
    const offsets = channel.trustedGroupValueOffsets
    const values = channel.trustedGroupValues

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        bytes += 1 + ntypeBytes + 1 + 4
        for (let j = 0; j < groups.length; j++) {
            const group = groups[j]
            if (ntypes[j] !== batch.ntype || group.key !== batch.group.key) {
                continue
            }
            bytes += nidBytes
            let offset = offsets[j]
            for (let k = 0; k < group.props.length; k++) {
                bytes += group.props[k].binary.byteSize(values[offset++])
            }
        }
    }

    return bytes
}

function writeEcsTrustedGroupUpdates(channel: EcsTrustedMutationUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const batches = collectTrustedGroupBatches(channel)
    const nids = channel.trustedGroupNids
    const ntypes = channel.trustedGroupNTypes
    const groups = channel.trustedGroupSchemas
    const offsets = channel.trustedGroupValueOffsets
    const values = channel.trustedGroupValues

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        writer.writeUInt8(BinarySection.EcsUpdateComponentGroups)
        writeNetworkId(batch.ntype, protocol.ntypeType, writer)
        writer.writeUInt8(batch.group.key)
        writer.writeUInt32(batch.count)

        for (let j = 0; j < groups.length; j++) {
            const group = groups[j]
            if (ntypes[j] !== batch.ntype || group.key !== batch.group.key) {
                continue
            }
            let offset = offsets[j]
            writeNetworkId(nids[j], protocol.nidType, writer)
            for (let k = 0; k < group.props.length; k++) {
                group.props[k].binary.write(values[offset++], writer)
            }
        }
    }
}

function writeEcsTrustedUpdates(channel: EcsTrustedMutationUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    writeTrustedPropUpdates(channel, writer, protocol)
    writeEcsTrustedGroupUpdates(channel, writer, protocol)
}

function countTrustedGroupedProps(channel: TrustedMutationUpdateLog) {
    let props = 0
    const groups = channel.trustedGroupSchemas
    for (let i = 0; i < groups.length; i++) {
        props += groups[i].props.length
    }
    return props
}

function getTrustedUpdateFragment(user: User, instance: Instance, channel: EcsTrustedMutationUpdateLog & { nid: number }, keyPrefix: string) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:${keyPrefix}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key) as TrustedUpdateFragment | undefined
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
    const bytes = countEcsTrustedUpdateBytes(channel, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeEcsTrustedUpdates(channel, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.trustedPropNids.length,
        updateGroups: channel.trustedGroupNids.length,
        groupedUpdateProps: countTrustedGroupedProps(channel)
    }
    instance.network.sharedUpdateFragments.set(key, fragment)
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes })
    return fragment
}

function classifyEcsNid(nid: number, channels: EcsSnapshotChannel[]) {
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i]
        if (channel.isRootNid(nid)) {
            return { channel, root: true }
        }
    }
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i]
        if (channel.isComponentNid(nid) || channel.isRootDeletedComponentNid(nid)) {
            return { channel, root: false }
        }
    }
    return null
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

function addEcsTrustedUpdates(plan: SnapshotPlan, instance: Instance, channel: EcsSnapshotChannel, visibleUpdates: Set<number>) {
    for (let i = 0; i < channel.trustedPropNids.length; i++) {
        const nid = channel.trustedPropNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
            continue
        }
        const prop = channel.trustedPropSchemas[i]
        plan.updateEntities.push({
            nid,
            nschema: instance.context.getSchema(component.ntype)!,
            prop: prop.prop,
            value: channel.trustedPropValues[i]
        })
    }

    for (let i = 0; i < channel.trustedGroupNids.length; i++) {
        const nid = channel.trustedGroupNids[i]
        if (!visibleUpdates.has(nid)) {
            continue
        }
        const component = channel.getComponent(nid)
        if (!component) {
            continue
        }
        const group = channel.trustedGroupSchemas[i]
        const values = []
        let offset = channel.trustedGroupValueOffsets[i]
        for (let j = 0; j < group.props.length; j++) {
            values.push(channel.trustedGroupValues[offset++])
        }
        plan.updateEntityGroups.push({
            nid,
            nschema: instance.context.getSchema(component.ntype)!,
            group,
            values
        })
    }
}

function ecsHasTrustedUpdates(channel: EcsSnapshotChannel) {
    return channel.trustedPropNids.length > 0 || channel.trustedGroupNids.length > 0
}

function addEcsEnvelopeQueues(plan: SnapshotPlan, user: User) {
    plan.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    plan.messages = user.messageQueue
    user.messageQueue = []
    plan.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
}

function addChannelIdentity(plan: SnapshotPlan, user: User, channel: { nid: number, clientIdentity?: any }) {
    if (channel.clientIdentity === undefined || user.knownClientIdentities.has(channel.nid)) {
        return
    }
    for (let i = 0; i < plan.channelIdentities.length; i++) {
        if (plan.channelIdentities[i].channelId === channel.nid) {
            return
        }
    }
    plan.channelIdentities.push({
        channelId: channel.nid,
        identity: channel.clientIdentity
    })
}

function addChannelEntityCreate(plan: SnapshotPlan, user: User, channel: { nid: number, clientIdentity?: any }, nid: number) {
    if (channel.clientIdentity === undefined) {
        return
    }
    addChannelIdentity(plan, user, channel)
    plan.channelEntityCreates.push({
        nid,
        channelId: channel.nid
    })
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
        addChannelEntityCreate(plan, user, channel, nid)
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }
    for (let i = 0; i < channel.createdComponents.length; i++) {
        const nid = channel.createdComponents[i].nid
        addChannelEntityCreate(plan, user, channel, nid)
        user.currentlyVisible.push(nid)
        user.tickLastSeen.set(nid, user.instance!.tick)
    }

    const visibleNids = channel.getVisibleNetworkedNids(user.id)
    user.stableVisibleRefs.set(channel.nid, visibleNids)
    user.lastVisibleCount = user.currentlyVisible.length
    addEcsEnvelopeQueues(plan, user)
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
            addChannelEntityCreate(plan, user, channel, move.pid)
            addVisibleNid(user, move.pid, instance.tick)
            const components = channel.getRootComponents(move.pid)
            for (let j = 0; j < components.length; j++) {
                plan.ecsCreateComponents.push(components[j])
                addChannelEntityCreate(plan, user, channel, components[j].nid)
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
    addEcsEnvelopeQueues(plan, user)
    return plan
}

function collectEcsAwareSnapshotPlan(user: User, instance: Instance, channels: EcsSnapshotChannel[]) {
    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkVisibility(instance.tick)
    const plan = createEmptySnapshotPlan()
    plan.channelEntityCreates = channelEntityCreates
    for (let i = 0; i < channelEntityCreates.length; i++) {
        const channel = user.subscriptions.get(channelEntityCreates[i].channelId)
        if (channel) {
            addChannelIdentity(plan, user, channel)
        }
    }

    for (let i = 0; i < toCreate.length; i++) {
        const nid = toCreate[i]
        const ecs = classifyEcsNid(nid, channels)
        if (!ecs) {
            addRegularCreate(plan, instance, nid)
        } else if (ecs.root) {
            plan.ecsCreateEntities.push(nid)
        } else {
            const component = ecs.channel.getComponent(nid)
            if (component) {
                plan.ecsCreateComponents.push(component)
            }
        }
    }

    const deletingRoots = new Set<number>()
    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        const ecs = classifyEcsNid(nid, channels)
        if (ecs?.root) {
            deletingRoots.add(nid)
            plan.ecsDeleteEntities.push(nid)
        }
    }

    for (let i = 0; i < toDelete.length; i++) {
        const nid = toDelete[i]
        const ecs = classifyEcsNid(nid, channels)
        if (ecs?.root) {
            continue
        }
        const component = ecs ? ecs.channel.getComponent(nid) : null
        if (ecs?.channel.isRootDeletedComponentNid(nid) || (component && deletingRoots.has(component.pid))) {
            continue
        } else {
            plan.deleteEntities.push(nid)
        }
    }

    for (let i = 0; i < toUpdate.length; i++) {
        const nid = toUpdate[i]
        if (classifyEcsNid(nid, channels)) {
            continue
        }
        addRegularUpdate(plan, instance, nid)
    }

    const visibleUpdates = new Set(toUpdate)
    for (let i = 0; i < channels.length; i++) {
        addEcsTrustedUpdates(plan, instance, channels[i], visibleUpdates)
    }

    addEcsEnvelopeQueues(plan, user)

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
            addEcsEnvelopeQueues(plan, user)
            return { plan, toUpdate: [] }
        }
    }
    if (
        channel.hasStructuralDeltas() &&
        !ecsHasTrustedUpdates(channel) &&
        user.stableVisibleRefs.has(channel.nid)
    ) {
        return collectStableEcsStructuralSnapshotBase(user, channel)
    }

    const { toCreate, toUpdate, toDelete, channelEntityCreates } = user.checkVisibility(instance.tick)
    plan.channelEntityCreates = channelEntityCreates
    addChannelIdentity(plan, user, channel)

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

    addEcsEnvelopeQueues(plan, user)

    return { plan, toUpdate }
}

function collectEcsSnapshotPlan(user: User, instance: Instance, channel: EcsSnapshotChannel) {
    const { plan, toUpdate } = collectEcsSnapshotBase(user, instance, channel)
    addEcsTrustedUpdates(plan, instance, channel, new Set(toUpdate))
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
    const writeTrustedLogDirectly = !hasEcsSnapshotCrud(plan)
    if (!writeTrustedLogDirectly) {
        addEcsTrustedUpdates(plan, instance, channel, new Set(base.toUpdate))
    }
    const trustedFragment = writeTrustedLogDirectly && instance.network.sharedUpdateFragmentsEnabled
        ? getTrustedUpdateFragment(user, instance, channel, 'ecs-trusted')
        : null

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const bytes = countSnapshotBytes(plan, instance.context, protocol) +
        (trustedFragment ? trustedFragment.bytes : writeTrustedLogDirectly ? countEcsTrustedUpdateBytes(channel, protocol) : 0)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(plan, instance.context, writer, protocol)
    if (trustedFragment) {
        const copyStart = measure ? performance.now() : 0
        writePayload(writer, trustedFragment.payload)
        if (measure) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, trustedFragment.bytes)
        }
    } else if (writeTrustedLogDirectly) {
        writeEcsTrustedUpdates(channel, writer, protocol)
    }

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, plan)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)

    if (measure) {
        commitMs = performance.now() - commitStart
        if (trustedFragment) {
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
            updateProps: trustedFragment ? trustedFragment.updateProps :
                writeTrustedLogDirectly ? channel.trustedPropNids.length : plan.updateEntities.length,
            updateGroups: trustedFragment ? trustedFragment.updateGroups :
                writeTrustedLogDirectly ? channel.trustedGroupNids.length : plan.updateEntityGroups.length,
            groupedUpdateProps: trustedFragment ? trustedFragment.groupedUpdateProps :
                writeTrustedLogDirectly ? countTrustedGroupedProps(channel) :
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
        addEcsEnvelopeQueues(plan, user)
        return plan
    }
    if (channel.hasOnlyMovementDeltas() && user.stableVisibleRefs.has(channel.nid)) {
        return collectStableEcsSpatialMovementSnapshotBase(user, instance, channel)
    }

    const { toCreate, toDelete, channelEntityCreates } = user.checkVisibility(instance.tick)
    plan.channelEntityCreates = channelEntityCreates
    addChannelIdentity(plan, user, channel)
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

    addEcsEnvelopeQueues(plan, user)
    return plan
}

function getEcsSpatialCellUpdateFragment(user: User, instance: Instance, channel: EcsSpatialSnapshotChannel, cellKey: string) {
    const log = channel.getTrustedCellUpdateLog(cellKey)
    if (!log) {
        return null
    }
    return getTrustedUpdateFragment(user, instance, { nid: channel.nid, ...log }, `ecs-spatial:${cellKey}`)
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

    const updateFragments: TrustedUpdateFragment[] = []
    const visibleCellKeys = channel.getVisibleCellKeys(user.id)
    for (let i = 0; i < visibleCellKeys.length; i++) {
        const cellKey = visibleCellKeys[i]
        if (!channel.cellHasTrustedUpdates(cellKey)) {
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

    let updateBytes = 0
    for (let i = 0; i < updateFragments.length; i++) {
        updateBytes += updateFragments[i].bytes
    }
    const bytes = countSnapshotBytes(plan, instance.context, protocol) + updateBytes
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(plan, instance.context, writer, protocol)
    for (let i = 0; i < updateFragments.length; i++) {
        const fragment = updateFragments[i]
        const copyStart = measure ? performance.now() : 0
        writePayload(writer, fragment.payload)
        if (measure) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
        }
    }

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

function getTrustedMutationUpdateFragment(user: User, instance: Instance, channel: TrustedMutationUpdateChannel) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:trusted:${protocol.nidType}:${protocol.ntypeType}`
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
    const bytes = countTrustedUpdateBytes(channel, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeTrustedUpdates(channel, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.trustedPropNids.length,
        updateGroups: channel.trustedGroupNids.length,
        groupedUpdateProps: countTrustedGroupedProps(channel)
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
    const queuedResponses = user.responseQueue.length
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    user.lastVisibleCount = user.currentlyVisible.length

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)
    const fragment = getSharedUpdateFragment(user, instance, channel)

    if (measure) {
        countStart = performance.now()
    }

    const envelopeBytes = countSnapshotBytes(envelope, instance.context, protocol)
    const bytes = envelopeBytes + sumSharedMessageFragmentBytes(messageFragments) + fragment.bytes
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    writeSharedMessageFragments(writer, instance, messageFragments)

    const copyStart = measure ? performance.now() : 0
    writePayload(writer, fragment.payload)

    if (measure) {
        instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
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

function createMutationUpdateSnapshotBuffer(user: User, instance: Instance, channel: MutationUpdateChannel) {
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
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    user.lastVisibleCount = user.currentlyVisible.length

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)
    const fragment = getMutationUpdateFragment(user, instance, channel)

    if (measure) {
        countStart = performance.now()
    }

    const envelopeBytes = countSnapshotBytes(envelope, instance.context, protocol)
    const bytes = envelopeBytes + sumSharedMessageFragmentBytes(messageFragments) + fragment.bytes
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    writeSharedMessageFragments(writer, instance, messageFragments)

    const copyStart = measure ? performance.now() : 0
    writePayload(writer, fragment.payload)

    if (measure) {
        instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
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

function createTrustedMutationUpdateSnapshotBuffer(user: User, instance: Instance, channel: TrustedMutationUpdateChannel) {
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
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    user.lastVisibleCount = user.currentlyVisible.length

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const messageFragments = getSharedMessageFragments(user, instance)
    const fragment = getTrustedMutationUpdateFragment(user, instance, channel)

    if (measure) {
        countStart = performance.now()
    }

    const envelopeBytes = countSnapshotBytes(envelope, instance.context, protocol)
    const bytes = envelopeBytes + sumSharedMessageFragmentBytes(messageFragments) + fragment.bytes
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    if (measure) {
        writeMs = performance.now() - writeStart
    }

    writeSharedMessageFragments(writer, instance, messageFragments)

    const copyStart = measure ? performance.now() : 0
    writePayload(writer, fragment.payload)

    if (measure) {
        instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes)
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
    const queuedResponses = user.responseQueue.length
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)

    const entityDeltaFragments = getEntityDeltaFragments(user, instance, channel)
    const messageFragments = getSharedMessageFragments(user, instance)
    const updateFragment = getSharedUpdateFragment(user, instance, channel, entityDeltaFragments.creates?.nids)
    if (entityDeltaFragments.creates && channel.clientIdentity !== undefined) {
        addChannelIdentity(envelope, user, channel)
        for (const nid of entityDeltaFragments.creates.nids) {
            envelope.channelEntityCreates.push({ nid, channelId: channel.nid })
        }
    }

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const envelopeBytes = countSnapshotBytes(envelope, instance.context, protocol)
    const bytes = envelopeBytes +
        countEntityDeltaFragmentBytes(entityDeltaFragments) +
        sumSharedMessageFragmentBytes(messageFragments) +
        updateFragment.bytes
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    writeEntityDeltaFragments(writer, instance, entityDeltaFragments)
    writeSharedMessageFragments(writer, instance, messageFragments)

    const copyStart = measure ? performance.now() : 0
    writePayload(writer, updateFragment.payload)
    if (measure) {
        instance.network.recordSharedFragmentCopy(performance.now() - copyStart, updateFragment.bytes)
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

function applySpatialCellVisibilityToUser(user: User, channel: SpatialCellChannel, tick: number) {
    for (let i = 0; i < user.currentlyVisible.length; i++) {
        user.tickLastSeen.set(user.currentlyVisible[i], tick)
    }
    user.lastVisibleCount = user.currentlyVisible.length
    user.spatialCellChannelVersions.set(channel.nid, channel.membershipVersion)
    user.spatialCellVersionSignatures.set(channel.nid, channel.getVisibleCellVersionSignature(user.id))
    user.spatialCellViewVersions.set(channel.nid, channel.getUserViewVersion(user.id))
}

function createSpatialCellSnapshotBuffer(user: User, instance: Instance, channel: SpatialCellChannel) {
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
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)
    const messageFragments = getSharedMessageFragments(user, instance)
    const updateFragments = getSpatialCellUpdateFragments(user, instance, channel)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const envelopeBytes = countSnapshotBytes(envelope, instance.context, protocol)
    const bytes = envelopeBytes +
        sumSharedMessageFragmentBytes(messageFragments) +
        sumUpdateFragmentBytes(updateFragments)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    writeSharedMessageFragments(writer, instance, messageFragments)
    writeUpdateFragments(writer, instance, updateFragments)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    applySpatialCellVisibilityToUser(user, channel, instance.tick)
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
            updateProps: sumUpdateFragmentProps(updateFragments),
            updateGroups: sumUpdateFragmentGroups(updateFragments),
            groupedUpdateProps: sumUpdateFragmentGroupedProps(updateFragments),
            deletes: 0,
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

function getTrustedStableVisibleCellKeys(channel: TrustedSpatialCellFragmentChannel, userId: number) {
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

function addTrustedSpatialCreates(instance: Instance, plan: SnapshotPlan, roots: any[], seen: Set<number>) {
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

function addTrustedSpatialDeletes(instance: Instance, plan: SnapshotPlan, rootNid: number, seen: Set<number>) {
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

function applyTrustedSpatialVisibilityDeltas(user: User, plan: SnapshotPlan, tick: number) {
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

function createTrustedStableSpatialCellSnapshotBuffer(user: User, instance: Instance, channel: TrustedSpatialCellFragmentChannel, currentCellKeys: string[]) {
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
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)

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
            addTrustedSpatialCreates(instance, plan, [move.entity], createNids)
        } else if (fromVisible && !toVisible) {
            addTrustedSpatialDeletes(instance, plan, move.entity.nid, deleteNids)
        }
    }
    if (plan.createEntities.length > 0 && channel.clientIdentity !== undefined) {
        addChannelIdentity(envelope, user, channel)
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
        if (!channel.cellHasTrustedUpdates(cellKey)) {
            continue
        }
        const fragment = getTrustedSpatialCellUpdateFragment(user, instance, channel, cellKey, false)
        if (fragment.updateProps > 0 || fragment.updateGroups > 0) {
            updateFragments.push(fragment)
        }
    }
    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        collectMs = performance.now() - collectStart
        countStart = performance.now()
    }

    const bytes = countSnapshotBytes(envelope, instance.context, protocol) +
        countSnapshotBytes(plan, instance.context, protocol) +
        sumCellFragmentBytes(updateFragments) +
        sumSharedMessageFragmentBytes(messageFragments)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    writeSnapshot(plan, instance.context, writer, protocol)
    writeSharedMessageFragments(writer, instance, messageFragments)
    writeCellFragments(writer, instance, updateFragments)

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    applyTrustedSpatialVisibilityDeltas(user, plan, instance.tick)
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
    const queuedResponses = user.responseQueue.length
    const protocol = instance.network.getProtocol()
    const envelope = createEmptySnapshotPlan()
    envelope.engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []
    envelope.messages = user.messageQueue
    user.messageQueue = []
    envelope.responses = user.responseQueue.slice(0, MAX_RESPONSES_PER_FRAME)

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

    const bytes = countSnapshotBytes(envelope, instance.context, protocol) +
        sumCellFragmentBytes(updateFragments) +
        sumSharedMessageFragmentBytes(messageFragments)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(envelope, instance.context, writer, protocol)
    writeSharedMessageFragments(writer, instance, messageFragments)
    writeCellFragments(writer, instance, updateFragments)

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

    if (isTrustedSpatialCellFragmentChannel(channel)) {
        const trustedStableCellKeys = getTrustedStableVisibleCellKeys(channel, user.id)
        if (trustedStableCellKeys) {
            return createTrustedStableSpatialCellSnapshotBuffer(user, instance, channel, trustedStableCellKeys)
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
    const plan = collectSnapshotPlan(user, instance)
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

    const bytes = countSnapshotBytes(plan, instance.context, protocol) +
        sumCellFragmentBytes(createFragments) +
        sumCellFragmentBytes(deleteFragments) +
        sumCellFragmentBytes(updateFragments) +
        sumSharedMessageFragmentBytes(messageFragments)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    writeSnapshot(plan, instance.context, writer, protocol)
    writeCellFragments(writer, instance, createFragments)
    writeCellFragments(writer, instance, deleteFragments)
    writeSharedMessageFragments(writer, instance, messageFragments)
    writeCellFragments(writer, instance, updateFragments)

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

const createSnapshotBufferRefactor = (user: User, instance: Instance) => {
    const ecsChannels = getEcsSnapshotChannels(user)
    const ecsSpatialChannel = getSingleEcsSpatialSnapshotChannel(user)
    const ecsChannel = getSingleEcsSnapshotChannel(user)
    const trustedMutationChannel = getSingleTrustedMutationUpdateChannel(user)
    const mutationChannel = getSingleMutationUpdateChannel(user)
    const sharedChannel = getSingleSharedChannel(user)
    const cellFragmentChannel = getSingleCellFragmentChannel(user)
    const spatialCellChannel = getSingleSpatialCellChannel(user)
    if (ecsSpatialChannel) {
        return createEcsSpatialSnapshotBuffer(user, instance, ecsSpatialChannel)
    }

    if (ecsChannel) {
        return createEcsSnapshotBuffer(user, instance, ecsChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        sharedChannel &&
        hasChannelDeltas(sharedChannel) &&
        canUseSharedDeltaFragments(user, sharedChannel)) {
        return createSharedDeltaSnapshotBuffer(user, instance, sharedChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        trustedMutationChannel &&
        canUseSharedUpdateFragment(user, trustedMutationChannel)) {
        return createTrustedMutationUpdateSnapshotBuffer(user, instance, trustedMutationChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        mutationChannel &&
        canUseSharedUpdateFragment(user, mutationChannel)) {
        return createMutationUpdateSnapshotBuffer(user, instance, mutationChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        sharedChannel &&
        canUseSharedUpdateFragment(user, sharedChannel)) {
        return createSharedUpdateSnapshotBuffer(user, instance, sharedChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        cellFragmentChannel &&
        canUseCellFragments(cellFragmentChannel, user.id)) {
        return createCellFragmentSnapshotBuffer(user, instance, cellFragmentChannel)
    }

    if (instance.network.sharedUpdateFragmentsEnabled &&
        !instance.network.debugBinaryWrites &&
        spatialCellChannel &&
        canUseSpatialCellFragments(user, spatialCellChannel)) {
        return createSpatialCellSnapshotBuffer(user, instance, spatialCellChannel)
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
    const plan = ecsChannels.length > 0
        ? collectEcsAwareSnapshotPlan(user, instance, ecsChannels)
        : collectSnapshotPlan(user, instance)
    const queuedResponses = user.responseQueue.length
    const protocol = instance.network.getProtocol()
    if (instance.network.debugBinaryWrites) {
        plan.messages.push(...collectBroadcastMessages(user))
    }

    if (measure) {
        collectMs = performance.now() - collectStart
    }

    const entityDeltaFragments = sharedChannel
        ? getEntityDeltaFragments(user, instance, sharedChannel)
        : { creates: null, deletes: null }
    removeFragmentCreatesFromPlan(plan, entityDeltaFragments.creates)
    removeFragmentDeletesFromPlan(plan, entityDeltaFragments.deletes)
    const messageFragments = getSharedMessageFragments(user, instance)

    if (measure) {
        countStart = performance.now()
    }

    // The writer uses exact-sized buffers, so normal snapshot creation does a
    // count pass followed by a write pass. The metrics split these deliberately:
    // if count and write both scale with update volume, prop bundles or cached
    // binary fragments are better candidates than generic micro-optimizations.
    const bytes = countSnapshotBytes(plan, instance.context, protocol) +
        countEntityDeltaFragmentBytes(entityDeltaFragments) +
        sumSharedMessageFragmentBytes(messageFragments)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }

    try {
        writeSnapshot(plan, instance.context, writer, protocol)
        writeEntityDeltaFragments(writer, instance, entityDeltaFragments)
        writeSharedMessageFragments(writer, instance, messageFragments)
    } catch (err) {
        if (!instance.network.debugBinaryWrites) {
            throw err
        }

        const debugWriter = user.networkAdapter.binary.createWriter(bytes)
        try {
            writeSnapshotDebug(plan, instance.context, debugWriter, protocol)
        } catch (debugErr) {
            throw debugErr
        }
        throw createBinaryDebugError(err, {
            phase: 'write',
            section: 'Snapshot',
            offset: writer.offset
        })
    }

    if (measure) {
        writeMs = performance.now() - writeStart
        commitStart = performance.now()
    }

    commitSnapshotPlan(user, plan)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)
    rememberSharedChannelVersion(user)
    rememberSpatialCellChannelVersion(user)

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
            creates: plan.ecsCreateEntities.length + plan.ecsCreateComponents.length +
                plan.createEntities.length + countEntityDeltaFragmentCreates(entityDeltaFragments),
            updateProps: plan.updateEntities.length,
            updateGroups: plan.updateEntityGroups.length,
            groupedUpdateProps: plan.updateEntityGroups.reduce((total, update) => total + update.group.props.length, 0),
            deletes: plan.ecsDeleteEntities.length + plan.deleteEntities.length + countEntityDeltaFragmentDeletes(entityDeltaFragments),
            messages: plan.messages.length + sumSharedMessageFragmentMessages(messageFragments),
            engineMessages: plan.engineMessages.length,
            responses: plan.responses.length
        })
    }

    return writer.payload
}

export default createSnapshotBufferRefactor
export { collectSnapshotPlan, collectSnapshotPlan as getVisibleState }
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot }
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan'
