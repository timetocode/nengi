"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function readMessage(reader, context) {
    const ntype = reader.readUInt8();
    const nschema = context.getSchema(ntype);
    const obj = { ntype };
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
        // @ts-ignore
        obj[propData.prop] = binaryUtil.post(binaryUtil.read(reader));
    }
    return obj;
}
exports.default = readMessage;
