"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function writeDiff(nid, diff, nschema, bufferWriter) {
    const propData = nschema.props[diff.prop];
    const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type);
    bufferWriter.writeUInt32(nid);
    bufferWriter.writeUInt8(propData.key);
    binaryUtil.write(diff.value, bufferWriter);
}
exports.default = writeDiff;
