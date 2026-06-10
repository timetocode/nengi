"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function countUpdateGroup(update, nidType = Binary_1.Binary.UInt8) {
    let bytes = (0, Protocol_1.byteSizeOfNetworkType)(nidType) + 1;
    for (let i = 0; i < update.group.props.length; i++) {
        bytes += update.group.props[i].binary.byteSize(update.values[i]);
    }
    return bytes;
}
exports.default = countUpdateGroup;
