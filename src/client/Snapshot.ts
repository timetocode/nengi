import { IEntity } from '../common/IEntity'

export type Snapshot = {
    timestamp: number
    confirmedClientTick: number,
    messages: any[],
    createEntities: IEntity[],
    updateEntities: any[],
    deleteEntities: number[]
}
