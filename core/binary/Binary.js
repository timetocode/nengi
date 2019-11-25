import BinaryType from './BinaryType';

import Bool from './types/Boolean'

import UInt2 from './types/UInt2'
import UInt3 from './types/UInt3'
import UInt4 from './types/UInt4'
import UInt5 from './types/UInt5'
import UInt6 from './types/UInt6'
import UInt7 from './types/UInt7'
import UInt8 from './types/UInt8'
import UInt9 from './types/UInt9'
import UInt10 from './types/UInt10'
import UInt11 from './types/UInt11'
import UInt12 from './types/UInt12'
import UInt16 from './types/UInt16'
import UInt32 from './types/UInt32'

import Int4 from './types/Int4'
import Int6 from './types/Int6'
import Int8 from './types/Int8'
import Int10 from './types/Int10'
import Int16 from './types/Int16'
import Int32 from './types/Int32'

import Float32 from './types/Float32'
import Float64 from './types/Float64'

import EntityId from './types/EntityId'
import Rotation8 from './types/Rotation8'
import RotationFloat32 from './types/RotationFloat32'
import RGB888 from './types/RGB888'
import ASCIIString from './types/ASCIIString'
import UTF8String from './types/UTF8String'
import ByteString from './types/ByteString'


var Binary = {}

/* unsigned! 0 to n */
// 0 to 1, false or true
Binary[BinaryType.Boolean] = Bool
// 0 to 3
Binary[BinaryType.UInt2] = UInt2
// 0 to 7
Binary[BinaryType.UInt3] = UInt3
// 0 to 15
Binary[BinaryType.UInt4] = UInt4
// 0 to 31
Binary[BinaryType.UInt5] = UInt5
// 0 to 63
Binary[BinaryType.UInt6] = UInt6
// 0 to 127
Binary[BinaryType.UInt7] = UInt7
// 0 to 255
Binary[BinaryType.UInt8] = UInt8
// 0 to 511
Binary[BinaryType.UInt9] = UInt9
// 0 to 1023
Binary[BinaryType.UInt10] = UInt10
// 0 to 2047
Binary[BinaryType.UInt11] = UInt11
// 0 to 4095
Binary[BinaryType.UInt12] = UInt12
// 0 to 65535
Binary[BinaryType.UInt16] = UInt16
// 0 to 4294967295
Binary[BinaryType.UInt32] = UInt32

/* signed! includes negative numbers */
// -8 to 7
Binary[BinaryType.Int4] = Int4
// -32 to 31
Binary[BinaryType.Int6] = Int6
// -128 to 127
Binary[BinaryType.Int8] = Int8
// -512 to 511
Binary[BinaryType.Int10] = Int10
// -32768 to 32767
Binary[BinaryType.Int16] = Int16
// -2147483648 to 2147483647
Binary[BinaryType.Int32] = Int32

Binary[BinaryType.Float32] = Float32

Binary[BinaryType.Float64] = Float64

/* special fancy types! */
Binary[BinaryType.EntityId] = EntityId
// rotation in radians networked in one byte
Binary[BinaryType.Rotation8] = Rotation8
Binary[BinaryType.RotationFloat32] = RotationFloat32
// an RGB color, with one byte for each component
Binary[BinaryType.RGB888] = RGB888
// String support, ASCIIStrings up to 255 characters
Binary[BinaryType.ASCIIString] = ASCIIString
// utf8 strings, potentially huge
Binary[BinaryType.UTF8String] = UTF8String
// arbitrary binary data, potentially huge
Binary[BinaryType.ByteString] = ByteString

Binary.countBits = function(propConfig, value) {
    var binaryMeta = Binary[propConfig.type]
    if (propConfig.isArray) {
        var totalBits = 0
        var arrayIndexBinaryMeta = Binary[propConfig.arrayIndexBinaryType]
        totalBits += arrayIndexBinaryMeta.bits
        if (binaryMeta.customBits) {
            totalBits += binaryMeta.countBits(value) * value.length
        } else {
            totalBits += binaryMeta.bits * value.length
        }
        return totalBits
    } else {
       if (binaryMeta.customBits) {
            return binaryMeta.countBits(value)
        } else {
            return binaryMeta.bits
        } 
    }
}

export default Binary;