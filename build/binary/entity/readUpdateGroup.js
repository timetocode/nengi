"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Binary_1 = require("../../common/binary/Binary");
const Protocol_1 = require("../../common/binary/Protocol");
function readUpdateGroup(reader, context, ntypes, nidType = Binary_1.Binary.UInt8) {
    const nid = (0, Protocol_1.readNetworkId)(nidType, reader);
    const groupKey = reader.readUInt8();
    const ntype = ntypes.get(nid);
    const nschema = context.getSchema(ntype);
    const group = nschema.updateGroups[groupKey];
    const diffs = [];
    for (let i = 0; i < group.props.length; i++) {
        const propData = group.props[i];
        diffs.push({
            nid,
            prop: propData.prop,
            value: propData.binary.read(reader)
        });
    }
    return diffs;
}
exports.default = readUpdateGroup;
