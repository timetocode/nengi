import { IEntity } from './IEntity'

export enum ChannelType {
    Channel = 1,
    ManualChannel = 2,
    Channel2D = 3,
    Channel3D = 4,
    ManualChannel2D = 5,
    ManualChannel3D = 6,
    EcsChannel = 7,
    EcsChannel2D = 12,
    EcsChannel3D = 13
}

export const DefaultChannelHeaderNType = 0

export type ChannelHeader = IEntity & {
    channelType: ChannelType
    name?: string
}

export type ChannelHeaderInput = IEntity

export function createChannelHeader(
    channelId: number,
    channelType: ChannelType,
    input?: ChannelHeaderInput,
    name?: string
): ChannelHeader {
    if (typeof input === 'object' && input !== null) {
        if (input.nid !== 0 && input.nid !== channelId) {
            throw new Error(`Channel header nid must be 0 or match the channel id ${channelId}.`)
        }
        input.nid = channelId
        ;(input as ChannelHeader).channelType = channelType
        if (name !== undefined) {
            ;(input as ChannelHeader).name = name
        }
        return input as ChannelHeader
    }

    const header: ChannelHeader = {
        nid: channelId,
        ntype: DefaultChannelHeaderNType,
        channelType
    }
    if (name !== undefined) {
        header.name = name
    }
    return header
}

export function cloneChannelHeader(header: ChannelHeader): ChannelHeader {
    return Object.assign({}, header)
}

export function mergeChannelHeaderData(base: ChannelHeader, data: IEntity): ChannelHeader {
    const merged = Object.assign({}, base, data) as ChannelHeader
    merged.nid = base.nid
    merged.channelType = base.channelType
    return merged
}

export function hasSchemaBackedChannelHeader(header: ChannelHeader) {
    return header.ntype !== DefaultChannelHeaderNType
}
