"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Protocol_1 = require("../../common/binary/Protocol");
function readEntity(reader, context, ntypeType = Binary_1.Binary.UInt8, nidType = Binary_1.Binary.UInt8) {
    const ntype = (0, Protocol_1.readNetworkId)(ntypeType, reader);
    const nid = (0, Protocol_1.readNetworkId)(nidType, reader);
    const nschema = context.getSchema(ntype);
    const obj = { nid, ntype };
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        // @ts-ignore
        obj[propData.prop] = binaryUtil.post(binaryUtil.read(reader));
    }
    return obj;
}
exports.default = readEntity;
