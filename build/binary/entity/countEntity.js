"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Protocol_1 = require("../../common/binary/Protocol");
function countEntity(schema, entity, ntypeType = Binary_1.Binary.UInt8, nidType = Binary_1.Binary.UInt8) {
    let bytes = (0, Protocol_1.byteSizeOfNetworkType)(ntypeType) + (0, Protocol_1.byteSizeOfNetworkType)(nidType);
    schema.keys.forEach(propData => {
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        bytes += spec.byteSize(entity[propData.prop]);
    });
    return bytes;
}
exports.default = countEntity;
