import { Instance } from '../../server/Instance';
import { BinaryPayload } from '../../common/binary/BinaryAdapter';
import { ProtocolConfig } from '../../common/binary/Protocol';
import { SnapshotChunk } from './SnapshotChunk';
import { getSharedMessageFragments } from './messageFragments';
import { CellEntityFragment } from './cellEntityFragments';
export declare function createPayloadCopyChunk(label: string, instance: Instance, payload: BinaryPayload, bytes: number): SnapshotChunk;
export declare function createChannelScopeChunk(channelId: number, protocol: ProtocolConfig): SnapshotChunk;
export declare function createSharedMessageFragmentChunk(instance: Instance, messageFragments: ReturnType<typeof getSharedMessageFragments>): SnapshotChunk | null;
export declare function createProtocolPreludeChunk(instance: Instance, protocol: ProtocolConfig): SnapshotChunk;
export declare function createCellFragmentChunk(label: string, instance: Instance, fragments: CellEntityFragment[]): SnapshotChunk | null;
//# sourceMappingURL=snapshotChunkBuilders.d.ts.map