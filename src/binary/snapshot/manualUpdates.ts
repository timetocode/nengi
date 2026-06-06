import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { BinarySection } from '../../common/binary/BinarySection'
import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { ProtocolConfig, byteSizeOfNetworkType, writeNetworkId } from '../../common/binary/Protocol'
import { SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema'

export type ManualUpdateLog = {
    manualPropNids: number[]
    manualPropSchemas: SchemaProp[]
    manualPropValues: any[]
    manualGroupNids: number[]
    manualGroupSchemas: SchemaUpdateGroup[]
    manualGroupValueOffsets: number[]
    manualGroupValues: any[]
}

export type EcsManualUpdateLog = ManualUpdateLog & {
    manualGroupNTypes: number[]
}

export type ManualUpdateFragment = {
    payload: BinaryPayload
    bytes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

function countManualGroupUpdates(channel: ManualUpdateLog, protocol: ProtocolConfig) {
    const count = channel.manualGroupNids.length
    if (count === 0) {
        return 0
    }

    let bytes = 1 + 4
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const values = channel.manualGroupValues
    for (let i = 0; i < count; i++) {
        const group = channel.manualGroupSchemas[i]
        let offset = channel.manualGroupValueOffsets[i]
        bytes += nidBytes + 1
        for (let j = 0; j < group.props.length; j++) {
            bytes += group.props[j].binary.byteSize(values[offset++])
        }
    }
    return bytes
}

function countManualPropUpdates(channel: ManualUpdateLog, protocol: ProtocolConfig) {
    const count = channel.manualPropNids.length
    if (count === 0) {
        return 0
    }

    let bytes = 1 + 4
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const props = channel.manualPropSchemas
    const values = channel.manualPropValues
    for (let i = 0; i < count; i++) {
        bytes += nidBytes + 1 + props[i].binary.byteSize(values[i])
    }
    return bytes
}

function writeManualPropUpdates(channel: ManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const count = channel.manualPropNids.length
    if (count === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntities)
    writer.writeUInt32(count)
    const nids = channel.manualPropNids
    const props = channel.manualPropSchemas
    const values = channel.manualPropValues
    for (let i = 0; i < count; i++) {
        writeNetworkId(nids[i], protocol.nidType, writer)
        writer.writeUInt8(props[i].key)
        props[i].binary.write(values[i], writer)
    }
}

function writeManualGroupUpdates(channel: ManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const count = channel.manualGroupNids.length
    if (count === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntityGroups)
    writer.writeUInt32(count)
    const nids = channel.manualGroupNids
    const groups = channel.manualGroupSchemas
    const offsets = channel.manualGroupValueOffsets
    const values = channel.manualGroupValues
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

export function countManualUpdateBytes(channel: ManualUpdateLog, protocol: ProtocolConfig) {
    return countManualPropUpdates(channel, protocol) + countManualGroupUpdates(channel, protocol)
}

export function writeManualUpdates(channel: ManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    writeManualPropUpdates(channel, writer, protocol)
    writeManualGroupUpdates(channel, writer, protocol)
}

type ManualGroupBatch = {
    ntype: number
    group: SchemaUpdateGroup
    count: number
}

function collectManualGroupBatches(channel: EcsManualUpdateLog) {
    const batches: ManualGroupBatch[] = []
    const ntypes = channel.manualGroupNTypes
    const groups = channel.manualGroupSchemas

    for (let i = 0; i < groups.length; i++) {
        const ntype = ntypes[i]
        const group = groups[i]
        let batch: ManualGroupBatch | null = null
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

export function countEcsManualUpdateBytes(channel: EcsManualUpdateLog, protocol: ProtocolConfig) {
    let bytes = countManualPropUpdates(channel, protocol)
    const batches = collectManualGroupBatches(channel)
    const nidBytes = byteSizeOfNetworkType(protocol.nidType)
    const ntypeBytes = byteSizeOfNetworkType(protocol.ntypeType)
    const ntypes = channel.manualGroupNTypes
    const groups = channel.manualGroupSchemas
    const offsets = channel.manualGroupValueOffsets
    const values = channel.manualGroupValues

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

function writeEcsManualGroupUpdates(channel: EcsManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    const batches = collectManualGroupBatches(channel)
    const nids = channel.manualGroupNids
    const ntypes = channel.manualGroupNTypes
    const groups = channel.manualGroupSchemas
    const offsets = channel.manualGroupValueOffsets
    const values = channel.manualGroupValues

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

export function writeEcsManualUpdates(channel: EcsManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig) {
    writeManualPropUpdates(channel, writer, protocol)
    writeEcsManualGroupUpdates(channel, writer, protocol)
}

export function countManualGroupedProps(channel: ManualUpdateLog) {
    let props = 0
    const groups = channel.manualGroupSchemas
    for (let i = 0; i < groups.length; i++) {
        props += groups[i].props.length
    }
    return props
}

export function getManualUpdateFragment(
    user: User,
    instance: Instance,
    channel: EcsManualUpdateLog & { nid: number },
    keyPrefix: string
) {
    const protocol = instance.network.getProtocol()
    const key = `${instance.tick}:${channel.nid}:${keyPrefix}:${protocol.nidType}:${protocol.ntypeType}`
    const cached = instance.network.sharedUpdateFragments.get(key) as ManualUpdateFragment | undefined
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
    const bytes = countEcsManualUpdateBytes(channel, protocol)
    if (measure) {
        countMs = performance.now() - countStart
        writeStart = performance.now()
    }
    const writer = user.networkAdapter.binary.createWriter(bytes)
    writeEcsManualUpdates(channel, writer, protocol)
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
