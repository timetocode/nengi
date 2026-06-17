import { IEntity } from '../../common/IEntity'
import { ChannelHeader, ChannelType } from '../../common/ChannelHeader'
import { User } from '../User'

export type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean

export interface IChannel {
    /**
     * Internal replicated channel id. This is allocated from the same id pool
     * as entities because it is written with the same compact nid encoding, but
     * it is not a client-side entity. Use a header for replicated channel
     * context.
    */
    nid: number
    channelType: ChannelType
    header: ChannelHeader
    headerVersion: number
    addMessage(message: any): void
    addInterpolatedMessage?(message: any): void
    subscribe(user: User): void
    unsubscribe(user: User): void
    unsubscribeAll(): void
    getVisibleEntities(userId: number): number[]
    getVisibleNetworkedNids?(userId: number): number[]
    clearBroadcastMessages?(): void
    clearSnapshotDeltas?(): void
    /**
     * Marks an entity for one-frame interpolation skipping in the next snapshot.
     * Use this for discontinuous moves such as teleports, blinks, respawns,
     * wraparound, or object-pool reuse where the client should see the entity
     * appear at its new position instead of quickly sliding from the old one.
     */
    skipInterpolation?(entity: IEntity): boolean
    destroy?(): void
    markHeaderDirty?(): boolean
}

export interface IObjectChannel extends IChannel {
    addEntity(entity: IEntity): IEntity
    /**
     * Removes the exact object previously added to this channel.
     * Returns the removed nid, or 0 when nothing was removed. Use the return
     * value for userland maps because successful removal clears entity.nid.
     */
    removeEntity(entity: IEntity): number
    removeAllEntities(): void
    markDirty?(entity: IEntity): boolean
    /**
     * Marks an entity for one-frame interpolation skipping in the next snapshot.
     * Use this for discontinuous moves such as teleports, blinks, respawns,
     * wraparound, or object-pool reuse where the client should see the entity
     * appear at its new position instead of quickly sliding from the old one.
     */
    skipInterpolation?(entity: IEntity): boolean
}

export interface ICulledChannel<VisibleObjectType extends IEntity, ViewType> {
    nid: number
    channelType: ChannelType
    header: ChannelHeader
    headerVersion: number
    addEntity(entity: VisibleObjectType): IEntity
    /**
     * Removes the exact object previously added to this channel.
     * Returns the removed nid, or 0 when nothing was removed. Use the return
     * value for userland maps because successful removal clears entity.nid.
     */
    removeEntity(entity: VisibleObjectType): number
    removeAllEntities(): void
    markDirty?(entity: VisibleObjectType): boolean
    /**
     * Marks an entity for one-frame interpolation skipping in the next snapshot.
     * Use this for discontinuous moves such as teleports, blinks, respawns,
     * wraparound, or object-pool reuse where the client should see the entity
     * appear at its new position instead of quickly sliding from the old one.
     */
    skipInterpolation?(entity: VisibleObjectType): boolean
    addMessage(message: any): void
    addInterpolatedMessage?(message: any): void
    subscribe(user: User, view: ViewType): void
    updateView(user: User, view: ViewType): void
    unsubscribe(user: User): void
    unsubscribeAll(): void
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    getVisibleEntities(userId: number): number[]
    getVisibleNetworkedNids?(userId: number): number[]
    clearBroadcastMessages?(): void
    clearSnapshotDeltas?(): void
    destroy?(): void
    markHeaderDirty?(): boolean
}
