"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function readEngineMessage(reader, context) {
    //console.log('entered readMEssage')
    const ntype = reader.readUInt8();
    const nschema = context.getEngineSchema(ntype);
    const obj = { ntype };
    for (let i = 0; i < nschema.keys.length; i++) {
        const propData = nschema.keys[i];
        // @ts-ignore
        obj[propData.prop] = propData.binary.read(reader);
    }
    return obj;
}
exports.default = readEngineMessage;
