import { IEntity } from '../common/IEntity'
import { ChannelHeader } from '../common/ChannelHeader'
import type { ChannelEntityCreate, ChannelClose, ChannelHeaderUpdate, ChannelOpen } from '../binary/snapshot/SnapshotPlan'

export type AppliedEntityChange = {
    nid: number
    prop: string
    previous: any
    value: any
}

export type DeletedEntity = {
    nid: number
    entity?: IEntity
    channelId?: number
}

export type ClosedChannel = {
    channelId: number
    header: ChannelHeader
    entityNids: number[]
}

export type OpenedChannel = {
    channelId: number
    header: ChannelHeader
}

export type ChannelFrame = {
    channelId: number
    ecsCreateEntities: number[]
    ecsCreateComponents: IEntity[]
    ecsDeleteEntities: number[]
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]
    interpolatedMessages: any[]
}

export interface IEntityFrame {
    tick: number
    timestamp: number
    receivedAt: number
    ecsCreateEntities?: number[]
    ecsCreateComponents?: IEntity[]
    ecsDeleteEntities?: number[]
    channelOpens?: ChannelOpen[]
    channelEntityCreates?: ChannelEntityCreate[]
    channelHeaderUpdates?: ChannelHeaderUpdate[]
    channelCloses?: ChannelClose[]
    skipInterpolationNids?: number[] | Set<number>
    openedChannels?: OpenedChannel[]
    closedChannels?: ClosedChannel[]
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]
    interpolatedMessages?: any[]
    channels?: ChannelFrame[]
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
    channelOpens: ChannelOpen[]
    channelEntityCreates: ChannelEntityCreate[]
    channelHeaderUpdates: ChannelHeaderUpdate[]
    channelCloses: ChannelClose[]
    skipInterpolationNids: Set<number>
    openedChannels: OpenedChannel[]
    closedChannels: ClosedChannel[]
    createEntities: IEntity[]
    updateEntities: AppliedEntityChange[]
    deleteEntities: number[]
    deletedEntities: DeletedEntity[]
    messages: any[]
    interpolatedMessages: any[]
    channels: ChannelFrame[]

    constructor(args: IEntityFrame) {
        this.tick = args.tick
        this.confirmedClientTick = args.confirmedClientTick
        this.timestamp = args.timestamp
        this.receivedAt = args.receivedAt
        this.ecsCreateEntities = args.ecsCreateEntities || []
        this.ecsCreateComponents = args.ecsCreateComponents || []
        this.ecsDeleteEntities = args.ecsDeleteEntities || []
        this.channelOpens = args.channelOpens || []
        this.channelEntityCreates = args.channelEntityCreates || []
        this.channelHeaderUpdates = args.channelHeaderUpdates || []
        this.channelCloses = args.channelCloses || []
        this.skipInterpolationNids = new Set(args.skipInterpolationNids || [])
        this.openedChannels = args.openedChannels || []
        this.closedChannels = args.closedChannels || []
        this.createEntities = args.createEntities
        this.updateEntities = args.updateEntities
        this.deleteEntities = args.deleteEntities
        this.deletedEntities = args.deletedEntities
        this.messages = args.messages
        this.interpolatedMessages = args.interpolatedMessages || []
        this.channels = args.channels || []
    }
}
