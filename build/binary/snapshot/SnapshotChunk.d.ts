import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { ProtocolConfig } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
import { SnapshotPlan } from './SnapshotPlan';
export type SnapshotChunk = {
    label: string;
    bytes: number;
    write(writer: IBinaryWriter): void;
    writeDebug?: (writer: IBinaryWriter) => void;
};
export type SnapshotChunkWriteOptions = {
    debug?: boolean;
    createWriter?: (bytes: number) => IBinaryWriter;
};
export declare function createSnapshotPlanChunk(label: string, plan: SnapshotPlan, context: Context, protocol?: ProtocolConfig): SnapshotChunk;
export declare function createSnapshotChunk(label: string, bytes: number, write: (writer: IBinaryWriter) => void, writeDebug?: (writer: IBinaryWriter) => void): SnapshotChunk;
export declare function sumSnapshotChunkBytes(chunks: SnapshotChunk[]): number;
export declare function writeSnapshotChunks(chunks: SnapshotChunk[], writer: IBinaryWriter, options?: SnapshotChunkWriteOptions): void;
//# sourceMappingURL=SnapshotChunk.d.ts.map