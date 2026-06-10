import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema';
import { IEntity } from '../../common/IEntity';
import { LocalState } from '../LocalState';
import { Channel, ChannelOptions } from './Channel';
export type ManualPropWriter = (entity: IEntity, value: any) => void;
export type ManualGroupWriter = (entity: IEntity, ...values: any[]) => void;
export type ManualTypeWriters = {
    [name: string]: any;
    readonly ntype: number;
    readonly schema: Schema;
    readonly props: {
        [name: string]: ManualPropWriter;
    };
    readonly groups: {
        [name: string]: ManualGroupWriter;
    };
};
export declare class ManualChannel extends Channel {
    readonly manualUpdateChannelMode = true;
    manualPropNids: number[];
    manualPropSchemas: SchemaProp[];
    manualPropValues: any[];
    manualGroupNids: number[];
    manualGroupSchemas: SchemaUpdateGroup[];
    manualGroupValueOffsets: number[];
    manualGroupValues: any[];
    constructor(localState: LocalState, options?: ChannelOptions);
    createEntityWriter(ntype: number, schema: Schema): ManualTypeWriters;
    clearSnapshotDeltas(): void;
    destroy(): void;
}
//# sourceMappingURL=ManualChannel.d.ts.map