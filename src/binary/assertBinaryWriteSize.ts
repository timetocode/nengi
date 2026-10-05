import { IBinaryWriter } from '../common/binary/IBinaryWriter'
import { createBinaryDiagnosticError } from './BinaryDiagnosticError'

/** Check each independently allocated payload before it is cached or sent. */
export function assertBinaryWriteSize(writer: IBinaryWriter, expectedBytes: number, section: string) {
    if (writer.offset !== expectedBytes || writer.payload.byteLength !== expectedBytes) {
        throw createBinaryDiagnosticError(new Error('Binary byte count does not match the completed payload.'), {
            phase: 'write',
            section,
            expectedBytes,
            offset: writer.offset,
            payloadBytes: writer.payload.byteLength
        })
    }
}
