"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function writeDiff(nid, diff, nschema, bufferWriter, nidType = Binary_1.Binary.UInt8) {
    const propData = nschema.props[diff.prop];
    (0, Protocol_1.writeNetworkId)(nid, nidType, bufferWriter);
    bufferWriter.writeUInt8(propData.key);
    propData.binary.write(diff.value, bufferWriter);
}
exports.default = writeDiff;
