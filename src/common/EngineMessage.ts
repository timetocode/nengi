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

// Covers 255 timed commands, frame/delay controls and a full Pong batch.
export const MAX_CLIENT_ENGINE_MESSAGES_PER_PACKET = 512
export const MAX_CLIENT_PACKET_SECTIONS = 512
