"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function write(buffer, offset, obj, schema) {
    schema.keys.forEach(propData => {
        const binaryUtil = (0, BinaryExt_1.default)(propData.type);
        const writer = binaryUtil.write;
        const value = obj[propData.prop];
        //console.log(writer, value, offset)
        // @ts-ignore
        buffer[writer](value, offset);
        offset += binaryUtil.bytes;
    });
    return offset;
}
exports.default = write;
