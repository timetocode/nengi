declare enum EngineMessage {
    Null = 0,
    ConnectionAccepted = 1,
    ConnectionDenied = 2,
    ConnectionAttempt = 3,
    ChannelJoin = 4,
    ChannelLeave = 5,
    ChannelAddEntity = 6,
    ChannelRemoveEntity = 7,
    ConnectionTerminated = 8,
    ClientTick = 9
}
export { EngineMessage };
