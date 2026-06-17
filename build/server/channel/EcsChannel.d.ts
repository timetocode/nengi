import { Schema, SchemaProp, SchemaUpdateGroup } from '../../common/binary/schema/Schema';
import { ChannelHeader, ChannelHeaderInput, ChannelType } from '../../common/ChannelHeader';
import { IEntity } from '../../common/IEntity';
import { LocalState } from '../LocalState';
import { User } from '../User';
import { IChannel } from './IChannel';
export type EcsComponent = IEntity & {
    pid: number;
};
export type EcsTypeWriters = {
    [name: string]: any;
    readonly ntype: number;
    readonly schema: Schema;
    readonly props: {
        [name: string]: (component: EcsComponent, value: any) => void;
    };
    readonly groups: {
        [name: string]: (component: EcsComponent, ...values: any[]) => void;
    };
};
export type EcsChannelOptions = {
    name?: string;
    header?: ChannelHeaderInput;
};
export declare class EcsChannel implements IChannel {
    readonly ecsChannelMode = true;
    nid: number;
    localState: LocalState;
    users: Map<number, User>;
    header: ChannelHeader;
    headerVersion: number;
    channelType: ChannelType;
    rootNids: number[];
    componentNids: number[];
    membershipVersion: number;
    createdRoots: number[];
    deletedRoots: number[];
    createdComponents: EcsComponent[];
    deletedComponents: number[];
    rootDeletedComponents: number[];
    manualPropNids: number[];
    manualPropSchemas: SchemaProp[];
    manualPropValues: any[];
    manualGroupNids: number[];
    manualGroupNTypes: number[];
    manualGroupSchemas: SchemaUpdateGroup[];
    manualGroupValueOffsets: number[];
    manualGroupValues: any[];
    skipInterpolationNids: number[];
    broadcastMessages: any[];
    interpolatedBroadcastMessages: any[];
    private rootSet;
    private componentSet;
    private componentsByRoot;
    private componentByNid;
    private visibleNetworkedNidsCache;
    constructor(localState: LocalState, options?: EcsChannelOptions);
    createEntity(): number;
    addEntity(): number;
    markHeaderDirty(): boolean;
    removeEntity(pidOrEntity: number | IEntity): number;
    removeAllEntities(): void;
    addComponent<T extends IEntity>(pid: number, component: T): T & EcsComponent;
    private removeComponentInternal;
    removeComponent(componentOrNid: EcsComponent | number): void;
    isRootNid(nid: number): boolean;
    isComponentNid(nid: number): boolean;
    isRootDeletedComponentNid(nid: number): boolean;
    getComponent(nid: number): EcsComponent | undefined;
    getVisibleEntities(userId: number): number[];
    getVisibleNetworkedNids(userId: number): number[];
    subscribe(user: User): void;
    unsubscribe(user: User): void;
    unsubscribeAll(): void;
    destroy(): void;
    addMessage(message: any): void;
    addInterpolatedMessage(message: any): void;
    skipInterpolation(pidOrComponent: number | IEntity): boolean;
    clearBroadcastMessages(): void;
    hasStructuralDeltas(): boolean;
    clearSnapshotDeltas(): void;
    createComponentWriter(ntype: number, schema: Schema): EcsTypeWriters;
}
//# sourceMappingURL=EcsChannel.d.ts.map