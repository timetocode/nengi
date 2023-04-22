"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function writeDiff(nid, diff, nschema, bufferWriter) {
    const prop = diff.prop;
    const propData = nschema.props[prop];
    const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
    const value = diff.value;
    if (binaryUtil.bytes !== -1) {
        const writer = binaryUtil.write;
        //console.log({ prop, propData, value })
        // @ts-ignore
        bufferWriter.writeUInt32(nid);
        // @ts-ignore
        bufferWriter.writeUInt8(propData.key);
        // @ts-ignore
        bufferWriter[writer](value);
    }
    else {
        // @ts-ignore
        binaryUtil.write(value, bufferWriter);
    }
}
exports.default = writeDiff;
