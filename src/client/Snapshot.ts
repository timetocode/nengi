import { IEntity } from '../common/IEntity'
import type { ChannelEntityCreate, ChannelHeaderCreate, ChannelHeaderDelete, ChannelHeaderUpdate } from '../binary/snapshot/SnapshotPlan'

export type Snapshot = {
    timestamp: number
    confirmedClientTick: number,
    messages: any[],
    channelEntityCreates?: ChannelEntityCreate[],
    channelHeaderCreates?: ChannelHeaderCreate[],
    channelHeaderUpdates?: ChannelHeaderUpdate[],
    channelHeaderDeletes?: ChannelHeaderDelete[],
    ecsCreateEntities?: number[],
    ecsCreateComponents?: IEntity[],
    ecsDeleteEntities?: number[],
    createEntities: IEntity[],
    updateEntities: any[],
    deleteEntities: number[]
}
