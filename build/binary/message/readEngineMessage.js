"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function readEngineMessage(reader, context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8();
    const nschema = context.getEngineSchema(ntype);
    const obj = {
        ntype,
    };
    for (let i = 1; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        const binaryUtil = (0, BinaryExt_1.default)(propData.type);
        const readerFnStr = binaryUtil.read;
        // @ts-ignore
        const value = reader[readerFnStr]();
        //console.log('value was', value)
        // @ts-ignore
        obj[propData.prop] = value;
    }
    return obj;
}
exports.default = readEngineMessage;
