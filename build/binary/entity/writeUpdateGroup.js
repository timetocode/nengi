"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function writeUpdateGroup(update, writer, nidType = Binary_1.Binary.UInt8) {
    (0, Protocol_1.writeNetworkId)(update.nid, nidType, writer);
    writer.writeUInt8(update.group.key);
    for (let i = 0; i < update.group.props.length; i++) {
        update.group.props[i].binary.write(update.values[i], writer);
    }
}
exports.default = writeUpdateGroup;
