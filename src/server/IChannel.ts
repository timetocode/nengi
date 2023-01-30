import IEntity from '../common/IEntity'
import { ViewAABB } from './ViewAABB'

interface IChannel {
    id: number
    addEntity(entity: IEntity): void
    removeEntity(entity: IEntity): void
    addMessage(message: any): void
    getVisible(userId: number): number []
    subscribe(user: any, view: undefined | ViewAABB): void
    unsubscribe(user: any): void
    destroy(): void
}

export default IChannel