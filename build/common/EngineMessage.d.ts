declare enum EngineMessage {
    Null = 0,
    ConnectionAccepted = 1,
    ConnectionDenied = 2,
    ConnectionAttempt = 3,
    Foo = 4,
    ChannelJoin = 5,
    ChannelLeave = 6,
    ChannelAddEntity = 7,
    ChannelRemoveEntity = 8
}
export { EngineMessage };
