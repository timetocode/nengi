"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineMessage = void 0;
var EngineMessage;
(function (EngineMessage) {
    EngineMessage[EngineMessage["Null"] = 0] = "Null";
    EngineMessage[EngineMessage["ConnectionAccepted"] = 1] = "ConnectionAccepted";
    EngineMessage[EngineMessage["ConnectionDenied"] = 2] = "ConnectionDenied";
    EngineMessage[EngineMessage["ConnectionAttempt"] = 3] = "ConnectionAttempt";
    EngineMessage[EngineMessage["Foo"] = 4] = "Foo";
    EngineMessage[EngineMessage["ChannelJoin"] = 5] = "ChannelJoin";
    EngineMessage[EngineMessage["ChannelLeave"] = 6] = "ChannelLeave";
    EngineMessage[EngineMessage["ChannelAddEntity"] = 7] = "ChannelAddEntity";
    EngineMessage[EngineMessage["ChannelRemoveEntity"] = 8] = "ChannelRemoveEntity";
    EngineMessage[EngineMessage["ConnectionTerminated"] = 9] = "ConnectionTerminated";
})(EngineMessage || (EngineMessage = {}));
exports.EngineMessage = EngineMessage;
//# sourceMappingURL=EngineMessage.js.map