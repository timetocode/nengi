"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function countEntity(schema, entity, ntypeType = Binary_1.Binary.UInt8, nidType = Binary_1.Binary.UInt8) {
    let bytes = (0, Protocol_1.byteSizeOfNetworkType)(ntypeType) + (0, Protocol_1.byteSizeOfNetworkType)(nidType);
    schema.keys.forEach(propData => {
        bytes += propData.binary.byteSize(entity[propData.prop]);
    });
    return bytes;
}
exports.default = countEntity;
