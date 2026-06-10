"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeEntity = writeEntity;
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function writeEntity(entity, nschema, bufferWriter, ntypeType = Binary_1.Binary.UInt8, nidType = Binary_1.Binary.UInt8) {
    (0, Protocol_1.writeNetworkId)(entity.ntype, ntypeType, bufferWriter);
    (0, Protocol_1.writeNetworkId)(entity.nid, nidType, bufferWriter);
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const value = entity[propData.prop];
        propData.binary.write(value, bufferWriter);
    }
}
