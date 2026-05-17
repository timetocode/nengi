"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function writeDiff(nid, diff, nschema, bufferWriter, nidType = Binary_1.Binary.UInt8) {
    const propData = nschema.props[diff.prop];
    const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
    (0, Protocol_1.writeNetworkId)(nid, nidType, bufferWriter);
    bufferWriter.writeUInt8(propData.key);
    binaryUtil.write(diff.value, bufferWriter);
}
exports.default = writeDiff;
