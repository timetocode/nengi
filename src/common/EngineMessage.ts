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
    TimeSync,

    ClientTick,
}

export { EngineMessage }
