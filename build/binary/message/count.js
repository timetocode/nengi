"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function count(schema, entity) {
    //console.log({ schema, entity })
    let bytes = 0;
    schema.keys.forEach(propData => {
        const b = (0, BinaryExt_1.default)(propData.type).bytes;
        if (b === -1) {
            // @ts-ignore
            bytes += (0, BinaryExt_1.default)(propData.type).count(entity[propData.prop]);
        }
        else {
            bytes += b;
        }
        // bytes += binaryGet(propData.type).bytes
    });
    return bytes;
}
exports.default = count;
