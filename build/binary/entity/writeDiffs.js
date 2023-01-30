"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function writeDiffs(nid, diffs, nschema, bufferWriter) {
    //console.log('writeDiff', diffs)
    diffs.forEach((diff) => {
        const prop = diff.prop;
        const propData = nschema.props[prop];
        const binaryUtil = (0, BinaryExt_1.default)(propData.type);
        const writer = binaryUtil.write;
        const value = diff.value;
        //console.log({ prop, propData, value })
        // @ts-ignore
        bufferWriter.writeUInt32(nid);
        // @ts-ignore
        bufferWriter.writeUInt8(propData.key);
        // @ts-ignore
        bufferWriter[writer](value);
    });
}
exports.default = writeDiffs;
