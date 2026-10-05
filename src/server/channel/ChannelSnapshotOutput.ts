import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import {
    SnapshotChunk,
    SnapshotChunkWriteOptions,
    sumSnapshotChunkBytes,
    writeSnapshotChunks
} from '../../binary/snapshot/SnapshotChunk'

export type ChannelSnapshotStats = {
    creates: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
    deletes: number
    messages: number
    usedSharedFragments: boolean
}

export type ChannelSnapshotOutput = {
    channelId: number
    bytes: number
    /** Available when InstanceNetwork.snapshotPerformanceEnabled is enabled. */
    stats: ChannelSnapshotStats | null
    write(writer: IBinaryWriter, options?: SnapshotChunkWriteOptions): void
    commit(): void
}

export function createChunkedChannelSnapshotOutput(options: {
    channelId: number
    chunks: SnapshotChunk[]
    stats: ChannelSnapshotStats | null
    commit?: () => void
}): ChannelSnapshotOutput {
    const chunks = options.chunks
    return {
        channelId: options.channelId,
        bytes: sumSnapshotChunkBytes(chunks),
        stats: options.stats,
        write(writer, writeOptions) {
            writeSnapshotChunks(chunks, writer, writeOptions)
        },
        commit: options.commit || (() => {})
    }
}
