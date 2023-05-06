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
    TimeSync = 9,
    ClientTick = 10
}
export { EngineMessage };
