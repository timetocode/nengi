enum EngineMessage {
    Null = 0,
    ConnectionAccepted,
    ConnectionDenied,
    ConnectionAttempt,
    ChannelJoin,
    ChannelLeave,
    ChannelAddEntity,
    ChannelRemoveEntity,
    ConnectionTerminated,

    ClientTick,
}

export { EngineMessage }
