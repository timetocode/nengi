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
    ChannelHeaderCreates,
    ChannelHeaderUpdates,
    ChannelHeaderDeletes
}

export { BinarySection }
