enum EngineMessage {
    Null = 0,
    ConnectionAccepted,
    ConnectionDenied,

    ConnectionAttempt,
    Foo,

    ChannelJoin,
    ChannelLeave,
    ChannelAddEntity,
    ChannelRemoveEntity,

    DisconnectedByServer

}

export { EngineMessage }
