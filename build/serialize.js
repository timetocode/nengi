'use strict'
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { 'default': mod }
}
Object.defineProperty(exports, '__esModule', { value: true })
const buffer_1 = require('buffer')
const BinaryExt_1 = __importDefault(require('../common/binary/BinaryExt'))
function serialize(obj, schema) {
    let bytes = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)
        bytes += (0, BinaryExt_1.default)(propData.type).bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })
    console.log('total bytes', bytes)
    const buf = buffer_1.Buffer.allocUnsafe(bytes)
    //const start = Date.now()
    let offset = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)
        // bytes += binaryGet(propData.type).bytes
        const binaryUtil = (0, BinaryExt_1.default)(propData.type)
        const writer = binaryUtil.write
        const value = obj[propData.prop]
        //console.log(writer, value, offset)
        // @ts-ignore
        buf[writer](value, offset)
        //if (propData.type === Binary.Float64) {
        //    buf.writeFloatBE(value, offset)
        //} else if(propData.type === Binary.UInt16) {
        //    buf.writeUInt16BE(value, offset)
        //}
        offset += binaryUtil.bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })
    //const stop = Date.now()
    //console.log('yo', stop - start)
    console.log(buf)
    let offset2 = 0
    schema.keys.forEach(propData => {
        //console.log('xx', propData)
        // bytes += binaryGet(propData.type).bytes
        const binaryUtil = (0, BinaryExt_1.default)(propData.type)
        const reader = binaryUtil.read
        //const value = obj[propData.prop]
        //console.log(reader, value)
        // @ts-ignore
        const value = buf[reader](offset2)
        console.log(reader, propData.prop, value, 'offset', offset2, 'should be', obj[propData.prop])
        offset2 += binaryUtil.bytes
        //console.log('byte size', binaryGet(propData.type).bytes)
    })
}
exports.default = serialize
//# sourceMappingURL=serialize.js.map