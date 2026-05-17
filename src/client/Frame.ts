import { IEntity } from '../common/IEntity'

export type AppliedEntityChange = {
    nid: number
    prop: string
    previous: any
    value: any
}

export type DeletedEntity = {
    nid: number
    entity?: IEntity
}

export interface IEntityFrame {
    tick: number
    timestamp: number
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]
    confirmedClientTick: number
}

export class Frame implements IEntityFrame {
    tick: number
    confirmedClientTick: number
    timestamp: number
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]

    constructor(args: IEntityFrame) {
        this.tick = args.tick
        this.confirmedClientTick = args.confirmedClientTick
        this.timestamp = args.timestamp
        this.createEntities = args.createEntities
        this.updateEntities = args.updateEntities
        this.deleteEntities = args.deleteEntities
        this.deletedEntities = args.deletedEntities
        this.messages = args.messages
    }
}
