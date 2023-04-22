"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function countDiff(diff, nschema) {
    let bytes = 0;
    // add id, prop, value
    bytes += 4 + 1;
    const prop = diff.prop;
    const propData = nschema.props[prop];
    bytes += (0, BinaryExt_1.binaryGet)(propData.type).byteSize(diff.value);
    return bytes;
}
exports.default = countDiff;
//# sourceMappingURL=countDiff.js.map