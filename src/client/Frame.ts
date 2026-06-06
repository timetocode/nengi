import { IEntity } from '../common/IEntity'
import type { ChannelEntityCreate, ChannelIdentity } from '../binary/snapshot/SnapshotPlan'

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
    receivedAt: number
    ecsCreateEntities?: number[]
    ecsCreateComponents?: IEntity[]
    ecsDeleteEntities?: number[]
    channelIdentities?: ChannelIdentity[]
    channelEntityCreates?: ChannelEntityCreate[]
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
    receivedAt: number
    ecsCreateEntities: number[]
    ecsCreateComponents: IEntity[]
    ecsDeleteEntities: number[]
    channelIdentities: ChannelIdentity[]
    channelEntityCreates: ChannelEntityCreate[]
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]

    constructor(args: IEntityFrame) {
        this.tick = args.tick
        this.confirmedClientTick = args.confirmedClientTick
        this.timestamp = args.timestamp
        this.receivedAt = args.receivedAt
        this.ecsCreateEntities = args.ecsCreateEntities || []
        this.ecsCreateComponents = args.ecsCreateComponents || []
        this.ecsDeleteEntities = args.ecsDeleteEntities || []
        this.channelIdentities = args.channelIdentities || []
        this.channelEntityCreates = args.channelEntityCreates || []
        this.createEntities = args.createEntities
        this.updateEntities = args.updateEntities
        this.deleteEntities = args.deleteEntities
        this.deletedEntities = args.deletedEntities
        this.messages = args.messages
    }
}
