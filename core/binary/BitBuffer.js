// forked and partial copy of https://github.com/inolen/bit-buffer MIT Lic

var BitBuffer = function(sourceOrLength) {
	this.bitLength = null // length in bits (can be less than the bytes/8)
	this.byteLength = null // length in bytes (atleast enough to hold the bits)
	this.byteArray = null // Uint8Array holding the underlying bytes

	if (typeof sourceOrLength === 'number') {
		// create a bitBuffer with *length* bits
		this.bitLength = sourceOrLength
		this.byteLength = Math.ceil(sourceOrLength / 8)
		if (typeof Buffer !== 'undefined') {
			this.byteArray = Buffer.allocUnsafe(this.byteLength)
		} else {
			this.byteArray = new Uint8Array(this.byteLength)
		}
		
	} else if (sourceOrLength instanceof ArrayBuffer) {	
		// create a bitBuffer from an ArrayBuffer (Uint8Array, etc)
		this.bitLength = sourceOrLength.byteLength * 8
		this.byteLength = sourceOrLength.byteLength
		this.byteArray = new Uint8Array(sourceOrLength)
	} else if (typeof Buffer !== 'undefined' && sourceOrLength instanceof Buffer) {
		// create a bitBuffer from a node Buffer
		this.bitLength = sourceOrLength.length * 8
		this.byteLength = sourceOrLength.length
		this.byteArray = new Uint8Array(sourceOrLength)
	} else {
		throw new Error('Unable to create BitBuffer, expected length (in bits), ArrayBuffer, or Buffer')
	}	
}

// Used to massage fp values so we can operate on them
// at the bit level.
BitBuffer._scratch = new DataView(new ArrayBuffer(8))

BitBuffer.concat = function(bitViews) {
	var bitLength = 0
	for (var i = 0; i < bitViews.length; i++)	 {	
		bitLength += bitViews[i].bitLength	
	}
	var bitView = new BitBuffer(Buffer.allocUnsafe(Math.ceil(bitLength/8)))
	var offset = 0
	for (var i = 0; i < bitViews.length; i++) {
		for (var j = 0; j < bitViews[i].bitLength; j++) {
			bitView._setBit(bitViews[i]._getBit(j), offset)
			offset++
		}
	}
	return bitView
}

BitBuffer.prototype.toBuffer = function() {
	return this.byteArray //new Buffer(this.byteArray, this.byteLength)
}

BitBuffer.prototype._getBit = function (offset) {
	return this.byteArray[offset >> 3] >> (offset & 7) & 0x1
}

BitBuffer.prototype._setBit = function (on, offset) {
	if (on) {
		this.byteArray[offset >> 3] |= 1 << (offset & 7)
	} else {
		this.byteArray[offset >> 3] &= ~(1 << (offset & 7))
	}
}

BitBuffer.prototype.getBits = function (offset, bits, signed) {
	var available = (this.byteArray.length * 8 - offset)

	if (bits > available) {
		throw new Error('Cannot get ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available')
	}

	var value = 0
	for (var i = 0; i < bits;) {

		/*
		var read

		// Read an entire byte if we can.
		if ((bits - i) >= 8 && ((offset & 7) === 0)) {
			value |= (this.byteArray[offset >> 3] << i)
			read = 8
		} else {
			value |= (this._getBit(offset) << i)
			read = 1
		}
		*/
		
		var remaining = bits - i
		var bitOffset = offset & 7
		var currentByte = this.byteArray[offset >> 3]
		var read = Math.min(remaining, 8 - bitOffset)
		var mask = (1 << read) - 1
		var readBits = (currentByte >> bitOffset) & mask
		value |= readBits << i

		offset += read
		i += read
	}

	if (signed) {
		// If we're not working with a full 32 bits, check the
		// imaginary MSB for this bit count and convert to a
		// valid 32-bit signed value if set.
		if (bits !== 32 && value & (1 << (bits - 1))) {
			value |= -1 ^ ((1 << bits) - 1)
		}

		return value
	}

	return value >>> 0
}

BitBuffer.prototype.setBits = function (value, offset, bits) {
	var available = (this.byteArray.length * 8 - offset)

	if (bits > available) {
		throw new Error('Cannot set ' + bits + ' bit(s) from offset ' + offset + ', ' + available + ' available')
	}

	for (var i = 0; i < bits;) {
		var wrote

		// Write an entire byte if we can.
		if ((bits - i) >= 8 && ((offset & 7) === 0)) {
			this.byteArray[offset >> 3] = value & 0xFF
			wrote = 8
		} else {
			this._setBit(value & 0x1, offset)
			wrote = 1
		}

		value = (value >> wrote)

		offset += wrote
		i += wrote
	}
}

// true, false
BitBuffer.prototype.readBoolean = function (offset) {
	return this.getBits(offset, 1, false) !== 0
}

