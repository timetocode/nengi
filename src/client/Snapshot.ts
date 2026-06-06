import { IEntity } from '../common/IEntity'
import type { ChannelEntityCreate, ChannelIdentity } from '../binary/snapshot/SnapshotPlan'

export type Snapshot = {
    timestamp: number
    confirmedClientTick: number,
    messages: any[],
    channelIdentities?: ChannelIdentity[],
    channelEntityCreates?: ChannelEntityCreate[],
    ecsCreateEntities?: number[],
    ecsCreateComponents?: IEntity[],
    ecsDeleteEntities?: number[],
    createEntities: IEntity[],
    updateEntities: any[],
    deleteEntities: number[]
}
