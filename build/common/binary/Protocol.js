"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROTOCOL = void 0;
exports.assertNetworkIdType = assertNetworkIdType;
exports.byteSizeOfNetworkType = byteSizeOfNetworkType;
exports.maxValueForNetworkType = maxValueForNetworkType;
exports.networkTypeForMaxValue = networkTypeForMaxValue;
exports.nextNetworkType = nextNetworkType;
exports.readNetworkId = readNetworkId;
exports.writeNetworkId = writeNetworkId;
const Binary_1 = require("./Binary");
const DEFAULT_PROTOCOL = {
    nidType: Binary_1.Binary.UInt8,
    ntypeType: Binary_1.Binary.UInt8
};
exports.DEFAULT_PROTOCOL = DEFAULT_PROTOCOL;
function maxValueForNetworkType(type) {
    if (type === Binary_1.Binary.UInt8) {
        return 0xff;
    }
    if (type === Binary_1.Binary.UInt16) {
        return 0xffff;
    }
    return 0xffffffff;
}
function byteSizeOfNetworkType(type) {
    if (type === Binary_1.Binary.UInt8) {
        return 1;
    }
    if (type === Binary_1.Binary.UInt16) {
        return 2;
    }
    return 4;
}
function networkTypeForMaxValue(maxValue) {
    if (maxValue <= maxValueForNetworkType(Binary_1.Binary.UInt8)) {
        return Binary_1.Binary.UInt8;
    }
    if (maxValue <= maxValueForNetworkType(Binary_1.Binary.UInt16)) {
        return Binary_1.Binary.UInt16;
    }
    return Binary_1.Binary.UInt32;
}
function nextNetworkType(type) {
    if (type === Binary_1.Binary.UInt8) {
        return Binary_1.Binary.UInt16;
    }
    if (type === Binary_1.Binary.UInt16) {
        return Binary_1.Binary.UInt32;
    }
    return null;
}
function assertNetworkIdType(type) {
    if (type !== Binary_1.Binary.UInt8 && type !== Binary_1.Binary.UInt16 && type !== Binary_1.Binary.UInt32) {
        throw new Error('Network id type must be UInt8, UInt16, or UInt32.');
    }
}
function writeNetworkId(value, type, writer) {
    if (type === Binary_1.Binary.UInt8) {
        writer.writeUInt8(value);
        return;
    }
    if (type === Binary_1.Binary.UInt16) {
        writer.writeUInt16(value);
        return;
    }
    writer.writeUInt32(value);
}
function readNetworkId(type, reader) {
    if (type === Binary_1.Binary.UInt8) {
        return reader.readUInt8();
    }
    if (type === Binary_1.Binary.UInt16) {
        return reader.readUInt16();
    }
    return reader.readUInt32();
}
