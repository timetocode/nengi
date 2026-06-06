import { IEntity } from '../common/IEntity'
import { User } from './User'

export type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean

export interface IChannel {
    nid: number
    label?: string
    clientIdentity?: any
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    removeAllEntities(): void
    markDirty?(entity: IEntity): boolean
    addMessage(message: any): void
    subscribe(user: User): void
    unsubscribe(user: User): void
    unsubscribeAll(): void
    getVisibleEntities(userId: number): number[]
    getVisibleNetworkedNids?(userId: number): number[]
    clearBroadcastMessages?(): void
    tick(tick: number): void
}

export interface ICulledChannel<VisibleObjectType, ViewType> {
    nid: number
    label?: string
    clientIdentity?: any
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    removeAllEntities(): void
    addMessage(message: any): void
    subscribe(user: User, view: ViewType): void
    updateView(user: User, view: ViewType): void
    unsubscribe(user: User): void
    unsubscribeAll(): void
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    getVisibleEntities(userId: number): number[]
    getVisibleNetworkedNids?(userId: number): number[]
    tick(tick: number): void
}
