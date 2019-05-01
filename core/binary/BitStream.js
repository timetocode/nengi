// forked and partial copy of https://github.com/inolen/bit-buffer  MIT lic
/*
* Offers a stream for writing to a BitBuffer that increments its own offset.
* Supplying an offset [optional] will start the stream at the specified position.
*/
function BitStream(bitBuffer, offset) {
    this.bitBuffer = bitBuffer
    this.offset = (typeof offset === 'undefined') ? 0 : offset
}

// map functions from BitStream to BitBuffer
var _factoryRead = function(readFn, bits) {
	return function bitStreamFactoryRead() {
		var value = this.bitBuffer[readFn](this.offset)
		this.offset += bits
		return value
	}
}

// map functions from BitStream to BitBuffer
var _factoryWrite = function(writeFn, bits) {
	return function bitStreamFactoryWrite(value) {
		this.bitBuffer[writeFn](value, this.offset)
		this.offset += bits
	}
}

BitStream.prototype.writeBoolean = _factoryWrite('writeBoolean', 1)

BitStream.prototype.writeInt2 = _factoryWrite('writeInt2', 2)
BitStream.prototype.writeUInt2 = _factoryWrite('writeUInt2', 2)

BitStream.prototype.writeInt3 = _factoryWrite('writeInt3', 3)

BitStream.prototype.writeUInt3 = function(value) {
    this.bitBuffer.writeUInt3(value, this.offset)
    this.offset += 3
}

// _factoryWrite('writeUInt3', 3)

BitStream.prototype.writeInt4 = _factoryWrite('writeInt4', 4)
BitStream.prototype.writeUInt4 = _factoryWrite('writeUInt4', 4)

BitStream.prototype.writeInt5 = _factoryWrite('writeInt5', 5)
BitStream.prototype.writeUInt5 = _factoryWrite('writeUInt5', 5)

BitStream.prototype.writeInt6 = _factoryWrite('writeInt6', 6)
BitStream.prototype.writeUInt6 = _factoryWrite('writeUInt6', 6)

BitStream.prototype.writeInt7 = _factoryWrite('writeInt7', 7)
BitStream.prototype.writeUInt7 = _factoryWrite('writeUInt7', 7)

BitStream.prototype.writeInt8 = _factoryWrite('writeInt8', 8)
BitStream.prototype.writeUInt8 = _factoryWrite('writeUInt8', 8)

BitStream.prototype.writeInt9 = _factoryWrite('writeInt9', 9)
BitStream.prototype.writeUInt9 = _factoryWrite('writeUInt9', 9)

BitStream.prototype.writeInt10 = _factoryWrite('writeInt10', 10)
BitStream.prototype.writeUInt10 = _factoryWrite('writeUInt10', 10)

BitStream.prototype.writeInt11 = _factoryWrite('writeInt11', 11)
BitStream.prototype.writeUInt11 = _factoryWrite('writeUInt11', 11)

BitStream.prototype.writeInt12 = _factoryWrite('writeInt12', 12)
BitStream.prototype.writeUInt12 = _factoryWrite('writeUInt12', 12)

BitStream.prototype.writeInt16 = _factoryWrite('writeInt16', 16)

BitStream.prototype.writeUInt16 = function(value) {
    this.bitBuffer.writeUInt16(value, this.offset)
    this.offset += 16
}

//_factoryWrite('writeUInt16', 16)

BitStream.prototype.writeInt32 = _factoryWrite('writeInt32', 32)
BitStream.prototype.writeUInt32 = _factoryWrite('writeUInt32', 32)

BitStream.prototype.writeFloat32 = function(value) {
    this.bitBuffer.writeFloat32(value, this.offset)
    this.offset += 32
}

//_factoryWrite('writeFloat32', 32)

BitStream.prototype.writeFloat64 = _factoryWrite('writeFloat64', 64)


BitStream.prototype.readBoolean = _factoryRead('readBoolean', 1)

BitStream.prototype.readInt2 = _factoryRead('readInt2', 2)
BitStream.prototype.readUInt2 = _factoryRead('readUInt2', 2)

BitStream.prototype.readInt3 = _factoryRead('readInt3', 3)
BitStream.prototype.readUInt3 = _factoryRead('readUInt3', 3)

BitStream.prototype.readInt4 = _factoryRead('readInt4', 4)
BitStream.prototype.readUInt4 = _factoryRead('readUInt4', 4)

BitStream.prototype.readInt5 = _factoryRead('readInt5', 5)
BitStream.prototype.readUInt5 = _factoryRead('readUInt5', 5)

BitStream.prototype.readInt6 = _factoryRead('readInt6', 6)
BitStream.prototype.readUInt6 = _factoryRead('readUInt6', 6)

BitStream.prototype.readInt7 = _factoryRead('readInt7', 7)
BitStream.prototype.readUInt7 = _factoryRead('readUInt7', 7)

BitStream.prototype.readInt8 = _factoryRead('readInt8', 8)
BitStream.prototype.readUInt8 = _factoryRead('readUInt8', 8)

BitStream.prototype.readInt9 = _factoryRead('readInt9', 9)
BitStream.prototype.readUInt9 = _factoryRead('readUInt9', 9)

BitStream.prototype.readInt10 = _factoryRead('readInt10', 10)
BitStream.prototype.readUInt10 = _factoryRead('readUInt10', 10)

BitStream.prototype.readInt11 = _factoryRead('readInt11', 11)
BitStream.prototype.readUInt11 = _factoryRead('readUInt11', 11)

BitStream.prototype.readInt12 = _factoryRead('readInt12', 12)
BitStream.prototype.readUInt12 = _factoryRead('readUInt12', 12)

BitStream.prototype.readInt16 = _factoryRead('readInt16', 16)
BitStream.prototype.readUInt16 = _factoryRead('readUInt16', 16)

BitStream.prototype.readInt32 = _factoryRead('readInt32', 32)
BitStream.prototype.readUInt32 = _factoryRead('readUInt32', 32)

BitStream.prototype.readFloat32 = _factoryRead('readFloat32', 32)

BitStream.prototype.readFloat64 = _factoryRead('readFloat64', 64)

export default BitStream;