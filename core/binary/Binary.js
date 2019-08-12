import BinaryType from './BinaryType.js';

import Bool from './types/Boolean.js';

import UInt2 from './types/UInt2.js';
import UInt3 from './types/UInt3.js';
import UInt4 from './types/UInt4.js';
import UInt5 from './types/UInt5.js';
import UInt6 from './types/UInt6.js';
import UInt7 from './types/UInt7.js';
import UInt8 from './types/UInt8.js';
import UInt9 from './types/UInt9.js';
import UInt10 from './types/UInt10.js';
import UInt11 from './types/UInt11.js';
import UInt12 from './types/UInt12.js';
import UInt16 from './types/UInt16.js';
import UInt32 from './types/UInt32.js';

import Int4 from './types/Int4.js';
import Int6 from './types/Int6.js';
import Int8 from './types/Int8.js';
import Int10 from './types/Int10.js';
import Int16 from './types/Int16.js';
import Int32 from './types/Int32.js';

import Float32 from './types/Float32.js';
import Float64 from './types/Float64.js';

import EntityId from './types/EntityId.js';
import Rotation8 from './types/Rotation8.js';
import RotationFloat32 from './types/RotationFloat32.js';
import RGB888 from './types/RGB888.js';
import ASCIIString from './types/ASCIIString.js';
import UTF8String from './types/UTF8String.js';



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