"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeMessage = writeMessage;
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function writeMessage(obj, nschema, bufferWriter, ntypeType = Binary_1.Binary.UInt8) {
    (0, Protocol_1.writeNetworkId)(obj.ntype, ntypeType, bufferWriter);
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        const value = obj[propData.prop];
        binaryUtil.write(value, bufferWriter);
    }
}
