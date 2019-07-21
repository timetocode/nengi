
function createEnum(values) {
  var enumm = {}
    for (var i = 0; i < values.length; i++) {
    var value = values[i]
    enumm[value] = i
  }
  return enumm
}

var BinaryType = createEnum([
    'Null',
    'Boolean',

    'UInt2',
    'UInt3',
    'UInt4',
    'UInt5',
    'UInt6',
    'UInt7',
    'UInt8',
    'UInt9',
    'UInt10',
    'UInt11',
    'UInt12',
    'UInt16',
    'UInt32',

    'Int4',
    'Int6',
    'Int8',
    'Int10',
    'Int16',
    'Int32',

    'Float32',
    'Float64',

    'EntityId',
    'Rotation8',
    'ASCIIString',
    'UTF8String',
	'RGB888',
	'RotationFloat32'
])



export default BinaryType;