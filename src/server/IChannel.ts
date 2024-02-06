import { IEntity } from '../common/IEntity'
import { User } from './User'

export type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean

export interface IChannel {
    nid: number
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    addMessage(message: any): void
    subscribe(user: User): void
    unsubscribe(user: User): void
    getVisibleEntities(userId: number): number[]
    tick(tick: number): void
}

export interface ICulledChannel<VisibleObjectType, ViewType> {
    nid: number
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    addMessage(message: any): void
    subscribe(user: User, view: ViewType): void
    unsubscribe(user: User): void
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    getVisibleEntities(userId: number): number[]
    tick(tick: number): void
}