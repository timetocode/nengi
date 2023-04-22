"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function count(schema, entity) {
    //console.log({ schema, entity })
    let bytes = 0;
    schema.keys.forEach(propData => {
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        const b = (0, BinaryExt_1.binaryGet)(propData.type).bytes;
        if (spec.bytes !== -1) {
            bytes += spec.bytes;
        }
        else {
            // @ts-ignore
            bytes += spec.byteSize(entity[propData.prop]);
        }
        /*
        if (b === -1) {
            // @ts-ignore
            bytes += binaryGet(propData.type).count(entity[propData.prop])
        } else {
            bytes += b
        }
        */
        // bytes += binaryGet(propData.type).bytes
    });
    return bytes;
}
exports.default = count;
