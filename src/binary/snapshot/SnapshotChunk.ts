import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { DEFAULT_PROTOCOL, ProtocolConfig } from '../../common/binary/Protocol'
import { Context } from '../../common/Context'
import { BinaryDebugError, createBinaryDebugError } from '../BinaryDebugError'
import { countSnapshotBytes } from './countSnapshotBytes'
import { SnapshotPlan } from './SnapshotPlan'
import { writeSnapshot, writeSnapshotDebug } from './writeSnapshot'

export type SnapshotChunk = {
    label: string
    bytes: number
    write(writer: IBinaryWriter): void
    writeDebug?: (writer: IBinaryWriter) => void
}

export type SnapshotChunkWriteOptions = {
    debug?: boolean
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
        writeDebug: writer => writeSnapshotDebug(plan, context, writer, protocol)
    }
}

export function createSnapshotChunk(label: string, bytes: number, write: (writer: IBinaryWriter) => void, writeDebug?: (writer: IBinaryWriter) => void): SnapshotChunk {
    return { label, bytes, write, writeDebug }
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
        if (!options.debug) {
            throw err
        }

        if (options.createWriter) {
            const debugWriter = options.createWriter(sumSnapshotChunkBytes(chunks))
            try {
                writeChunks(chunks, debugWriter, true, true)
            } catch (debugErr) {
                throw debugErr
            }
        }

        throw createBinaryDebugError(err, {
            phase: 'write',
            section: 'Snapshot',
            offset: writer.offset
        })
    }
}

function writeChunks(chunks: SnapshotChunk[], writer: IBinaryWriter, debug: boolean, wrapErrors: boolean) {
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        try {
            if (debug && chunk.writeDebug) {
                chunk.writeDebug(writer)
            } else {
                chunk.write(writer)
            }
        } catch (err) {
            if (!wrapErrors) {
                throw err
            }
            if (err instanceof BinaryDebugError) {
                throw err
            }
            throw createBinaryDebugError(err, {
                phase: 'write',
                section: chunk.label,
                index: i,
                offset: writer.offset
            })
        }
    }
}
