"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkEvent = void 0;
var NetworkEvent;
(function (NetworkEvent) {
    NetworkEvent[NetworkEvent["Null"] = 0] = "Null";
    NetworkEvent[NetworkEvent["UserConnected"] = 1] = "UserConnected";
    NetworkEvent[NetworkEvent["Command"] = 2] = "Command";
    NetworkEvent[NetworkEvent["CommandSet"] = 3] = "CommandSet";
    NetworkEvent[NetworkEvent["UserDisconnected"] = 4] = "UserDisconnected";
    NetworkEvent[NetworkEvent["UserConnectionDenied"] = 5] = "UserConnectionDenied";
})(NetworkEvent || (exports.NetworkEvent = NetworkEvent = {}));
