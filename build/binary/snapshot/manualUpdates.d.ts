import { Instance } from '../../server/Instance';
import { User } from '../../server/User';
import { BinaryPayload } from '../../common/binary/BinaryAdapter';
import { IBinaryWriter } from '../../common/binary/IBinaryWriter';
import { ProtocolConfig } from '../../common/binary/Protocol';
import { SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema';
export type ManualUpdateLog = {
    manualPropNids: number[];
    manualPropSchemas: SchemaProp[];
    manualPropValues: any[];
    manualGroupNids: number[];
    manualGroupSchemas: SchemaUpdateGroup[];
    manualGroupValueOffsets: number[];
    manualGroupValues: any[];
};
export type EcsManualUpdateLog = ManualUpdateLog & {
    manualGroupNTypes: number[];
};
export type ManualUpdateFragment = {
    payload: BinaryPayload;
    bytes: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
};
export declare function countManualUpdateBytes(channel: ManualUpdateLog, protocol: ProtocolConfig): number;
export declare function writeManualUpdates(channel: ManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig): void;
export declare function countEcsManualUpdateBytes(channel: EcsManualUpdateLog, protocol: ProtocolConfig): number;
export declare function writeEcsManualUpdates(channel: EcsManualUpdateLog, writer: IBinaryWriter, protocol: ProtocolConfig): void;
export declare function countManualGroupedProps(channel: ManualUpdateLog): number;
export declare function getManualUpdateFragment(user: User, instance: Instance, channel: EcsManualUpdateLog & {
    nid: number;
}, keyPrefix: string): {
    payload: any;
    bytes: number;
    updateProps: number;
    updateGroups: number;
    groupedUpdateProps: number;
};
//# sourceMappingURL=manualUpdates.d.ts.map