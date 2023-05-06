"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinarySection = void 0;
var BinarySection;
(function (BinarySection) {
    BinarySection[BinarySection["Null"] = 0] = "Null";
    BinarySection[BinarySection["EngineMessages"] = 1] = "EngineMessages";
    BinarySection[BinarySection["CreateEntities"] = 2] = "CreateEntities";
    BinarySection[BinarySection["UpdateEntities"] = 3] = "UpdateEntities";
    BinarySection[BinarySection["DeleteEntities"] = 4] = "DeleteEntities";
    BinarySection[BinarySection["Messages"] = 5] = "Messages";
    BinarySection[BinarySection["Commands"] = 6] = "Commands";
    BinarySection[BinarySection["Requests"] = 7] = "Requests";
    BinarySection[BinarySection["Responses"] = 8] = "Responses";
    BinarySection[BinarySection["ClientTick"] = 9] = "ClientTick";
})(BinarySection || (BinarySection = {}));
exports.BinarySection = BinarySection;
//# sourceMappingURL=BinarySection.js.map