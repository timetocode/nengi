import { Binary } from './Binary'
import { IBinaryReader } from './IBinaryReader'
import { IBinaryWriter, IBinaryWriterClass } from './IBinaryWriter'

class CustomWriter {
    bw: IBinaryWriter

    constructor(bw: IBinaryWriter) {
        this.bw = bw
    }

    addCustom() {

    }

    writeVector2(vector2: { x: number, y : number }) {
        this.bw.writeUInt8(Binary.Vector2)
        this.bw.writeFloat64(vector2.x)
        this.bw.writeFloat64(vector2.y)
    }

    writeVector3(vector3: { x: number, y : number, z: number }) {
        this.bw.writeUInt8(Binary.Vector3)
        this.bw.writeFloat64(vector3.x)
        this.bw.writeFloat64(vector3.y)
        this.bw.writeFloat64(vector3.z)
    }

    writeQuaternion(quaternion: { x: number, y : number, z: number, w: number }) {
        this.bw.writeUInt8(Binary.Quaternion)
        this.bw.writeFloat64(quaternion.x)
        this.bw.writeFloat64(quaternion.y)
        this.bw.writeFloat64(quaternion.z)
        this.bw.writeFloat64(quaternion.w)
    }
}

class CustomReader {
    br: IBinaryReader
    
    constructor(br: IBinaryReader) {
        this.br = br
    }

    addCustom() {

    }

    readVector2(): { x: number, y : number } {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64()
        }   
    }

    readVector3(): { x: number, y : number, z: number } {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64(),
            z: this.br.readFloat64()
        }   
    }

    readQuaternion(): { x: number, y : number, z: number, w: number } {
        return {
            x: this.br.readFloat64(),
            y: this.br.readFloat64(),
            z: this.br.readFloat64(),
            w: this.br.readFloat64()
        }   
    }
}

export { CustomWriter, CustomReader }