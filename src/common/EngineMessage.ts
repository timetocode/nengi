export enum EngineMessage {
    Null = 0,
    ConnectionAccepted,
    ConnectionDenied,
    ConnectionAttempt,
    ChannelJoin,
    ChannelLeave,
    ChannelAddEntity,
    ChannelRemoveEntity,
    ConnectionTerminated,
    TimeSync, // reserved; snapshot serverTimeMs is now fixed metadata
    Ping,


    Pong,
    CommandFrameNumber,
    Protocol,
    CommandTiming,
    InterpolationDelay,

}
