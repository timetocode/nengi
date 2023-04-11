"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryWriterFactory = void 0;
const BinaryWriter_1 = require("./BinaryWriter");
class BinaryWriterFactory {
    constructor(nativeWriter, bufferOrArrayBufferCtor) {
        this.nativeWriter = nativeWriter;
        this.bufferOrArrayBufferCtor = bufferOrArrayBufferCtor;
    }
    create(bytes) {
        const n = new this.nativeWriter(new this.bufferOrArrayBufferCtor());
        return new BinaryWriter_1.BinaryWriter(n);
    }
}
exports.BinaryWriterFactory = BinaryWriterFactory;
