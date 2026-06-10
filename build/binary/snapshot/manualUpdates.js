"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countManualUpdateBytes = countManualUpdateBytes;
exports.writeManualUpdates = writeManualUpdates;
exports.countEcsManualUpdateBytes = countEcsManualUpdateBytes;
exports.writeEcsManualUpdates = writeEcsManualUpdates;
exports.countManualGroupedProps = countManualGroupedProps;
exports.getManualUpdateFragment = getManualUpdateFragment;
const BinarySection_1 = require("../../common/binary/BinarySection");
const Protocol_1 = require("../../common/binary/Protocol");
function countManualGroupUpdates(channel, protocol) {
    const count = channel.manualGroupNids.length;
    if (count === 0) {
        return 0;
    }
    let bytes = 1 + 4;
    const nidBytes = (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
    const values = channel.manualGroupValues;
    for (let i = 0; i < count; i++) {
        const group = channel.manualGroupSchemas[i];
        let offset = channel.manualGroupValueOffsets[i];
        bytes += nidBytes + 1;
        for (let j = 0; j < group.props.length; j++) {
            bytes += group.props[j].binary.byteSize(values[offset++]);
        }
    }
    return bytes;
}
function countManualPropUpdates(channel, protocol) {
    const count = channel.manualPropNids.length;
    if (count === 0) {
        return 0;
    }
    let bytes = 1 + 4;
    const nidBytes = (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
    const props = channel.manualPropSchemas;
    const values = channel.manualPropValues;
    for (let i = 0; i < count; i++) {
        bytes += nidBytes + 1 + props[i].binary.byteSize(values[i]);
    }
    return bytes;
}
function writeManualPropUpdates(channel, writer, protocol) {
    const count = channel.manualPropNids.length;
    if (count === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntities);
    writer.writeUInt32(count);
    const nids = channel.manualPropNids;
    const props = channel.manualPropSchemas;
    const values = channel.manualPropValues;
    for (let i = 0; i < count; i++) {
        (0, Protocol_1.writeNetworkId)(nids[i], protocol.nidType, writer);
        writer.writeUInt8(props[i].key);
        props[i].binary.write(values[i], writer);
    }
}
function writeManualGroupUpdates(channel, writer, protocol) {
    const count = channel.manualGroupNids.length;
    if (count === 0) {
        return;
    }
    writer.writeUInt8(BinarySection_1.BinarySection.UpdateEntityGroups);
    writer.writeUInt32(count);
    const nids = channel.manualGroupNids;
    const groups = channel.manualGroupSchemas;
    const offsets = channel.manualGroupValueOffsets;
    const values = channel.manualGroupValues;
    for (let i = 0; i < count; i++) {
        const group = groups[i];
        let offset = offsets[i];
        (0, Protocol_1.writeNetworkId)(nids[i], protocol.nidType, writer);
        writer.writeUInt8(group.key);
        for (let j = 0; j < group.props.length; j++) {
            group.props[j].binary.write(values[offset++], writer);
        }
    }
}
function countManualUpdateBytes(channel, protocol) {
    return countManualPropUpdates(channel, protocol) + countManualGroupUpdates(channel, protocol);
}
function writeManualUpdates(channel, writer, protocol) {
    writeManualPropUpdates(channel, writer, protocol);
    writeManualGroupUpdates(channel, writer, protocol);
}
function collectManualGroupBatches(channel) {
    const batches = [];
    const ntypes = channel.manualGroupNTypes;
    const groups = channel.manualGroupSchemas;
    for (let i = 0; i < groups.length; i++) {
        const ntype = ntypes[i];
        const group = groups[i];
        let batch = null;
        for (let j = 0; j < batches.length; j++) {
            const candidate = batches[j];
            if (candidate.ntype === ntype && candidate.group.key === group.key) {
                batch = candidate;
                break;
            }
        }
        if (batch) {
            batch.count++;
        }
        else {
            batches.push({ ntype, group, count: 1 });
        }
    }
    return batches;
}
function countEcsManualUpdateBytes(channel, protocol) {
    let bytes = countManualPropUpdates(channel, protocol);
    const batches = collectManualGroupBatches(channel);
    const nidBytes = (0, Protocol_1.byteSizeOfNetworkType)(protocol.nidType);
    const ntypeBytes = (0, Protocol_1.byteSizeOfNetworkType)(protocol.ntypeType);
    const ntypes = channel.manualGroupNTypes;
    const groups = channel.manualGroupSchemas;
    const offsets = channel.manualGroupValueOffsets;
    const values = channel.manualGroupValues;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        bytes += 1 + ntypeBytes + 1 + 4;
        for (let j = 0; j < groups.length; j++) {
            const group = groups[j];
            if (ntypes[j] !== batch.ntype || group.key !== batch.group.key) {
                continue;
            }
            bytes += nidBytes;
            let offset = offsets[j];
            for (let k = 0; k < group.props.length; k++) {
                bytes += group.props[k].binary.byteSize(values[offset++]);
            }
        }
    }
    return bytes;
}
function writeEcsManualGroupUpdates(channel, writer, protocol) {
    const batches = collectManualGroupBatches(channel);
    const nids = channel.manualGroupNids;
    const ntypes = channel.manualGroupNTypes;
    const groups = channel.manualGroupSchemas;
    const offsets = channel.manualGroupValueOffsets;
    const values = channel.manualGroupValues;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        writer.writeUInt8(BinarySection_1.BinarySection.EcsUpdateComponentGroups);
        (0, Protocol_1.writeNetworkId)(batch.ntype, protocol.ntypeType, writer);
        writer.writeUInt8(batch.group.key);
        writer.writeUInt32(batch.count);
        for (let j = 0; j < groups.length; j++) {
            const group = groups[j];
            if (ntypes[j] !== batch.ntype || group.key !== batch.group.key) {
                continue;
            }
            let offset = offsets[j];
            (0, Protocol_1.writeNetworkId)(nids[j], protocol.nidType, writer);
            for (let k = 0; k < group.props.length; k++) {
                group.props[k].binary.write(values[offset++], writer);
            }
        }
    }
}
function writeEcsManualUpdates(channel, writer, protocol) {
    writeManualPropUpdates(channel, writer, protocol);
    writeEcsManualGroupUpdates(channel, writer, protocol);
}
function countManualGroupedProps(channel) {
    let props = 0;
    const groups = channel.manualGroupSchemas;
    for (let i = 0; i < groups.length; i++) {
        props += groups[i].props.length;
    }
    return props;
}
function getManualUpdateFragment(user, instance, channel, keyPrefix) {
    const protocol = instance.network.getProtocol();
    const key = `${instance.tick}:${channel.nid}:${keyPrefix}:${protocol.nidType}:${protocol.ntypeType}`;
    const cached = instance.network.sharedUpdateFragments.get(key);
    if (cached) {
        instance.network.recordSharedFragmentHit();
        return cached;
    }
    const measure = instance.network.snapshotPerformanceEnabled;
    let countStart = 0;
    let countMs = 0;
    let writeStart = 0;
    let writeMs = 0;
    if (measure) {
        countStart = performance.now();
    }
    const bytes = countEcsManualUpdateBytes(channel, protocol);
    if (measure) {
        countMs = performance.now() - countStart;
        writeStart = performance.now();
    }
    const writer = user.networkAdapter.binary.createWriter(bytes);
    writeEcsManualUpdates(channel, writer, protocol);
    if (measure) {
        writeMs = performance.now() - writeStart;
    }
    const fragment = {
        payload: writer.payload,
        bytes,
        updateProps: channel.manualPropNids.length,
        updateGroups: channel.manualGroupNids.length,
        groupedUpdateProps: countManualGroupedProps(channel)
    };
    instance.network.sharedUpdateFragments.set(key, fragment);
    instance.network.recordSharedFragmentBuild({ collectMs: 0, countMs, writeMs, bytes });
    return fragment;
}
