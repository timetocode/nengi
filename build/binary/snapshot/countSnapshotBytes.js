"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countSnapshotBytes = countSnapshotBytes;
const Binary_1 = require("../../common/binary/Binary");
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Protocol_1 = require("../../common/binary/Protocol");
const EndpointPayload_1 = require("../endpoint/EndpointPayload");
const countEntity_1 = __importDefault(require("../entity/countEntity"));
const countDiff_1 = __importDefault(require("../entity/countDiff"));
const countUpdateGroup_1 = __importDefault(require("../entity/countUpdateGroup"));
const count_1 = __importDefault(require("../message/count"));
const ChannelHeader_1 = require("../../common/ChannelHeader");
const SECTION_BYTES = 1;
const UINT8_COUNT_BYTES = 1;
const UINT32_COUNT_BYTES = 4;
const UINT32_BYTES = 4;
const RESPONSE_STATUS_BYTES = 1;
function countChannelEntityCreates(plan, protocol) {
    if (plan.channelEntityCreates.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.channelEntityCreates.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType) * 2);
}
function countChannelOpens(plan, context, protocol) {
    if (plan.channelOpens.length === 0) {
        return 0;
    }
    const stringBinary = (0, BinaryExt_1.binaryGet)(Binary_1.Binary.String);
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.channelOpens.length; i++) {
        bytes += (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
        bytes += 1;
        bytes += stringBinary.byteSize(plan.channelOpens[i].header.name || '');
        bytes += 1;
        if ((0, ChannelHeader_1.hasSchemaBackedChannelHeader)(plan.channelOpens[i].header)) {
            const header = plan.channelOpens[i].header;
            bytes += (0, countEntity_1.default)(context.getSchema(header.ntype), header, protocol.ntypeType, protocol.nidType);
        }
    }
    return bytes;
}
function countChannelHeaderUpdates(plan, protocol) {
    if (plan.channelHeaderUpdates.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.channelHeaderUpdates.length; i++) {
        const update = plan.channelHeaderUpdates[i];
        bytes += (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
        bytes += UINT32_COUNT_BYTES;
        for (let j = 0; j < update.changes.length; j++) {
            const diff = update.changes[j];
            bytes += (0, countDiff_1.default)(diff, diff.nschema, protocol.nidType);
        }
        bytes += UINT32_COUNT_BYTES;
        for (let j = 0; j < update.groups.length; j++) {
            bytes += (0, countUpdateGroup_1.default)(update.groups[j], protocol.nidType);
        }
    }
    return bytes;
}
function countChannelCloses(plan, protocol) {
    if (plan.channelCloses.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.channelCloses.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType));
}
function countSkipInterpolation(plan, protocol) {
    if (plan.skipInterpolationNids.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES +
        (plan.skipInterpolationNids.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType));
}
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
function countInterpolatedMessages(plan, context, protocol) {
    if (plan.interpolatedMessages.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.interpolatedMessages.length; i++) {
        const message = plan.interpolatedMessages[i];
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
function countEcsCreateEntities(plan, protocol) {
    if (plan.ecsCreateEntities.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.ecsCreateEntities.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType));
}
function countEcsCreateComponents(plan, context, protocol) {
    if (plan.ecsCreateComponents.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.ecsCreateComponents.length; i++) {
        const component = plan.ecsCreateComponents[i];
        const nschema = context.getSchema(component.ntype);
        bytes += (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
        bytes += (0, countEntity_1.default)(nschema, component, protocol.ntypeType, protocol.nidType);
    }
    return bytes;
}
function countEcsDeleteEntities(plan, protocol) {
    if (plan.ecsDeleteEntities.length === 0) {
        return 0;
    }
    return SECTION_BYTES + UINT32_COUNT_BYTES + (plan.ecsDeleteEntities.length * (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType));
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
function countUpdateEntityGroups(plan, protocol) {
    if (plan.updateEntityGroups.length === 0) {
        return 0;
    }
    let bytes = SECTION_BYTES + UINT32_COUNT_BYTES;
    for (let i = 0; i < plan.updateEntityGroups.length; i++) {
        bytes += (0, countUpdateGroup_1.default)(plan.updateEntityGroups[i], protocol.nidType);
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
        countInterpolatedMessages(plan, context, protocol) +
        countResponses(plan) +
        countChannelOpens(plan, context, protocol) +
        countChannelEntityCreates(plan, protocol) +
        countChannelHeaderUpdates(plan, protocol) +
        countChannelCloses(plan, protocol) +
        countSkipInterpolation(plan, protocol) +
        countEcsCreateEntities(plan, protocol) +
        countEcsCreateComponents(plan, context, protocol) +
        countCreateEntities(plan, context, protocol) +
        countUpdateEntities(plan, protocol) +
        countUpdateEntityGroups(plan, protocol) +
        countEcsDeleteEntities(plan, protocol) +
        countDeleteEntities(plan, protocol);
}
