"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSnapshot = writeSnapshot;
const BinarySection_1 = require("../../common/binary/BinarySection");
const Protocol_1 = require("../../common/binary/Protocol");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
const writeEntity_1 = require("../entity/writeEntity");
const writeDiff_1 = __importDefault(require("../entity/writeDiff"));
const writeMessage_1 = require("../message/writeMessage");
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
    writeCreateEntities(plan, context, writer, protocol);
    writeUpdateEntities(plan, writer, protocol);
    writeDeleteEntities(plan, writer, protocol);
}