// -2 to 1
BitBuffer.prototype.readInt2 = function (offset) {
	return this.getBits(offset, 2, true)
}
// 0 to 3
BitBuffer.prototype.readUInt2 = function (offset) {
	return this.getBits(offset, 2, false)
}
// -4 to 3
BitBuffer.prototype.readInt3 = function (offset) {
	return this.getBits(offset, 3, true)
}
// 0 to 7
BitBuffer.prototype.readUInt3 = function (offset) {
	return this.getBits(offset, 3, false)
}
// -8 to 7
BitBuffer.prototype.readInt4 = function (offset) {
	return this.getBits(offset, 4, true)
}
// 0 to 15
BitBuffer.prototype.readUInt4 = function (offset) {
	return this.getBits(offset, 4, false)
}
// -16 to 15
BitBuffer.prototype.readInt5 = function (offset) {
	return this.getBits(offset, 5, true)
}
// 0 to 31
BitBuffer.prototype.readUInt5 = function (offset) {
	return this.getBits(offset, 5, false)
}
// -32 to 31
BitBuffer.prototype.readInt6 = function (offset) {
	return this.getBits(offset, 6, true)
}
// 0 to 63
BitBuffer.prototype.readUInt6 = function (offset) {
	return this.getBits(offset, 6, false)
}
// -64 to 63
BitBuffer.prototype.readInt7 = function (offset) {
	return this.getBits(offset, 7, true)
}
// 0 to 127
BitBuffer.prototype.readUInt7 = function (offset) {
	return this.getBits(offset, 7, false)
}
// -128 to 127
BitBuffer.prototype.readInt8 = function (offset) {
	return this.getBits(offset, 8, true)
}
// 0 to 255
BitBuffer.prototype.readUInt8 = function (offset) {
	return this.getBits(offset, 8, false)
}
// -256 to 255
BitBuffer.prototype.readInt9 = function (offset) {
	return this.getBits(offset, 9, true)
}
// 0 to 511
BitBuffer.prototype.readUInt9 = function (offset) {
	return this.getBits(offset, 9, false)
}
// -512 to 511
BitBuffer.prototype.readInt10 = function (offset) {
	return this.getBits(offset, 10, true)
}
// 0 to 1023
BitBuffer.prototype.readUInt10 = function (offset) {
	return this.getBits(offset, 10, false)
}
// -1024 to 1023
BitBuffer.prototype.readInt11 = function (offset) {
	return this.getBits(offset, 11, true)
}
// 0 to 2047
BitBuffer.prototype.readUInt11 = function (offset) {
	return this.getBits(offset, 11, false)
}
// -2048 to 2047
BitBuffer.prototype.readInt12 = function (offset) {
	return this.getBits(offset, 12, true)
}
// 0 to 4095
BitBuffer.prototype.readUInt12 = function (offset) {
	return this.getBits(offset, 12, false)
}
// -32768 to 32767
BitBuffer.prototype.readInt16 = function (offset) {
	return this.getBits(offset, 16, true)
}
// 0 to 65535
BitBuffer.prototype.readUInt16 = function (offset) {
	return this.getBits(offset, 16, false)
}
// -2147483648 to 2147483647
BitBuffer.prototype.readInt32 = function (offset) {
	return this.getBits(offset, 32, true)
}
// 0 to 4294967295
BitBuffer.prototype.readUInt32 = function (offset) {
	return this.getBits(offset, 32, false)
}
BitBuffer.prototype.readFloat32 = function (offset) {
	BitBuffer._scratch.setUint32(0, this.readUInt32(offset))
	return BitBuffer._scratch.getFloat32(0)
}
BitBuffer.prototype.readFloat64 = function (offset) {
	BitBuffer._scratch.setUint32(0, this.readUInt32(offset))
	// DataView offset is in bytes.
	BitBuffer._scratch.setUint32(4, this.readUInt32(offset+32))
	return BitBuffer._scratch.getFloat64(0)
}

BitBuffer.prototype.writeBoolean = function (value, offset) {
	this.setBits(value ? 1 : 0, offset, 1)
}
BitBuffer.prototype.writeInt2  =
BitBuffer.prototype.writeUInt2 = function (value, offset) {
	this.setBits(value, offset, 2)
}
BitBuffer.prototype.writeInt3  =
BitBuffer.prototype.writeUInt3 = function (value, offset) {
	this.setBits(value, offset, 3)
}
BitBuffer.prototype.writeInt4  =
BitBuffer.prototype.writeUInt4 = function (value, offset) {
	this.setBits(value, offset, 4)
}
BitBuffer.prototype.writeInt5  =
BitBuffer.prototype.writeUInt5 = function (value, offset) {
	this.setBits(value, offset, 5)
}
BitBuffer.prototype.writeInt6  =
BitBuffer.prototype.writeUInt6 = function (value, offset) {
	this.setBits(value, offset, 6)
}
BitBuffer.prototype.writeInt7  =
BitBuffer.prototype.writeUInt7 = function (value, offset) {
	this.setBits(value, offset, 7)
}
BitBuffer.prototype.writeInt8  =
BitBuffer.prototype.writeUInt8 = function (value, offset) {
	this.setBits(value, offset, 8)
}
BitBuffer.prototype.writeInt9  =
BitBuffer.prototype.writeUInt9 = function (value, offset) {
	this.setBits(value, offset, 9)
}
BitBuffer.prototype.writeInt10  =
BitBuffer.prototype.writeUInt10 = function (value, offset) {
	this.setBits(value, offset, 10)
}
BitBuffer.prototype.writeInt11  =
BitBuffer.prototype.writeUInt11 = function (value, offset) {
	this.setBits(value, offset, 11)
}
BitBuffer.prototype.writeInt12  =
BitBuffer.prototype.writeUInt12 = function (value, offset) {
	this.setBits(value, offset, 12)
}
BitBuffer.prototype.writeInt16  =
BitBuffer.prototype.writeUInt16 = function (value, offset) {
	this.setBits(value, offset, 16)
}
BitBuffer.prototype.writeInt32  =
BitBuffer.prototype.writeUInt32 = function (value, offset) {
	this.setBits(value, offset, 32)
}
BitBuffer.prototype.writeFloat32 = function (value, offset) {
	BitBuffer._scratch.setFloat32(0, value)
	this.setBits(BitBuffer._scratch.getUint32(0), offset, 32)
}
BitBuffer.prototype.writeFloat64 = function (value, offset) {
	BitBuffer._scratch.setFloat64(0, value)
	this.setBits(BitBuffer._scratch.getUint32(0), offset, 32)
	this.setBits(BitBuffer._scratch.getUint32(4), offset+32, 32)
}

export default BitBuffer;
