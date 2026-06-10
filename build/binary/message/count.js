"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function count(schema, message, ntypeType = Binary_1.Binary.UInt8) {
    let bytes = (0, Protocol_1.byteSizeOfNetworkType)(ntypeType);
    schema.keys.forEach(propData => {
        // @ts-ignore
        bytes += propData.binary.byteSize(message[propData.prop]);
    });
    return bytes;
}
exports.default = count;
