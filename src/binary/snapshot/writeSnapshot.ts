import { BinarySection } from '../../common/binary/BinarySection'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { DEFAULT_PROTOCOL, ProtocolConfig, writeNetworkId } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'
import { countEndpointPayload, writeEndpointPayload } from '../endpoint/EndpointPayload'
import { writeEntity } from '../entity/writeEntity'
import writeDiff from '../entity/writeDiff'
import { writeMessage } from '../message/writeMessage'
import { SnapshotPlan } from './SnapshotPlan'

function writeEngineMessages(plan: SnapshotPlan, context: Context, writer: IBinaryWriter) {
    if (plan.engineMessages.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.EngineMessages)
    writer.writeUInt8(plan.engineMessages.length)
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i]
        const nschema = context.getEngineSchema(engineMessage.ntype)!
        writeMessage(engineMessage, nschema, writer)
    }
}

function writeMessages(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.messages.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.Messages)
    writer.writeUInt32(plan.messages.length)
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i]
        const nschema = context.getSchema(message.ntype)!
        writeMessage(message, nschema, writer, protocol.ntypeType)
    }
}

function writeResponses(plan: SnapshotPlan, writer: IBinaryWriter) {
    if (plan.responses.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.Responses)
    writer.writeUInt8(plan.responses.length)
    for (let i = 0; i < plan.responses.length; i++) {
        writer.writeUInt32(plan.responses[i].requestId)
        writer.writeUInt8(plan.responses[i].status)
        writer.writeUInt32(countEndpointPayload(plan.responses[i].payload))
        writeEndpointPayload(plan.responses[i].payload, writer)
    }
}

function writeCreateEntities(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.createEntities.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.CreateEntities)
    writer.writeUInt32(plan.createEntities.length)
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i]
        const nschema = context.getSchema(entity.ntype)!
        writeEntity(entity, nschema, writer, protocol.ntypeType, protocol.nidType)
    }
}

function writeUpdateEntities(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.updateEntities.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntities)
    writer.writeUInt32(plan.updateEntities.length)
    for (let i = 0; i < plan.updateEntities.length; i++) {
        const diff = plan.updateEntities[i]
        writeDiff(diff.nid, diff, diff.nschema, writer, protocol.nidType)
    }
}

function writeDeleteEntities(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.deleteEntities.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.DeleteEntities)
    writer.writeUInt32(plan.deleteEntities.length)
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        writeNetworkId(plan.deleteEntities[i], protocol.nidType, writer)
    }
}

export function writeSnapshot(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig = DEFAULT_PROTOCOL) {
    writeEngineMessages(plan, context, writer)
    writeMessages(plan, context, writer, protocol)
    writeResponses(plan, writer)
    writeCreateEntities(plan, context, writer, protocol)
    writeUpdateEntities(plan, writer, protocol)
    writeDeleteEntities(plan, writer, protocol)
}
