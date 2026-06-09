import { BinarySection } from '../../common/binary/BinarySection'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { DEFAULT_PROTOCOL, ProtocolConfig, writeNetworkId } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'
import { countEndpointPayload, writeEndpointPayload } from '../endpoint/EndpointPayload'
import { writeEntity } from '../entity/writeEntity'
import writeDiff from '../entity/writeDiff'
import writeUpdateGroup from '../entity/writeUpdateGroup'
import { writeMessage } from '../message/writeMessage'
import { SnapshotPlan } from './SnapshotPlan'
import { createBinaryDebugError, BinaryDebugFields } from '../BinaryDebugError'
import { Schema } from '../../common/binary/schema/Schema'
import { IEntity } from '../../common/IEntity'

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

function writeChannelEntityCreates(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.channelEntityCreates.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.ChannelEntityCreates)
    writer.writeUInt32(plan.channelEntityCreates.length)
    for (let i = 0; i < plan.channelEntityCreates.length; i++) {
        writeNetworkId(plan.channelEntityCreates[i].nid, protocol.nidType, writer)
        writeNetworkId(plan.channelEntityCreates[i].channelId, protocol.nidType, writer)
    }
}

function writeChannelHeaderCreates(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.channelHeaderCreates.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.ChannelHeaderCreates)
    writer.writeUInt32(plan.channelHeaderCreates.length)
    for (let i = 0; i < plan.channelHeaderCreates.length; i++) {
        const create = plan.channelHeaderCreates[i]
        writeNetworkId(create.channelId, protocol.nidType, writer)
        writeEntity(create.header, context.getSchema(create.header.ntype)!, writer, protocol.ntypeType, protocol.nidType)
    }
}

function writeChannelHeaderUpdates(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.channelHeaderUpdates.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.ChannelHeaderUpdates)
    writer.writeUInt32(plan.channelHeaderUpdates.length)
    for (let i = 0; i < plan.channelHeaderUpdates.length; i++) {
        const update = plan.channelHeaderUpdates[i]
        writeNetworkId(update.channelId, protocol.nidType, writer)
        writer.writeUInt32(update.changes.length)
        for (let j = 0; j < update.changes.length; j++) {
            const diff = update.changes[j]
            writeDiff(diff.nid, diff, diff.nschema, writer, protocol.nidType)
        }
        writer.writeUInt32(update.groups.length)
        for (let j = 0; j < update.groups.length; j++) {
            writeUpdateGroup(update.groups[j], writer, protocol.nidType)
        }
    }
}

function writeChannelHeaderDeletes(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.channelHeaderDeletes.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.ChannelHeaderDeletes)
    writer.writeUInt32(plan.channelHeaderDeletes.length)
    for (let i = 0; i < plan.channelHeaderDeletes.length; i++) {
        writeNetworkId(plan.channelHeaderDeletes[i].channelId, protocol.nidType, writer)
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

function writeEcsCreateEntities(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsCreateEntities.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.EcsCreateEntities)
    writer.writeUInt32(plan.ecsCreateEntities.length)
    for (let i = 0; i < plan.ecsCreateEntities.length; i++) {
        writeNetworkId(plan.ecsCreateEntities[i], protocol.nidType, writer)
    }
}

function writeEcsCreateComponents(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsCreateComponents.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.EcsCreateComponents)
    writer.writeUInt32(plan.ecsCreateComponents.length)
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i] as any
        writeNetworkId(component.pid, protocol.nidType, writer)
        const nschema = context.getSchema(component.ntype)!
        writeEntity(component, nschema, writer, protocol.ntypeType, protocol.nidType)
    }
}

function writeEcsDeleteEntities(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsDeleteEntities.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.EcsDeleteEntities)
    writer.writeUInt32(plan.ecsDeleteEntities.length)
    for (let i = 0; i < plan.ecsDeleteEntities.length; i++) {
        writeNetworkId(plan.ecsDeleteEntities[i], protocol.nidType, writer)
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

function writeUpdateEntityGroups(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.updateEntityGroups.length === 0) {
        return
    }

    writer.writeUInt8(BinarySection.UpdateEntityGroups)
    writer.writeUInt32(plan.updateEntityGroups.length)
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        writeUpdateGroup(plan.updateEntityGroups[i], writer, protocol.nidType)
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
    writeChannelHeaderCreates(plan, context, writer, protocol)
    writeChannelHeaderUpdates(plan, writer, protocol)
    writeChannelHeaderDeletes(plan, writer, protocol)
    writeChannelEntityCreates(plan, writer, protocol)
    writeEcsCreateEntities(plan, writer, protocol)
    writeEcsCreateComponents(plan, context, writer, protocol)
    writeCreateEntities(plan, context, writer, protocol)
    writeUpdateEntities(plan, writer, protocol)
    writeUpdateEntityGroups(plan, writer, protocol)
    writeEcsDeleteEntities(plan, writer, protocol)
    writeDeleteEntities(plan, writer, protocol)
}

