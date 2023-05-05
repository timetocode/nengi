import { IEntity } from '../common/IEntity'
import { User } from './User'

type ChannelSubscriptionHandler = (user: User, channel: IChannel) => void
type CulledChannelSubscriptionHandler = (user: User, channel: ICulledChannel<any, any>) => void
type VisibilityResolver<VisibleObjectType, ViewType> = (obj: VisibleObjectType, view: ViewType) => boolean

interface IChannel {
    id: number
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    addMessage(message: any): void
    subscribe(user: User, view?: any): void
    unsubscribe(user: User): void
    onSubscribe: ChannelSubscriptionHandler
    onUnsubscribe: ChannelSubscriptionHandler
    getVisibileEntities(userId: number): number[]
}

interface ICulledChannel<VisibleObjectType, ViewType> {
    id: number
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    addMessage(message: any): void
    subscribe(user: User, view: ViewType): void
    unsubscribe(user: User): void
    onSubscribe: CulledChannelSubscriptionHandler
    onUnsubscribe: CulledChannelSubscriptionHandler
    visibilityResolver: VisibilityResolver<VisibleObjectType, ViewType>
    getVisibileEntities(userId: number): number[]
}

export { IChannel, ICulledChannel, ChannelSubscriptionHandler, CulledChannelSubscriptionHandler, VisibilityResolver }