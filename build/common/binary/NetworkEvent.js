"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkEvent = void 0;
var NetworkEvent;
(function (NetworkEvent) {
    NetworkEvent[NetworkEvent["Null"] = 0] = "Null";
    NetworkEvent[NetworkEvent["UserConnected"] = 1] = "UserConnected";
    NetworkEvent[NetworkEvent["Command"] = 2] = "Command";
    NetworkEvent[NetworkEvent["UserDisconnected"] = 3] = "UserDisconnected";
    NetworkEvent[NetworkEvent["UserConnectionDenied"] = 4] = "UserConnectionDenied";
})(NetworkEvent || (NetworkEvent = {}));
exports.NetworkEvent = NetworkEvent;
//# sourceMappingURL=NetworkEvent.js.map