export function writeSnapshotDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig = DEFAULT_PROTOCOL) {
    writeEngineMessagesDebug(plan, context, writer)
    writeMessagesDebug(plan, context, writer, protocol)
    writeResponsesDebug(plan, writer)
    writeChannelHeaderCreates(plan, context, writer, protocol)
    writeChannelHeaderUpdates(plan, writer, protocol)
    writeChannelHeaderDeletes(plan, writer, protocol)
    writeChannelEntityCreates(plan, writer, protocol)
    writeEcsCreateEntitiesDebug(plan, writer, protocol)
    writeEcsCreateComponentsDebug(plan, context, writer, protocol)
    writeCreateEntitiesDebug(plan, context, writer, protocol)
    writeUpdateEntitiesDebug(plan, writer, protocol)
    writeUpdateEntityGroupsDebug(plan, writer, protocol)
    writeEcsDeleteEntitiesDebug(plan, writer, protocol)
    writeDeleteEntitiesDebug(plan, writer, protocol)
}

function wrapBinaryWrite(context: BinaryDebugFields, write: () => void) {
    try {
        write()
    } catch (err) {
        throw createBinaryDebugError(err, context)
    }
}

function offsetOf(writer: IBinaryWriter) {
    return writer.offset
}

function writeMessageDebug(obj: any, schema: Schema, writer: IBinaryWriter, section: string, index: number, ntypeType?: any) {
    wrapBinaryWrite({ phase: 'write', section, index, ntype: obj.ntype, offset: offsetOf(writer) }, () => {
        writeNetworkId(obj.ntype, ntypeType ?? DEFAULT_PROTOCOL.ntypeType, writer)
    })
    for (let i = 0; i < schema.keys.length; i++) {
        const prop = schema.keys[i]
        const value = obj[prop.prop]
        wrapBinaryWrite({
            phase: 'write',
            section,
            index,
            ntype: obj.ntype,
            prop: prop.prop,
            propKey: prop.key,
            binaryType: prop.type,
            offset: offsetOf(writer),
            value
        }, () => prop.binary.write(value, writer))
    }
}

function writeEntityDebug(entity: IEntity, schema: Schema, writer: IBinaryWriter, index: number, protocol: ProtocolConfig, section = 'CreateEntities') {
    wrapBinaryWrite({ phase: 'write', section, index, ntype: entity.ntype, nid: entity.nid, offset: offsetOf(writer) }, () => {
        writeNetworkId(entity.ntype, protocol.ntypeType, writer)
        writeNetworkId(entity.nid, protocol.nidType, writer)
    })
    for (let i = 0; i < schema.keys.length; i++) {
        const prop = schema.keys[i]
        const value = entity[prop.prop]
        wrapBinaryWrite({
            phase: 'write',
            section,
            index,
            ntype: entity.ntype,
            nid: entity.nid,
            prop: prop.prop,
            propKey: prop.key,
            binaryType: prop.type,
            offset: offsetOf(writer),
            value
        }, () => prop.binary.write(value, writer))
    }
}

function writeDiffDebug(diff: any, writer: IBinaryWriter, index: number, protocol: ProtocolConfig) {
    const prop = diff.nschema.props[diff.prop]
    wrapBinaryWrite({ phase: 'write', section: 'UpdateEntities', index, nid: diff.nid, prop: diff.prop, propKey: prop.key, binaryType: prop.type, offset: offsetOf(writer), value: diff.value }, () => {
        writeNetworkId(diff.nid, protocol.nidType, writer)
        writer.writeUInt8(prop.key)
        prop.binary.write(diff.value, writer)
    })
}

