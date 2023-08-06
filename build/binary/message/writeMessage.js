'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.writeMessage = void 0
const BinaryExt_1 = require('../../common/binary/BinaryExt')
function writeMessage(obj, nschema, bufferWriter) {
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i]
        const binaryUtil = (0, BinaryExt_1.binaryGet)(propData.type)
        const value = obj[propData.prop]
        binaryUtil.write(value, bufferWriter)
    }
}
exports.writeMessage = writeMessage
//# sourceMappingURL=writeMessage.js.map