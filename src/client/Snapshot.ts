import { IEntity } from '../common/IEntity'

type Snapshot = {
    timestamp: number
    messages: any[],
    createEntities: IEntity[],
    updateEntities: any[],
    deleteEntities: number[]
}

export { Snapshot }