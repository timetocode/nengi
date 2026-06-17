import { IEntity } from './IEntity';
export declare enum ChannelType {
    Channel = 1,
    ManualChannel = 2,
    SpatialChannel2D = 3,
    SpatialChannel3D = 4,
    ManualSpatialChannel2D = 5,
    ManualSpatialChannel3D = 6,
    EcsChannel = 7,
    EcsSpatialChannel2D = 8,
    EcsSpatialChannel3D = 9
}
export declare const DefaultChannelHeaderNType = 0;
export type ChannelHeader = IEntity & {
    channelType: ChannelType;
    name?: string;
};
export type ChannelHeaderInput = IEntity;
export declare function createChannelHeader(channelId: number, channelType: ChannelType, input?: ChannelHeaderInput, name?: string): ChannelHeader;
export declare function cloneChannelHeader(header: ChannelHeader): ChannelHeader;
export declare function mergeChannelHeaderData(base: ChannelHeader, data: IEntity): ChannelHeader;
export declare function hasSchemaBackedChannelHeader(header: ChannelHeader): boolean;
//# sourceMappingURL=ChannelHeader.d.ts.map