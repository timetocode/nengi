"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function readDiff(reader, context, entities) {
    const nid = reader.readUInt32();
    const propKey = reader.readUInt8();
    // @ts-ignore
    const ntype = entities.get(nid).ntype;
    const nschema = context.getSchema(ntype);
    //console.log('READDIFF', { nid, propKey, ntype, nschema })
    const propData = nschema.keys[propKey];
    const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
    if (binaryUtil.bytes !== -1) {
        const readerFnStr = binaryUtil.read;
        // @ts-ignore
        const value = reader[readerFnStr]();
        const diff = {
            nid,
            prop: propData.prop,
            value
        };
        //console.log(diff)
        return diff;
    }
    else {
        // @ts-ignore
        const value = binaryUtil.read(reader);
        const diff = {
            nid,
            prop: propData.prop,
            value
        };
        //console.log(diff)
        return diff;
    }
}
exports.default = readDiff;
