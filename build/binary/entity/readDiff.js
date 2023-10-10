"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function readDiff(reader, context, ntypes /* <nid, ntype> */) {
    const nid = reader.readUInt32();
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
