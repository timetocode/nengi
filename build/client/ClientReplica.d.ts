import { IEntity } from '../common/IEntity';
import { ChannelHeader } from '../common/ChannelHeader';
import { Client } from './Client';
import { ClientEntityMode } from './ClientEntityMode';
import { AppliedEntityChange, ClosedChannel, DeletedEntity, Frame } from './Frame';
import { FixedStepInterpolator, FixedStepInterpolatorOptions, InterpolationSample, InterpolationStatus, InterpolatedState } from './FixedStepInterpolator';
export type ClientChannel<Header extends IEntity = IEntity> = {
    id: number;
    open: boolean;
    header: Header & ChannelHeader;
};
export type ClientReplicaEntity<Local = any> = {
    nid: number;
    ntype: number;
    mode: ClientEntityMode;
    local: Local;
    channel: ClientChannel | null;
    deleted: boolean;
};
export type ClientReplicaBatch = {
    frames: Frame[];
    closedChannels: ClosedChannel[];
    ecsCreateEntities: number[];
    ecsCreateComponents: IEntity[];
    ecsDeleteEntities: number[];
    createEntities: IEntity[];
    updateEntities: AppliedEntityChange[];
    deleteEntities: number[];
    deletedEntities: DeletedEntity[];
    messages: any[];
    createdNids: Set<number>;
    updatedNids: Set<number>;
    deletedNids: Set<number>;
    changedNids: Set<number>;
};
export type ClientReplicaSample<Local = any> = {
    status: InterpolationStatus;
    sample: InterpolationSample;
    state: InterpolatedState | null;
    entities: ClientReplicaRoutedEntity<Local>[];
    entered: ClientReplicaRoutedEntity<Local>[];
    exited: ClientReplicaEntity<Local>[];
    messages: any[];
};
export type ClientReplicaRoutedEntity<Local = any> = {
    entity: IEntity;
    replica: ClientReplicaEntity<Local>;
    channel: ClientChannel | null;
};
export type ClientEntityBindingContext<Local = any> = {
    replica: ClientReplica;
    ref: ClientReplicaEntity<Local>;
    nid: number;
    pid?: number;
    frame?: Frame;
    channel: ClientChannel | null;
    update?: AppliedEntityChange;
    deleted?: DeletedEntity;
    closedChannel?: ClosedChannel;
    sample?: ClientReplicaSample<Local>;
    state?: InterpolatedState | null;
};
export type ClientChannelEntityBindingContext<Header extends IEntity = IEntity, Local = any> = Omit<ClientEntityBindingContext<Local>, 'channel'> & {
    channel: ClientChannel<Header>;
};
export type ClientEntityBinding<Entity extends IEntity = IEntity, Local = any> = {
    mode?: ClientEntityMode;
    create: (entity: Entity, ctx: ClientEntityBindingContext<Local>) => Local;
    update?: (entity: Entity, local: Local, ctx: ClientEntityBindingContext<Local>) => void;
    sample?: (entity: Entity, local: Local, ctx: ClientEntityBindingContext<Local>) => void;
    destroy?: (local: Local, ctx: ClientEntityBindingContext<Local>) => void;
};
export type ClientChannelEntityBinding<Header extends IEntity = IEntity, Entity extends IEntity = IEntity, Local = any> = {
    mode?: ClientEntityMode;
    create: (entity: Entity, ctx: ClientChannelEntityBindingContext<Header, Local>) => Local;
    update?: (entity: Entity, local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void;
    sample?: (entity: Entity, local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void;
    destroy?: (local: Local, ctx: ClientChannelEntityBindingContext<Header, Local>) => void;
};
export type ClientChannelBinding<Header extends IEntity = IEntity> = {
    open?: (channel: ClientChannel<Header>, frame: Frame) => void;
    update?: (channel: ClientChannel<Header>, change: any, frame: Frame) => void;
    close?: (channel: ClientChannel<Header>, frame: Frame) => void;
};
export type ClientMessageHandler<Message = any> = (message: Message, frame: Frame) => void;
export type ClientEcsRootHandler = (pid: number, frame: Frame) => void;
export type ClientEcsComponentBindingContext<Local = any> = ClientEntityBindingContext<Local> & {
    pid: number;
};
export type ClientEcsComponentBinding<Component extends IEntity & {
    pid: number;
} = IEntity & {
    pid: number;
}, Local = any> = {
    mode?: ClientEntityMode;
    create: (component: Component, ctx: ClientEcsComponentBindingContext<Local>) => Local;
    update?: (component: Component, local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void;
    sample?: (component: Component, local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void;
    destroy?: (local: Local, ctx: ClientEcsComponentBindingContext<Local>) => void;
};
export type ClientReplicaOptions = {
    interpolator?: FixedStepInterpolator;
    interpolatorOptions?: FixedStepInterpolatorOptions;
};
export type ProcessClientReplicaOptions = {
    maxFrames?: number;
};
/**
 * @deprecated ClientReplica is a legacy convenience layer. New code should
 * consume ClientNetwork frames directly and read entity CRUD from
 * `frame.channels`.
 */
export declare class ClientReplica {
    client: Client;
    interpolator: FixedStepInterpolator;
    channels: Map<number, ClientChannel<IEntity>>;
    entities: Map<number, ClientReplicaEntity<any>>;
    lastBatch: ClientReplicaBatch;
    private entityBindings;
    private ecsComponentBindings;
    private entityBindingsByNid;
    private channelBindings;
    private channelEntityBindings;
    private ecsCreateEntityHandlers;
    private ecsDeleteEntityHandlers;
    private messageHandlers;
    private anyMessageHandlers;
    private interpolatedMessageHandlers;
    private anyInterpolatedMessageHandlers;
    private interpolatedVisible;
    private lastInterpolatedMessageTick;
    constructor(client: Client, options?: ClientReplicaOptions);
    bindEntity<Entity extends IEntity = IEntity, Local = any>(ntype: number, binding: ClientEntityBinding<Entity, Local>): this;
    bindEcsComponent<Component extends IEntity & {
        pid: number;
    } = IEntity & {
        pid: number;
    }, Local = any>(ntype: number, binding: ClientEcsComponentBinding<Component, Local>): this;
    onEcsCreateEntity(handler: ClientEcsRootHandler): this;
    onEcsDeleteEntity(handler: ClientEcsRootHandler): this;
    bindChannel<Header extends IEntity = IEntity>(headerNtype: number, binding: ClientChannelBinding<Header>): this;
    bindChannelEntity<Header extends IEntity = IEntity, Entity extends IEntity = IEntity, Local = any>(headerNtype: number, entityNtype: number, binding: ClientChannelEntityBinding<Header, Entity, Local>): this;
    onMessage<Message = any>(ntype: number, handler: ClientMessageHandler<Message>): this;
    onMessageAny(handler: ClientMessageHandler): this;
    onInterpolatedMessage<Message = any>(ntype: number, handler: ClientMessageHandler<Message>): this;
    onInterpolatedMessageAny(handler: ClientMessageHandler): this;
    process(options?: ProcessClientReplicaOptions): ClientReplicaBatch;
    setMode(nid: number, mode: ClientEntityMode): boolean;
    getEntity(nid: number): IEntity | undefined;
    getLastConfirmedClientTick(): number;
    getChangedNids(): number[];
    sampleInterpolated<Local = any>(interpDelay: number, now?: number): ClientReplicaSample<Local>;
    applyInterpolatedSample<Local = any>(sample: ClientReplicaSample<Local>): {
        applied: number;
        destroyed: number;
    };
    private processChannelOpens;
    private processChannelHeaderUpdates;
    private processChannelCloses;
    private processCreates;
    private processEcsCreateEntities;
    private processEcsCreateComponents;
    private processEcsDeleteEntities;
    private processUpdates;
    private processDeletes;
    private processMessages;
    private applyCreate;
    private invokeChannelOpen;
    private resolveBinding;
    private routedEntity;
    private getTrackedByMode;
    private createContext;
    private destroyBinding;
    private untrack;
    private getEntityChannel;
    private getEcsComponentPid;
    private ensureChannel;
    private processInterpolatedMessages;
}
//# sourceMappingURL=ClientReplica.d.ts.map