function writeUpdateGroupDebug(update: any, writer: IBinaryWriter, index: number, protocol: ProtocolConfig) {
    wrapBinaryWrite({ phase: 'write', section: 'UpdateEntityGroups', index, nid: update.nid, prop: update.group.name, propKey: update.group.key, offset: offsetOf(writer), value: update.values }, () => {
        writeUpdateGroup(update, writer, protocol.nidType)
    })
}

function writeEngineMessagesDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter) {
    if (plan.engineMessages.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.EngineMessages)
    writer.writeUInt8(plan.engineMessages.length)
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i]
        writeMessageDebug(engineMessage, context.getEngineSchema(engineMessage.ntype)!, writer, 'EngineMessages', i)
    }
}

function writeMessagesDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.messages.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.Messages)
    writer.writeUInt32(plan.messages.length)
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i]
        writeMessageDebug(message, context.getSchema(message.ntype)!, writer, 'Messages', i, protocol.ntypeType)
    }
}

function writeResponsesDebug(plan: SnapshotPlan, writer: IBinaryWriter) {
    if (plan.responses.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.Responses)
    writer.writeUInt8(plan.responses.length)
    for (let i = 0; i < plan.responses.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'Responses', index: i, offset: offsetOf(writer) }, () => {
            writer.writeUInt32(plan.responses[i].requestId)
            writer.writeUInt8(plan.responses[i].status)
            writer.writeUInt32(countEndpointPayload(plan.responses[i].payload))
            writeEndpointPayload(plan.responses[i].payload, writer)
        })
    }
}

function writeCreateEntitiesDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.createEntities.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.CreateEntities)
    writer.writeUInt32(plan.createEntities.length)
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i]
        writeEntityDebug(entity, context.getSchema(entity.ntype)!, writer, i, protocol)
    }
}

function writeEcsCreateEntitiesDebug(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsCreateEntities.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.EcsCreateEntities)
    writer.writeUInt32(plan.ecsCreateEntities.length)
    for (let i = 0; i < plan.ecsCreateEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'EcsCreateEntities', index: i, nid: plan.ecsCreateEntities[i], offset: offsetOf(writer) }, () => {
            writeNetworkId(plan.ecsCreateEntities[i], protocol.nidType, writer)
        })
    }
}

function writeEcsCreateComponentsDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsCreateComponents.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.EcsCreateComponents)
    writer.writeUInt32(plan.ecsCreateComponents.length)
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i] as any
        wrapBinaryWrite({ phase: 'write', section: 'EcsCreateComponents', index: i, nid: component.nid, offset: offsetOf(writer) }, () => {
            writeNetworkId(component.pid, protocol.nidType, writer)
        })
        writeEntityDebug(component, context.getSchema(component.ntype)!, writer, i, protocol, 'EcsCreateComponents')
    }
}

function writeUpdateEntitiesDebug(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.updateEntities.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.UpdateEntities)
    writer.writeUInt32(plan.updateEntities.length)
    for (let i = 0; i < plan.updateEntities.length; i++) {
        writeDiffDebug(plan.updateEntities[i], writer, i, protocol)
    }
}

function writeUpdateEntityGroupsDebug(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.updateEntityGroups.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.UpdateEntityGroups)
    writer.writeUInt32(plan.updateEntityGroups.length)
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        writeUpdateGroupDebug(plan.updateEntityGroups[i], writer, i, protocol)
    }
}

function writeDeleteEntitiesDebug(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.deleteEntities.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.DeleteEntities)
    writer.writeUInt32(plan.deleteEntities.length)
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'DeleteEntities', index: i, nid: plan.deleteEntities[i], offset: offsetOf(writer) }, () => {
            writeNetworkId(plan.deleteEntities[i], protocol.nidType, writer)
        })
    }
}

function writeEcsDeleteEntitiesDebug(plan: SnapshotPlan, writer: IBinaryWriter, protocol: ProtocolConfig) {
    if (plan.ecsDeleteEntities.length === 0) {
        return
    }
    writer.writeUInt8(BinarySection.EcsDeleteEntities)
    writer.writeUInt32(plan.ecsDeleteEntities.length)
    for (let i = 0; i < plan.ecsDeleteEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'EcsDeleteEntities', index: i, nid: plan.ecsDeleteEntities[i], offset: offsetOf(writer) }, () => {
            writeNetworkId(plan.ecsDeleteEntities[i], protocol.nidType, writer)
        })
    }
}
