"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countEndpointPayload = countEndpointPayload;
exports.createEndpointPayload = createEndpointPayload;
exports.readEndpointPayload = readEndpointPayload;
exports.readSizedEndpointPayload = readSizedEndpointPayload;
exports.skipEndpointPayload = skipEndpointPayload;
exports.writeEndpointPayload = writeEndpointPayload;
const Binary_1 = require("../../common/binary/Binary");
const BinaryExt_1 = require("../../common/binary/BinaryExt");
function stringifyPayload(value) {
    const json = JSON.stringify(value);
    if (json === undefined) {
        throw new Error('Request/response payloads must be JSON serializable.');
    }
    return json;
}
function countSchemaPayload(schema, value) {
    let bytes = 0;
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i];
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        bytes += spec.byteSize(value[propData.prop]);
    }
    return bytes;
}
function writeSchemaPayload(schema, value, writer) {
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i];
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        spec.write(value[propData.prop], writer);
    }
}
function readSchemaPayload(schema, reader) {
    const value = {};
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i];
        const spec = (0, BinaryExt_1.binaryGet)(propData.type);
        value[propData.prop] = spec.post(spec.read(reader));
    }
    return value;
}
function createEndpointPayload(value, schema) {
    if (schema) {
        return {
            kind: 'schema',
            schema,
            value
        };
    }
    return {
        kind: 'json',
        value: stringifyPayload(value)
    };
}
function countEndpointPayload(payload) {
    if (payload.kind === 'json') {
        return (0, BinaryExt_1.binaryGet)(Binary_1.Binary.String).byteSize(payload.value);
    }
    return countSchemaPayload(payload.schema, payload.value);
}
function writeEndpointPayload(payload, writer) {
    if (payload.kind === 'json') {
        writer.writeString(payload.value);
        return;
    }
    writeSchemaPayload(payload.schema, payload.value, writer);
}
function readEndpointPayload(reader, schema) {
    if (schema) {
        return readSchemaPayload(schema, reader);
    }
    return JSON.parse(reader.readString());
}
function readSizedEndpointPayload(reader, byteLength, schema) {
    const startOffset = reader.offset;
    const value = readEndpointPayload(reader, schema);
    reader.offset = startOffset + byteLength;
    return value;
}
function skipEndpointPayload(reader, byteLength) {
    reader.offset += byteLength;
}
