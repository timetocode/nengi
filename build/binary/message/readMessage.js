"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function readMessage(reader, context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8();
    const nschema = context.getSchema(ntype);
    const obj = {
        ntype,
    };
    //console.log({ nschema })
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        if (binaryUtil.bytes !== -1) {
            const readerFnStr = binaryUtil.read;
            // @ts-ignore
            const value = reader[readerFnStr]();
            // @ts-ignore
            obj[propData.prop] = value;
        }
        else {
            // @ts-ignore
            obj[propData.prop] = binaryUtil.post(binaryUtil.read(reader));
        }
    }
    return obj;
}
exports.default = readMessage;
