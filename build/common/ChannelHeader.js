"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultChannelHeaderNType = exports.ChannelType = void 0;
exports.createChannelHeader = createChannelHeader;
exports.cloneChannelHeader = cloneChannelHeader;
exports.mergeChannelHeaderData = mergeChannelHeaderData;
exports.hasSchemaBackedChannelHeader = hasSchemaBackedChannelHeader;
var ChannelType;
(function (ChannelType) {
    ChannelType[ChannelType["Channel"] = 1] = "Channel";
    ChannelType[ChannelType["ManualChannel"] = 2] = "ManualChannel";
    ChannelType[ChannelType["SpatialChannel2D"] = 3] = "SpatialChannel2D";
    ChannelType[ChannelType["SpatialChannel3D"] = 4] = "SpatialChannel3D";
    ChannelType[ChannelType["ManualSpatialChannel2D"] = 5] = "ManualSpatialChannel2D";
    ChannelType[ChannelType["ManualSpatialChannel3D"] = 6] = "ManualSpatialChannel3D";
    ChannelType[ChannelType["EcsChannel"] = 7] = "EcsChannel";
    ChannelType[ChannelType["EcsSpatialChannel2D"] = 8] = "EcsSpatialChannel2D";
    ChannelType[ChannelType["EcsSpatialChannel3D"] = 9] = "EcsSpatialChannel3D";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
exports.DefaultChannelHeaderNType = 0;
function createChannelHeader(channelId, channelType, input, name) {
    if (typeof input === 'object' && input !== null) {
        if (input.nid !== 0 && input.nid !== channelId) {
            throw new Error(`Channel header nid must be 0 or match the channel id ${channelId}.`);
        }
        input.nid = channelId;
        input.channelType = channelType;
        if (name !== undefined) {
            ;
            input.name = name;
        }
        return input;
    }
    const header = {
        nid: channelId,
        ntype: exports.DefaultChannelHeaderNType,
        channelType
    };
    if (name !== undefined) {
        header.name = name;
    }
    return header;
}
function cloneChannelHeader(header) {
    return Object.assign({}, header);
}
function mergeChannelHeaderData(base, data) {
    const merged = Object.assign({}, base, data);
    merged.nid = base.nid;
    merged.channelType = base.channelType;
    return merged;
}
function hasSchemaBackedChannelHeader(header) {
    return header.ntype !== exports.DefaultChannelHeaderNType;
}
