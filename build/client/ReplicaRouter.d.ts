import { IEntity } from '../common/IEntity';
import { Client } from './Client';
import { AppliedEntityChange, ClosedChannel, DeletedEntity, Frame } from './Frame';
import { FixedStepInterpolator, FixedStepInterpolatorOptions, InterpolationSample, InterpolationStatus, InterpolatedState } from './FixedStepInterpolator';
export declare enum ClientEntityMode {
    Raw = "raw",
    Interpolated = "interpolated",
    Predicted = "predicted",
    Ignored = "ignored"
}
export type TrackedClientEntity<Local = any, Meta = any> = {
    nid: number;
    ntype: number;
    mode: ClientEntityMode;
    local?: Local;
    meta?: Meta;
    deleted: boolean;
};
export type TrackOptions<Local = any, Meta = any> = {
    ntype?: number;
    mode?: ClientEntityMode;
    local?: Local;
    meta?: Meta;
};
export type RoutedEntity<Local = any, Meta = any> = {
    entity: IEntity;
    tracked: TrackedClientEntity<Local, Meta>;
    channelId?: number;
    channelHeader?: IEntity;
};
export type RoutedUpdate<Local = any, Meta = any> = {
    update: AppliedEntityChange;
    entity?: IEntity;
    tracked?: TrackedClientEntity<Local, Meta>;
};
export type RoutedDelete<Local = any, Meta = any> = {
    nid: number;
    deleted: DeletedEntity;
    tracked?: TrackedClientEntity<Local, Meta>;
};
export type RoutedFrameBatch = {
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
export type InterpolatedRouterSample<Local = any, Meta = any> = {
    status: InterpolationStatus;
    sample: InterpolationSample;
    state: InterpolatedState | null;
    entities: RoutedEntity<Local, Meta>[];
    entered: RoutedEntity<Local, Meta>[];
    exited: TrackedClientEntity<Local, Meta>[];
    messages: any[];
};
type CreateHandler = (entity: IEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void;
export type ChannelRouteContext = {
    channelId: number;
    header?: IEntity;
    closed?: ClosedChannel;
};
type ChannelRoutePredicate = (ctx: ChannelRouteContext, frame: Frame) => boolean;
type ChannelRouteOpenHandler = (ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelRouteHeaderUpdateHandler = (update: any, ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelRouteCreateHandler = (entity: IEntity, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelRouteUpdateHandler = (update: AppliedEntityChange, entity: IEntity | undefined, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelRouteDeleteHandler = (nid: number, deleted: DeletedEntity, tracked: TrackedClientEntity | undefined, ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelRouteCloseHandler = (ctx: ChannelRouteContext, frame: Frame) => void;
type ChannelHeaderCreateHandler = (header: IEntity, frame: Frame, channelId: number) => void;
type ChannelHeaderUpdateHandler = (update: any, header: IEntity | undefined, frame: Frame, channelId: number) => void;
type ChannelHeaderDeleteHandler = (channelId: number, header: IEntity | undefined, frame: Frame) => void;
type EcsCreateEntityHandler = (pid: number, frame: Frame) => void;
type EcsCreateComponentHandler = (component: IEntity, frame: Frame) => void;
type EcsDeleteEntityHandler = (pid: number, frame: Frame) => void;
type UpdateHandler = (update: AppliedEntityChange, entity: IEntity | undefined, tracked: TrackedClientEntity | undefined, frame: Frame) => void;
type DeleteHandler = (nid: number, deleted: DeletedEntity, tracked: TrackedClientEntity | undefined, frame: Frame) => void;
type MessageHandler = (message: any, frame: Frame) => void;
export type ReplicaRouterOptions = {
    defaultMode?: ClientEntityMode | null;
    interpolator?: FixedStepInterpolator;
    interpolatorOptions?: FixedStepInterpolatorOptions;
};
export type ProcessServerFramesOptions = {
    maxFrames?: number;
};
type ChannelRoute = {
    predicate: ChannelRoutePredicate;
    openHandlers: ChannelRouteOpenHandler[];
    headerUpdateHandlers: ChannelRouteHeaderUpdateHandler[];
    closeHandlers: ChannelRouteCloseHandler[];
    createHandlers: Map<number, ChannelRouteCreateHandler[]>;
    updateHandlers: Map<number, ChannelRouteUpdateHandler[]>;
    deleteHandlers: Map<number, ChannelRouteDeleteHandler[]>;
};
export declare class ChannelRouteBuilder {
    private route;
    constructor(route: ChannelRoute);
    onOpen(handler: ChannelRouteOpenHandler): this;
    onHeaderUpdate(handler: ChannelRouteHeaderUpdateHandler): this;
    onCreate(ntype: number, handler: ChannelRouteCreateHandler): this;
    onUpdate(ntype: number, handler: ChannelRouteUpdateHandler): this;
    onDelete(ntype: number, handler: ChannelRouteDeleteHandler): this;
    onClose(handler: ChannelRouteCloseHandler): this;
}
export declare class ReplicaRouter {
    client: Client;
    interpolator: FixedStepInterpolator;
    defaultMode: ClientEntityMode | null;
    tracked: Map<number, TrackedClientEntity<any, any>>;
    lastBatch: RoutedFrameBatch;
    private createHandlers;
    private updateHandlers;
    private deleteHandlers;
    private messageHandlers;
    private interpolatedMessageHandlers;
    private channelRoutes;
    private channelHeaderCreateHandlers;
    private channelHeaderUpdateHandlers;
    private channelHeaderDeleteHandlers;
    private ecsCreateEntityHandlers;
    private ecsCreateComponentHandlers;
    private ecsDeleteEntityHandlers;
    private anyCreateHandlers;
    private anyUpdateHandlers;
    private anyDeleteHandlers;
    private anyMessageHandlers;
    private anyInterpolatedMessageHandlers;
    private interpolatedVisible;
    private lastInterpolatedMessageTick;
    constructor(client: Client, options?: ReplicaRouterOptions);
    onCreate(ntype: number, handler: CreateHandler): void;
    onCreateAny(handler: CreateHandler): void;
    channel(predicate: ChannelRoutePredicate): ChannelRouteBuilder;
    onChannelHeaderCreate(handler: ChannelHeaderCreateHandler): void;
    onChannelHeaderUpdate(handler: ChannelHeaderUpdateHandler): void;
    onChannelHeaderDelete(handler: ChannelHeaderDeleteHandler): void;
    onEcsCreateEntity(handler: EcsCreateEntityHandler): void;
    onEcsCreateComponent(handler: EcsCreateComponentHandler): void;
    onEcsDeleteEntity(handler: EcsDeleteEntityHandler): void;
    onUpdate(ntype: number, handler: UpdateHandler): void;
    onUpdateAny(handler: UpdateHandler): void;
    onDelete(ntype: number, handler: DeleteHandler): void;
    onDeleteAny(handler: DeleteHandler): void;
    onMessage(ntype: number, handler: MessageHandler): void;
    onMessageAny(handler: MessageHandler): void;
    onInterpolatedMessage(ntype: number, handler: MessageHandler): void;
    onInterpolatedMessageAny(handler: MessageHandler): void;
    process(options?: ProcessServerFramesOptions): RoutedFrameBatch;
    processServerFrames(options?: ProcessServerFramesOptions): RoutedFrameBatch;
    track<Local = any, Meta = any>(nid: number, options?: TrackOptions<Local, Meta>): TrackedClientEntity<Local, Meta>;
    trackEntity<Local = any, Meta = any>(entity: IEntity, options?: TrackOptions<Local, Meta>): TrackedClientEntity<Local, Meta>;
    untrack(nid: number): void;
    setMode(nid: number, mode: ClientEntityMode): void;
    getRaw(nid: number): IEntity | undefined;
    getChannelId(nid: number): number | undefined;
    getChannelHeader(channelOrEntityNid: number): IEntity | undefined;
    getLastConfirmedClientTick(): number;
    getRawTracked<Local = any, Meta = any>(mode?: ClientEntityMode): RoutedEntity<Local, Meta>[];
    getChangedRaw<Local = any, Meta = any>(): RoutedEntity<Local, Meta>[];
    getChangedNids(): number[];
    sampleInterpolated<Local = any, Meta = any>(interpDelay: number, now?: number): InterpolatedRouterSample<Local, Meta>;
    private processEcsCreateEntity;
    private processChannelHeaderCreate;
    private processChannelHeaderUpdate;
    private processChannelClose;
    private processEcsCreateComponent;
    private processEcsDeleteEntity;
    private processCreate;
    private processUpdate;
    private processDelete;
    private processMessage;
    private processInterpolatedMessages;
    private getChannelRouteContext;
    private matchingChannelRoutes;
}
export {};
//# sourceMappingURL=ReplicaRouter.d.ts.map