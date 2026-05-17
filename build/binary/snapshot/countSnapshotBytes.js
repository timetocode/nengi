"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countSnapshotBytes = countSnapshotBytes;
const Protocol_1 = require("../../common/binary/Protocol");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
const countEntity_1 = __importDefault(require("../entity/countEntity"));
const countDiff_1 = __importDefault(require("../entity/countDiff"));
const count_1 = __importDefault(require("../message/count"));
const SECTION_BYTES = 1;
const UINT8_COUNT_BYTES = 1;
const UINT32_COUNT_BYTES = 4;
const UINT32_BYTES = 4;
const RESPONSE_STATUS_BYTES = 1;
function countEngineMessages(plan, context) {
    if (plan.engineMessages.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT8_COUNT_BYTES;
    for (let i = 0; i < plan.engineMessages.length; i++) {
        const engineMessage = plan.engineMessages[i];
        const nschema = context.getEngineSchema(engineMessage.ntype);
        bytes += (0, count_1.default)(nschema, engineMessage);
    }
    return bytes;
}
function countMessages(plan, context, protocol) {
    if (plan.messages.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.messages.length; i++) {
        const message = plan.messages[i];
        const nschema = context.getSchema(message.ntype);
        bytes += (0, count_1.default)(nschema, message, protocol.ntypeType);
    }
    return bytes;
}
function countResponses(plan) {
    if (plan.responses.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT8_COUNT_BYTES;
    for (let i = 0; i < plan.responses.length; i++) {
        bytes += UINT32_BYTES;
        bytes += RESPONSE_STATUS_BYTES;
        bytes += UINT32_BYTES;
        bytes += (0, EndpointPayload_1.countEndpointPayload)(plan.responses[i].payload);
    }
    return bytes;
}
function countCreateEntities(plan, context, protocol) {
    if (plan.createEntities.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.createEntities.length; i++) {
        const entity = plan.createEntities[i];
        const nschema = context.getSchema(entity.ntype);
        bytes += (0, countEntity_1.default)(nschema, entity, protocol.ntypeType, protocol.nidType);
    }
    return bytes;
}
function countUpdateEntities(plan, protocol) {
    if (plan.updateEntities.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.updateEntities.length; i++) {
        const diff = plan.updateEntities[i];
        bytes += (0, countDiff_1.default)(diff, diff.nschema, protocol.nidType);
    }
    return bytes;
}
function countDeleteEntities(plan, protocol) {
    if (plan.deleteEntities.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.deleteEntities.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType));
}
function countSnapshotBytes(plan, context, protocol = Protocol_1.DEFAULT_PROTOCOL) {
    return countEngineMessages(plan, context) +
        countMessages(plan, context, protocol) +
        countResponses(plan) +
        countCreateEntities(plan, context, protocol) +
        countUpdateEntities(plan, protocol) +
        countDeleteEntities(plan, protocol);
}
