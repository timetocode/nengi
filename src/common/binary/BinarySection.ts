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
    ClientTick,
    UpdateEntityGroups,
    EcsCreateEntities,
    EcsCreateComponents,
    EcsDeleteEntities,
    EcsUpdateComponentGroups,
    ChannelEntityCreates,
    ChannelHeaderUpdates,
    ChannelCloses,
    SkipInterpolation,
    InterpolatedMessages,
    ChannelOpens,
    ChannelScope
}

export { BinarySection }
