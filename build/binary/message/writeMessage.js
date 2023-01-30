"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function writeMessage(obj, nschema, bufferWriter) {
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.default)(propData.type);
        const writer = binaryUtil.write;
        const value = obj[propData.prop];
        // @ts-ignore
        bufferWriter[writer](value);
    }
}
exports.default = writeMessage;
