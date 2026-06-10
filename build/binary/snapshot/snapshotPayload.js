"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePayload = writePayload;
function payloadBytes(payload) {
    if (payload instanceof Uint8Array) {
        return payload;
    }
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload);
    }
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
}
function writePayload(writer, payload) {
    writer.writeBytes(payloadBytes(payload));
}
