"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSnapshot = writeSnapshot;
exports.writeSnapshotDebug = writeSnapshotDebug;
const BinarySection_1 = require("../../common/binary/BinarySection");
const Protocol_1 = require("../../common/binary/Protocol");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
const writeEntity_1 = require("../entity/writeEntity");
const writeDiff_1 = __importDefault(require("../entity/writeDiff"));
const writeUpdateGroup_1 = __importDefault(require("../entity/writeUpdateGroup"));
const writeMessage_1 = require("../message/writeMessage");
const BinaryDebugError_1 = require("../BinaryDebugError");
function writeEngineMessages(plan, context, writer) {
    if (plan.engineMessages.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
    writer.writeUInt8(plan.engineMessages.length);
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i];
        const nschema = context.getEngineSchema(engineMessage.ntype);
        (0, writeMessage_1.writeMessage)(engineMessage, nschema, writer);
    }
}
function writeMessages(plan, context, writer, protocol) {
    if (plan.messages.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.Messages);
    writer.writeUInt32(plan.messages.length);
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i];
        const nschema = context.getSchema(message.ntype);
        (0, writeMessage_1.writeMessage)(message, nschema, writer, protocol.ntypeType);
    }
}
function writeResponses(plan, writer) {
    if (plan.responses.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.Responses);
    writer.writeUInt8(plan.responses.length);
    for (let i = 0; i < plan.responses.length; i++) {
        writer.writeUInt32(plan.responses[i].requestId);
        writer.writeUInt8(plan.responses[i].status);
        writer.writeUInt32((0, EndpointPayload_1.countEndpointPayload)(plan.responses[i].payload));
        (0, EndpointPayload_1.writeEndpointPayload)(plan.responses[i].payload, writer);
    }
}
function writeChannelEntityCreates(plan, writer, protocol) {
    if (plan.channelEntityCreates.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.ChannelEntityCreates);
    writer.writeUInt32(plan.channelEntityCreates.length);
    for (let i = 0; i < plan.channelEntityCreates.length; i++) {
        (0, Protocol_1.writeNetworkId)(plan.channelEntityCreates[i].nid, protocol.nidType, writer);
        (0, Protocol_1.writeNetworkId)(plan.channelEntityCreates[i].channelId, protocol.nidType, writer);
    }
}
function writeChannelHeaderCreates(plan, context, writer, protocol) {
    if (plan.channelHeaderCreates.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.ChannelHeaderCreates);
    writer.writeUInt32(plan.channelHeaderCreates.length);
    for (let i = 0; i < plan.channelHeaderCreates.length; i++) {
        const create = plan.channelHeaderCreates[i];
        (0, Protocol_1.writeNetworkId)(create.channelId, protocol.nidType, writer);
        (0, writeEntity_1.writeEntity)(create.header, context.getSchema(create.header.ntype), writer, protocol.ntypeType, protocol.nidType);
    }
}
function writeChannelHeaderUpdates(plan, writer, protocol) {
    if (plan.channelHeaderUpdates.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.ChannelHeaderUpdates);
    writer.writeUInt32(plan.channelHeaderUpdates.length);
    for (let i = 0; i < plan.channelHeaderUpdates.length; i++) {
        const update = plan.channelHeaderUpdates[i];
        (0, Protocol_1.writeNetworkId)(update.channelId, protocol.nidType, writer);
        writer.writeUInt32(update.changes.length);
        for (let j = 0; j < update.changes.length; j++) {
            const diff = update.changes[j];
            (0, writeDiff_1.default)(diff.nid, diff, diff.nschema, writer, protocol.nidType);
        }
        writer.writeUInt32(update.groups.length);
        for (let j = 0; j < update.groups.length; j++) {
            (0, writeUpdateGroup_1.default)(update.groups[j], writer, protocol.nidType);
        }
    }
}
function writeChannelHeaderDeletes(plan, writer, protocol) {
    if (plan.channelHeaderDeletes.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.ChannelHeaderDeletes);
    writer.writeUInt32(plan.channelHeaderDeletes.length);
    for (let i = 0; i < plan.channelHeaderDeletes.length; i++) {
        (0, Protocol_1.writeNetworkId)(plan.channelHeaderDeletes[i].channelId, protocol.nidType, writer);
    }
}
function writeCreateEntities(plan, context, writer, protocol) {
    if (plan.createEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.CreateEntities);
    writer.writeUInt32(plan.createEntities.length);
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i];
        const nschema = context.getSchema(entity.ntype);
        (0, writeEntity_1.writeEntity)(entity, nschema, writer, protocol.ntypeType, protocol.nidType);
    }
}
function writeEcsCreateEntities(plan, writer, protocol) {
    if (plan.ecsCreateEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsCreateEntities);
    writer.writeUInt32(plan.ecsCreateEntities.length);
    for (let i = 0; i < plan.ecsCreateEntities.length; i++) {
        (0, Protocol_1.writeNetworkId)(plan.ecsCreateEntities[i], protocol.nidType, writer);
    }
}
function writeEcsCreateComponents(plan, context, writer, protocol) {
    if (plan.ecsCreateComponents.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsCreateComponents);
    writer.writeUInt32(plan.ecsCreateComponents.length);
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i];
        (0, Protocol_1.writeNetworkId)(component.pid, protocol.nidType, writer);
        const nschema = context.getSchema(component.ntype);
        (0, writeEntity_1.writeEntity)(component, nschema, writer, protocol.ntypeType, protocol.nidType);
    }
}
function writeEcsDeleteEntities(plan, writer, protocol) {
    if (plan.ecsDeleteEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsDeleteEntities);
    writer.writeUInt32(plan.ecsDeleteEntities.length);
    for (let i = 0; i < plan.ecsDeleteEntities.length; i++) {
        (0, Protocol_1.writeNetworkId)(plan.ecsDeleteEntities[i], protocol.nidType, writer);
    }
}
function writeUpdateEntities(plan, writer, protocol) {
    if (plan.updateEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntities);
    writer.writeUInt32(plan.updateEntities.length);
    for (let i = 0; i < plan.updateEntities.length; i++) {
        const diff = plan.updateEntities[i];
        (0, writeDiff_1.default)(diff.nid, diff, diff.nschema, writer, protocol.nidType);
    }
}
function writeUpdateEntityGroups(plan, writer, protocol) {
    if (plan.updateEntityGroups.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntityGroups);
    writer.writeUInt32(plan.updateEntityGroups.length);
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        (0, writeUpdateGroup_1.default)(plan.updateEntityGroups[i], writer, protocol.nidType);
    }
}
function writeDeleteEntities(plan, writer, protocol) {
    if (plan.deleteEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.DeleteEntities);
    writer.writeUInt32(plan.deleteEntities.length);
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        (0, Protocol_1.writeNetworkId)(plan.deleteEntities[i], protocol.nidType, writer);
    }
}
function writeSnapshot(plan, context, writer, protocol = Protocol_1.DEFAULT_PROTOCOL) {
    writeEngineMessages(plan, context, writer);
    writeMessages(plan, context, writer, protocol);
    writeResponses(plan, writer);
    writeChannelHeaderCreates(plan, context, writer, protocol);
    writeChannelHeaderUpdates(plan, writer, protocol);
    writeChannelHeaderDeletes(plan, writer, protocol);
    writeChannelEntityCreates(plan, writer, protocol);
    writeEcsCreateEntities(plan, writer, protocol);
    writeEcsCreateComponents(plan, context, writer, protocol);
    writeCreateEntities(plan, context, writer, protocol);
    writeUpdateEntities(plan, writer, protocol);
    writeUpdateEntityGroups(plan, writer, protocol);
    writeEcsDeleteEntities(plan, writer, protocol);
    writeDeleteEntities(plan, writer, protocol);
}
function writeSnapshotDebug(plan, context, writer, protocol = Protocol_1.DEFAULT_PROTOCOL) {
    writeEngineMessagesDebug(plan, context, writer);
    writeMessagesDebug(plan, context, writer, protocol);
    writeResponsesDebug(plan, writer);
    writeChannelHeaderCreates(plan, context, writer, protocol);
    writeChannelHeaderUpdates(plan, writer, protocol);
    writeChannelHeaderDeletes(plan, writer, protocol);
    writeChannelEntityCreates(plan, writer, protocol);
    writeEcsCreateEntitiesDebug(plan, writer, protocol);
    writeEcsCreateComponentsDebug(plan, context, writer, protocol);
    writeCreateEntitiesDebug(plan, context, writer, protocol);
    writeUpdateEntitiesDebug(plan, writer, protocol);
    writeUpdateEntityGroupsDebug(plan, writer, protocol);
    writeEcsDeleteEntitiesDebug(plan, writer, protocol);
    writeDeleteEntitiesDebug(plan, writer, protocol);
}
function wrapBinaryWrite(context, write) {
    try {
        write();
    }
    catch (err) {
        throw (0, BinaryDebugError_1.createBinaryDebugError)(err, context);
    }
}
function offsetOf(writer) {
    return writer.offset;
}
function writeMessageDebug(obj, schema, writer, section, index, ntypeType) {
    wrapBinaryWrite({ phase: 'write', section, index, ntype: obj.ntype, offset: offsetOf(writer) }, () => {
        (0, Protocol_1.writeNetworkId)(obj.ntype, ntypeType !== null && ntypeType !== void 0 ? ntypeType : Protocol_1.DEFAULT_PROTOCOL.ntypeType, writer);
    });
    for (let i = 0; i < schema.keys.length; i++) {
        const prop = schema.keys[i];
        const value = obj[prop.prop];
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
        }, () => prop.binary.write(value, writer));
    }
}
function writeEntityDebug(entity, schema, writer, index, protocol, section = 'CreateEntities') {
    wrapBinaryWrite({ phase: 'write', section, index, ntype: entity.ntype, nid: entity.nid, offset: offsetOf(writer) }, () => {
        (0, Protocol_1.writeNetworkId)(entity.ntype, protocol.ntypeType, writer);
        (0, Protocol_1.writeNetworkId)(entity.nid, protocol.nidType, writer);
    });
    for (let i = 0; i < schema.keys.length; i++) {
        const prop = schema.keys[i];
        const value = entity[prop.prop];
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
        }, () => prop.binary.write(value, writer));
    }
}
function writeDiffDebug(diff, writer, index, protocol) {
    const prop = diff.nschema.props[diff.prop];
    wrapBinaryWrite({ phase: 'write', section: 'UpdateEntities', index, nid: diff.nid, prop: diff.prop, propKey: prop.key, binaryType: prop.type, offset: offsetOf(writer), value: diff.value }, () => {
        (0, Protocol_1.writeNetworkId)(diff.nid, protocol.nidType, writer);
        writer.writeUInt8(prop.key);
        prop.binary.write(diff.value, writer);
    });
}
function writeUpdateGroupDebug(update, writer, index, protocol) {
    wrapBinaryWrite({ phase: 'write', section: 'UpdateEntityGroups', index, nid: update.nid, prop: update.group.name, propKey: update.group.key, offset: offsetOf(writer), value: update.values }, () => {
        (0, writeUpdateGroup_1.default)(update, writer, protocol.nidType);
    });
}
function writeEngineMessagesDebug(plan, context, writer) {
    if (plan.engineMessages.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EngineMessages);
    writer.writeUInt8(plan.engineMessages.length);
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i];
        writeMessageDebug(engineMessage, context.getEngineSchema(engineMessage.ntype), writer, 'EngineMessages', i);
    }
}
function writeMessagesDebug(plan, context, writer, protocol) {
    if (plan.messages.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.Messages);
    writer.writeUInt32(plan.messages.length);
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i];
        writeMessageDebug(message, context.getSchema(message.ntype), writer, 'Messages', i, protocol.ntypeType);
    }
}
function writeResponsesDebug(plan, writer) {
    if (plan.responses.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.Responses);
    writer.writeUInt8(plan.responses.length);
    for (let i = 0; i < plan.responses.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'Responses', index: i, offset: offsetOf(writer) }, () => {
            writer.writeUInt32(plan.responses[i].requestId);
            writer.writeUInt8(plan.responses[i].status);
            writer.writeUInt32((0, EndpointPayload_1.countEndpointPayload)(plan.responses[i].payload));
            (0, EndpointPayload_1.writeEndpointPayload)(plan.responses[i].payload, writer);
        });
    }
}
function writeCreateEntitiesDebug(plan, context, writer, protocol) {
    if (plan.createEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.CreateEntities);
    writer.writeUInt32(plan.createEntities.length);
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i];
        writeEntityDebug(entity, context.getSchema(entity.ntype), writer, i, protocol);
    }
}
function writeEcsCreateEntitiesDebug(plan, writer, protocol) {
    if (plan.ecsCreateEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsCreateEntities);
    writer.writeUInt32(plan.ecsCreateEntities.length);
    for (let i = 0; i < plan.ecsCreateEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'EcsCreateEntities', index: i, nid: plan.ecsCreateEntities[i], offset: offsetOf(writer) }, () => {
            (0, Protocol_1.writeNetworkId)(plan.ecsCreateEntities[i], protocol.nidType, writer);
        });
    }
}
function writeEcsCreateComponentsDebug(plan, context, writer, protocol) {
    if (plan.ecsCreateComponents.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsCreateComponents);
    writer.writeUInt32(plan.ecsCreateComponents.length);
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i];
        wrapBinaryWrite({ phase: 'write', section: 'EcsCreateComponents', index: i, nid: component.nid, offset: offsetOf(writer) }, () => {
            (0, Protocol_1.writeNetworkId)(component.pid, protocol.nidType, writer);
        });
        writeEntityDebug(component, context.getSchema(component.ntype), writer, i, protocol, 'EcsCreateComponents');
    }
}
function writeUpdateEntitiesDebug(plan, writer, protocol) {
    if (plan.updateEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntities);
    writer.writeUInt32(plan.updateEntities.length);
    for (let i = 0; i < plan.updateEntities.length; i++) {
        writeDiffDebug(plan.updateEntities[i], writer, i, protocol);
    }
}
function writeUpdateEntityGroupsDebug(plan, writer, protocol) {
    if (plan.updateEntityGroups.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntityGroups);
    writer.writeUInt32(plan.updateEntityGroups.length);
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        writeUpdateGroupDebug(plan.updateEntityGroups[i], writer, i, protocol);
    }
}
function writeDeleteEntitiesDebug(plan, writer, protocol) {
    if (plan.deleteEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.DeleteEntities);
    writer.writeUInt32(plan.deleteEntities.length);
    for (let i = 0; i < plan.deleteEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'DeleteEntities', index: i, nid: plan.deleteEntities[i], offset: offsetOf(writer) }, () => {
            (0, Protocol_1.writeNetworkId)(plan.deleteEntities[i], protocol.nidType, writer);
        });
    }
}
function writeEcsDeleteEntitiesDebug(plan, writer, protocol) {
    if (plan.ecsDeleteEntities.length === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.EcsDeleteEntities);
    writer.writeUInt32(plan.ecsDeleteEntities.length);
    for (let i = 0; i < plan.ecsDeleteEntities.length; i++) {
        wrapBinaryWrite({ phase: 'write', section: 'EcsDeleteEntities', index: i, nid: plan.ecsDeleteEntities[i], offset: offsetOf(writer) }, () => {
            (0, Protocol_1.writeNetworkId)(plan.ecsDeleteEntities[i], protocol.nidType, writer);
        });
    }
}
