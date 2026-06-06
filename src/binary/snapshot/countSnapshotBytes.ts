import { Context } from '../../common/Context'
import { DEFAULT_PROTOCOL, ProtocolConfig, byteSizeOfNetworkType } from '../../common/binary/Protocol'
import { Binary } from '../../common/binary/Binary'
import { binaryGet } from '../../common/binary/BinaryExt'
import { countEndpointPayload } from '../endpoint/EndpointPayload'
import countEntity from '../entity/countEntity'
import countDiff from '../entity/countDiff'
import countUpdateGroup from '../entity/countUpdateGroup'
import countMessage from '../message/count'
import { SnapshotPlan } from './SnapshotPlan'

const SECTION_BYTES = 1
const UINT8_COUNT_BYTES = 1
const UINT32_COUNT_BYTES = 4
const UINT32_BYTES = 4
const RESPONSE_STATUS_BYTES = 1

function countChannelIdentities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.channelIdentities.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    const stringBinary = binaryGet(Binary.String)
    for (let i = 0; i < plan.channelIdentities.length; i++) {
        bytes += byteSizeOfNetworkType(protocol.nidType)
        bytes += stringBinary.byteSize(JSON.stringify(plan.channelIdentities[i].identity) ?? 'null')
    }
    return bytes
}

function countChannelEntityCreates(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.channelEntityCreates.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.channelEntityCreates.length * byteSizeOfNetworkType(protocol.nidType) * 2)
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

function countMessages(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    if (plan.messages.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i]
        const nschema = context.getSchema(message.ntype)!
        bytes += countMessage(nschema, message, protocol.ntypeType)
    }
    return bytes
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

function countEcsCreateEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.ecsCreateEntities.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.ecsCreateEntities.length * byteSizeOfNetworkType(protocol.nidType))
}

function countEcsCreateComponents(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig) {
    if (plan.ecsCreateComponents.length === 0) {
        return 0
    }

    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i]
        const nschema = context.getSchema(component.ntype)!
        bytes += byteSizeOfNetworkType(protocol.nidType)
        bytes += countEntity(nschema, component, protocol.ntypeType, protocol.nidType)
    }
    return bytes
}

function countEcsDeleteEntities(plan: SnapshotPlan, protocol: ProtocolConfig) {
    if (plan.ecsDeleteEntities.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.ecsDeleteEntities.length * byteSizeOfNetworkType(protocol.nidType))
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
    if (plan.deleteEntities.length === 0) {
        return 0
    }

    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.deleteEntities.length * byteSizeOfNetworkType(protocol.nidType))
}

export function countSnapshotBytes(plan: SnapshotPlan, context: Context, protocol: ProtocolConfig = DEFAULT_PROTOCOL) {
    return countEngineMessages(plan, context) +
        countMessages(plan, context, protocol) +
        countResponses(plan) +
        countChannelIdentities(plan, protocol) +
        countChannelEntityCreates(plan, protocol) +
        countEcsCreateEntities(plan, protocol) +
        countEcsCreateComponents(plan, context, protocol) +
        countCreateEntities(plan, context, protocol) +
        countUpdateEntities(plan, protocol) +
        countUpdateEntityGroups(plan, protocol) +
        countEcsDeleteEntities(plan, protocol) +
        countDeleteEntities(plan, protocol)
}
