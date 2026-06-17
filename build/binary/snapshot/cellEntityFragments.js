"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeCellFragments = writeCellFragments;
exports.sumCellFragmentBytes = sumCellFragmentBytes;
exports.sumCellFragmentCreates = sumCellFragmentCreates;
exports.sumCellFragmentDeletes = sumCellFragmentDeletes;
exports.sumCellFragmentUpdateProps = sumCellFragmentUpdateProps;
exports.sumCellFragmentUpdateGroups = sumCellFragmentUpdateGroups;
exports.sumCellFragmentGroupedProps = sumCellFragmentGroupedProps;
const snapshotPayload_1 = require("./snapshotPayload");
function writeCellFragments(writer, instance, fragments) {
    for (let i = 0; i < fragments.length; i++) {
        const fragment = fragments[i];
        const copyStart = instance.network.snapshotPerformanceEnabled ? performance.now() : 0;
        (0, snapshotPayload_1.writePayload)(writer, fragment.payload);
        if (instance.network.snapshotPerformanceEnabled) {
            instance.network.recordSharedFragmentCopy(performance.now() - copyStart, fragment.bytes);
        }
    }
}
function sumCellFragmentBytes(fragments) {
    let bytes = 0;
    for (let i = 0; i < fragments.length; i++) {
        bytes += fragments[i].bytes;
    }
    return bytes;
}
function sumCellFragmentCreates(fragments) {
    let creates = 0;
    for (let i = 0; i < fragments.length; i++) {
        creates += fragments[i].creates;
    }
    return creates;
}
function sumCellFragmentDeletes(fragments) {
    let deletes = 0;
    for (let i = 0; i < fragments.length; i++) {
        deletes += fragments[i].deletes;
    }
    return deletes;
}
function sumCellFragmentUpdateProps(fragments) {
    let updates = 0;
    for (let i = 0; i < fragments.length; i++) {
        updates += fragments[i].updateProps;
    }
    return updates;
}
function sumCellFragmentUpdateGroups(fragments) {
    let updates = 0;
    for (let i = 0; i < fragments.length; i++) {
        updates += fragments[i].updateGroups;
    }
    return updates;
}
function sumCellFragmentGroupedProps(fragments) {
    let props = 0;
    for (let i = 0; i < fragments.length; i++) {
        props += fragments[i].groupedUpdateProps;
    }
    return props;
}
