import { IEntity } from '../../common/IEntity';
import { User } from '../User';
export type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean;
export interface IChannel {
    nid: number;
    label?: string;
    header?: IEntity | null;
    headerVersion?: number;
    addMessage(message: any): void;
    subscribe(user: User): void;
    unsubscribe(user: User): void;
    unsubscribeAll(): void;
    getVisibleEntities(userId: number): number[];
    getVisibleNetworkedNids?(userId: number): number[];
    clearBroadcastMessages?(): void;
    clearSnapshotDeltas?(): void;
    tick(tick: number): void;
    destroy?(): void;
    setHeader?(header: IEntity): IEntity;
    getHeader?(): IEntity | null;
    markHeaderDirty?(): boolean;
}
export interface IObjectChannel extends IChannel {
    addEntity(entity: IEntity): IEntity;
    /**
     * Removes the exact object previously added to this channel.
     * Returns the removed nid, or 0 when nothing was removed. Use the return
     * value for userland maps because successful removal clears entity.nid.
     */
    removeEntity(entity: IEntity): number;
    removeAllEntities(): void;
    markDirty?(entity: IEntity): boolean;
}
export interface ICulledChannel<VisibleObjectType extends IEntity, ViewType> {
    nid: number;
    label?: string;
    addEntity(entity: VisibleObjectType): IEntity;
    /**
     * Removes the exact object previously added to this channel.
     * Returns the removed nid, or 0 when nothing was removed. Use the return
     * value for userland maps because successful removal clears entity.nid.
     */
    removeEntity(entity: VisibleObjectType): number;
    removeAllEntities(): void;
    markDirty?(entity: VisibleObjectType): boolean;
    addMessage(message: any): void;
    subscribe(user: User, view: ViewType): void;
    updateView(user: User, view: ViewType): void;
    unsubscribe(user: User): void;
    unsubscribeAll(): void;
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>;
    getVisibleEntities(userId: number): number[];
    getVisibleNetworkedNids?(userId: number): number[];
    tick(tick: number): void;
    clearBroadcastMessages?(): void;
    clearSnapshotDeltas?(): void;
    destroy?(): void;
}
//# sourceMappingURL=IChannel.d.ts.map