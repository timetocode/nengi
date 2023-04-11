"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomReader = exports.CustomWriter = void 0;
const Binary_1 = require("./Binary");
class CustomWriter {
    constructor(bw) {
        this.bw = bw;
    }
    addCustom() {
    }
    writeVector2(vector2) {
        this.bw.writeUInt8(Binary_1.Binary.Vector2);
        this.bw.writeFloat64(vector2.x);
        this.bw.writeFloat64(vector2.y);
    }
    writeVector3(vector3) {
        this.bw.writeUInt8(Binary_1.Binary.Vector3);
        this.bw.writeFloat64(vector3.x);
        this.bw.writeFloat64(vector3.y);
        this.bw.writeFloat64(vector3.z);
    }
    writeQuaternion(quaternion) {
        this.bw.writeUInt8(Binary_1.Binary.Quaternion);
        this.bw.writeFloat64(quaternion.x);
        this.bw.writeFloat64(quaternion.y);
        this.bw.writeFloat64(quaternion.z);
        this.bw.writeFloat64(quaternion.w);
    }
}
exports.CustomWriter = CustomWriter;
class CustomReader {
    constructor(br) {
        this.br = br;
    }
    addCustom() {
    }
    readVector2() {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64()
        };
    }
    readVector3() {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64(),
            z: this.br.readFloat64()
        };
    }
    readQuaternion() {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64(),
            z: this.br.readFloat64(),
            w: this.br.readFloat64()
        };
    }
}
exports.CustomReader = CustomReader;
