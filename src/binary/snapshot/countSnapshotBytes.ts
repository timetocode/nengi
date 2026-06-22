import { Context } from '../../common/Context'
import { IEntity } from '../../common/IEntity'
import { Binary } from '../../common/binary/Binary'
import { binaryGet } from '../../common/binary/BinaryExt'
import { DEFAULT_PROTOCOL, ProtocolConfig, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { countEndpointPayload } from '../endpoint/EndpointPayload'
import countEntity from '../entity/countEntity'
import countDiff from '../entity/countDiff'
import countUpdateGroup from '../entity/countUpdateGroup'
import countMessage from '../message/count'
import { SnapshotPlan } from './SnapshotPlan'
import { hasSchemaBackedChannelHeader } from '../../common/ChannelHeader'

const SECTION_BYTES = 1
const UINT8_COUNT_BYTES = 1
const UINT32_COUNT_BYTES = 4
const UINT32_BYTES = 4
const RESPONSE_STATUS_BYTES = 1

function countChannelOpens(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    if (plan.channelOpens.length === 0) {
        return 0
    }

    const stringBinary = binaryGet(Binary.String)
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.channelOpens.length; i++) {
        bytes += byteSizeOfNetworkType(protocol.nidType)
        bytes += 1
        bytes += stringBinary.byteSize(plan.channelOpens[i].header.name || '')
        bytes += 1
        if (hasSchemaBackedChannelHeader(plan.channelOpens[i].header)) {
            const header = plan.channelOpens[i].header
            bytes += countEntity(context.getSchema(header.ntype)!, header, protocol.ntypeType, protocol.nidType)
        }
    }
    return bytes
}

export function countChannelHeaderUpdateSection(updates: SnapshotPlan['channelHeaderUpdates'], protocol: ProtocolConfig) {
    if (updates.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < updates.length; i++) {
        const update = updates[i]
        bytes += byteSizeOfNetworkType(protocol.nidType)
        bytes += UINT32_COUNT_BYTES
        for (let j = 0; j < update.changes.length; j++) {
            const diff = update.changes[j]
            bytes += countDiff(diff, diff.nschema, protocol.nidType)
        }
        bytes += UINT32_COUNT_BYTES
        for (let j = 0; j < update.groups.length; j++) {
            bytes += countUpdateGroup(update.groups[j], protocol.nidType)
        }
    }
    return bytes
}

function countChannelHeaderUpdates(plan: SnapshotPlan, protocol: ProtocolConfig) {
    return countChannelHeaderUpdateSection(plan.channelHeaderUpdates, protocol)
}

function countChannelCloses(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.channelCloses.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.channelCloses.length * byteSizeOfNetworkType(protocol.nidType))
}

function countSkipInterpolation(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.skipInterpolationNids.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.skipInterpolationNids.length * byteSizeOfNetworkType(protocol.nidType))
}

function countEngineMessages(plan: SnapshotPlan, context: Context) {
    if (plan.engineMessages.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT8_COUNT_BYTES
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i]
        const nschema = context.getEngineSchema(engineMessage.ntype)!
        bytes += countMessage(nschema, engineMessage)
    }
    return bytes
}

export function countMessageSection(messages: any[], context: Context, protocol: ProtocolConfig) {
    if (messages.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        const nschema = context.getSchema(message.ntype)!
        bytes += countMessage(nschema, message, protocol.ntypeType)
    }
    return bytes
}

function countMessages(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    return countMessageSection(plan.messages, context, protocol)
}

function countInterpolatedMessages(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    return countMessageSection(plan.interpolatedMessages, context, protocol)
}

function countResponses(plan: SnapshotPlan) {
    if (plan.responses.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT8_COUNT_BYTES
    for (let i = 0; i < plan.responses.length; i++) {
        bytes += UINT32_BYTES
        bytes += RESPONSE_STATUS_BYTES
        bytes += UINT32_BYTES
        bytes += countEndpointPayload(plan.responses[i].payload)
    }
    return bytes
}

function countCreateEntities(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    if (plan.createEntities.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i]
        const nschema = context.getSchema(entity.ntype)!
        bytes += countEntity(nschema, entity, protocol.ntypeType, protocol.nidType)
    }
    return bytes
}

export function countNetworkIdSection(ids: number[], protocol: ProtocolConfig) {
    if (ids.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES + (ids.length * byteSizeOfNetworkType(protocol.nidType))
}

function countEcsCreateEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    return countNetworkIdSection(plan.ecsCreateEntities, protocol)
}

export function countEcsCreateComponentSection(components: IEntity[], context: Context, protocol: ProtocolConfig) {
    if (components.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < components.length; i++) {
        const component = components[i]
        const nschema = context.getSchema(component.ntype)!
        bytes += byteSizeOfNetworkType(protocol.nidType)
        bytes += countEntity(nschema, component, protocol.ntypeType, protocol.nidType)
    }
    return bytes
}

function countEcsCreateComponents(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    return countEcsCreateComponentSection(plan.ecsCreateComponents, context, protocol)
}

function countEcsDeleteEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    return countNetworkIdSection(plan.ecsDeleteEntities, protocol)
}

function countUpdateEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.updateEntities.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.updateEntities.length; i++) {
        const diff = plan.updateEntities[i]
        bytes += countDiff(diff, diff.nschema, protocol.nidType)
    }
    return bytes
}

function countUpdateEntityGroups(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.updateEntityGroups.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        bytes += countUpdateGroup(plan.updateEntityGroups[i], protocol.nidType)
    }
    return bytes
}

function countDeleteEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    return countNetworkIdSection(plan.deleteEntities, protocol)
}

export function countSnapshotBytes(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig = DEFAULT_PROTOCOL) {
    return countEngineMessages(plan, context) +
        countMessages(plan, context, protocol) +
        countInterpolatedMessages(plan, context, protocol) +
        countResponses(plan) +
        countChannelOpens(plan, context, protocol) +
        countChannelHeaderUpdates(plan, protocol) +
        countChannelCloses(plan, protocol) +
        countSkipInterpolation(plan, protocol) +
        countEcsCreateEntities(plan, protocol) +
        countEcsCreateComponents(plan, context, protocol) +
        countCreateEntities(plan, context, protocol) +
        countUpdateEntities(plan, protocol) +
        countUpdateEntityGroups(plan, protocol) +
        countEcsDeleteEntities(plan, protocol) +
        countDeleteEntities(plan, protocol)
}
