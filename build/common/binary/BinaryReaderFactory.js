"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryReaderFactory = void 0;
const BinaryReader_1 = require("./BinaryReader");
class BinaryReaderFactory {
    constructor(nativeReader) {
        this.nativeReader = nativeReader;
    }
    create() {
        return new BinaryReader_1.BinaryReader(this.nativeReader);
    }
}
exports.BinaryReaderFactory = BinaryReaderFactory;
