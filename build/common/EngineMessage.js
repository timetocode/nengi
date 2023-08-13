"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineMessage = void 0;
var EngineMessage;
(function (EngineMessage) {
    EngineMessage[EngineMessage["Null"] = 0] = "Null";
    EngineMessage[EngineMessage["ConnectionAccepted"] = 1] = "ConnectionAccepted";
    EngineMessage[EngineMessage["ConnectionDenied"] = 2] = "ConnectionDenied";
    EngineMessage[EngineMessage["ConnectionAttempt"] = 3] = "ConnectionAttempt";
    EngineMessage[EngineMessage["ChannelJoin"] = 4] = "ChannelJoin";
    EngineMessage[EngineMessage["ChannelLeave"] = 5] = "ChannelLeave";
    EngineMessage[EngineMessage["ChannelAddEntity"] = 6] = "ChannelAddEntity";
    EngineMessage[EngineMessage["ChannelRemoveEntity"] = 7] = "ChannelRemoveEntity";
    EngineMessage[EngineMessage["ConnectionTerminated"] = 8] = "ConnectionTerminated";
    EngineMessage[EngineMessage["TimeSync"] = 9] = "TimeSync";
    EngineMessage[EngineMessage["ClientTick"] = 10] = "ClientTick";
})(EngineMessage || (exports.EngineMessage = EngineMessage = {}));
