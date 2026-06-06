import { BinaryPayload } from '../../common/binary/BinaryAdapter'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'

function payloadBytes(payload: BinaryPayload) {
    if (payload instanceof Uint8Array) {
        return payload
    }
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload)
    }
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
}

export function writePayload(writer: IBinaryWriter, payload: BinaryPayload) {
    writer.writeBytes(payloadBytes(payload))
}
