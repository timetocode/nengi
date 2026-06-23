enum BinarySection {
    Null = 0,
    EngineMessages,
    CreateEntities,
    UpdateEntities,
    DeleteEntities,
    Messages,
    Commands,
    Requests,
    Responses,
    CommandFrameNumber,
    UpdateEntityGroups,
    EcsCreateEntities,
    EcsCreateComponents,
    EcsDeleteEntities,
    EcsUpdateComponentGroups,
    ChannelHeaderUpdates,
    ChannelCloses,
    SkipInterpolation,
    InterpolatedMessages,
    ChannelOpens,
    ChannelScope
}

export { BinarySection }
