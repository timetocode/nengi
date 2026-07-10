import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { DEFAULT_PROTOCOL, ProtocolConfig } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'
import { BinaryDiagnosticError, createBinaryDiagnosticError } from '../BinaryDiagnosticError'
import { countSnapshotBytes } from './countSnapshotBytes'
import { SnapshotPlan } from './SnapshotPlan'
import { writeSnapshot, writeSnapshotDiagnostic } from './writeSnapshot'

export type SnapshotChunk = {
    label: string
    bytes: number
    write(writer: IBinaryWriter): void
    writeDiagnostic?: (writer: IBinaryWriter) => void
}

export type SnapshotChunkWriteOptions = {
    diagnostic?: boolean
    createWriter?: (bytes: number) => IBinaryWriter
}

// A snapshot is written as an append-only sequence of independently counted
// chunks: engine/user envelope first, then zero or more channel-specific
// sections and cached fragments. Keeping chunks explicit lets channel writers
// specialize without re-coupling visibility collection to binary writing.
export function createSnapshotPlanChunk(
    label: string,
    plan: SnapshotPlan,
    context: Context,
    protocol: ProtocolConfig = DEFAULT_PROTOCOL
): SnapshotChunk {
    const bytes = countSnapshotBytes(plan, context, protocol)
    return {
        label,
        bytes,
        write: writer => writeSnapshot(plan, context, writer, protocol),
        writeDiagnostic: writer => writeSnapshotDiagnostic(plan, context, writer, protocol)
    }
}

export function createSnapshotChunk(label: string, bytes: number, write: (writer: IBinaryWriter) => void, writeDiagnostic?: (writer: IBinaryWriter) => void): SnapshotChunk {
    return { label, bytes, write, writeDiagnostic }
}

export function sumSnapshotChunkBytes(chunks: SnapshotChunk[]) {
    let bytes = 0
    for (let i = 0; i < chunks.length; i++) {
        bytes += chunks[i].bytes
    }
    return bytes
}

export function writeSnapshotChunks(chunks: SnapshotChunk[], writer: IBinaryWriter, options: SnapshotChunkWriteOptions = {}) {
    try {
        writeChunks(chunks, writer, false, false)
    } catch (err) {
        if (!options.diagnostic) {
            throw err
        }

        if (options.createWriter) {
            const diagnosticWriter = options.createWriter(sumSnapshotChunkBytes(chunks))
            writeChunks(chunks, diagnosticWriter, true, true)
        }

        throw createBinaryDiagnosticError(err, {
            phase: 'write',
            section: 'Snapshot',
            offset: writer.offset
        })
    }
}

function writeChunks(chunks: SnapshotChunk[], writer: IBinaryWriter, diagnostic: boolean, wrapErrors: boolean) {
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        try {
            if (diagnostic && chunk.writeDiagnostic) {
                chunk.writeDiagnostic(writer)
            } else {
                chunk.write(writer)
            }
        } catch (err) {
            if (!wrapErrors) {
                throw err
            }
            if (err instanceof BinaryDiagnosticError) {
                throw err
            }
            throw createBinaryDiagnosticError(err, {
                phase: 'write',
                section: chunk.label,
                index: i,
                offset: writer.offset
            })
        }
    }
}
