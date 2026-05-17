"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function readDiff(reader, context, ntypes /* <nid, ntype> */, nidType = Binary_1.Binary.UInt8) {
    const nid = (0, Protocol_1.readNetworkId)(nidType, reader);
    const propKey = reader.readUInt8();
    const ntype = ntypes.get(nid);
    const nschema = context.getSchema(ntype);
    const propData = nschema.keys[propKey];
    const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
    const value = binaryUtil.read(reader);
    return {
        nid,
        prop: propData.prop,
        value
    };
}
exports.default = readDiff;
