import type { IBinaryReader } from './IBinaryReader'
import type { IBinaryWriter } from './IBinaryWriter'

type BinaryPayload = ArrayBuffer | ArrayBufferView

interface BinaryAdapter<InboundPayload extends BinaryPayload = BinaryPayload, OutboundPayload extends BinaryPayload = InboundPayload> {
    /** Returns a writer at offset zero with a payload of exactly byteLength bytes. */
    createWriter(byteLength: number): IBinaryWriter<OutboundPayload>
    createReader(payload: InboundPayload): IBinaryReader
}

export { BinaryAdapter, BinaryPayload }
