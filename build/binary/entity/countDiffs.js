"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = __importDefault(require("../../common/binary/BinaryExt"));
function countDiffs(diffs, nschema) {
    let bytes = 0;
    diffs.forEach((diff) => {
        // add id, prop, value
        bytes += 4 + 1;
        const prop = diff.prop;
        const propData = nschema.props[prop];
        bytes += (0, BinaryExt_1.default)(propData.type).bytes;
    });
    // schema.keys.forEach(propData => {
    //    bytes += binaryGet(propData.type).bytes
    // })
    return bytes;
}
exports.default = countDiffs;
