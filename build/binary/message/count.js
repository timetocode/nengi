"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function count(schema, entity) {
    let bytes = 0;
    schema.keys.forEach(propData => {
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        // @ts-ignore
        bytes += spec.byteSize(entity[propData.prop]);
    });
    return bytes;
}
exports.default = count;
