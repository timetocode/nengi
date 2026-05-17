"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function countDiff(diff, nschema, nidType = Binary_1.Binary.UInt8) {
    let bytes = 0;
    // add id, prop, value
    bytes += (0, Protocol_1.byteSizeOfNetworkType)(nidType) + 1;
    const prop = diff.prop;
    const propData = nschema.props[prop];
    bytes += (0, BinaryExt_1.binaryGet)(propData.type).byteSize(diff.value);
    return bytes;
}
exports.default = countDiff;
