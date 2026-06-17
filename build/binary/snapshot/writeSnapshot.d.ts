import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { ProtocolConfig } from '../../common/binary/Protocol';
import { Context } from '../../common/Context';
import { SnapshotPlan } from './SnapshotPlan';
export declare function writeChannelScope(channelId: number, writer: IBinaryWriter, protocol?: ProtocolConfig): void;
export declare function writeSnapshot(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol?: ProtocolConfig): void;
export declare function writeSnapshotDebug(plan: SnapshotPlan, context: Context, writer: IBinaryWriter, protocol?: ProtocolConfig): void;
//# sourceMappingURL=writeSnapshot.d.ts.map