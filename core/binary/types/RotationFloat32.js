
const write = function(bitStream, value) {
    bitStream.writeFloat32(value)
}

const read = function(bitStream) {
    return bitStream.readFloat32()
}
const countBits = function() {
    return 32
}

const lerpRot = function(a, b, amount) {
    let s = (1 - amount) * Math.sin(a) + amount * Math.sin(b)
    let c = (1 - amount) * Math.cos(a) + amount * Math.cos(b)
    return Math.atan2(s, c)
}

import compareFloats from './compare/compareFloats';

const RotationFloat32 = {
    'min': 0,
    'max': 255,
    'interp': lerpRot,
    'compare': compareFloats,
    'bits': 32,
    'customWrite': true,
    'write': write,
    'customRead': true,
    'read': read
}

export default RotationFloat32;