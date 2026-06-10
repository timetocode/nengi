"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSnapshotPlanChunk = createSnapshotPlanChunk;
exports.createSnapshotChunk = createSnapshotChunk;
exports.sumSnapshotChunkBytes = sumSnapshotChunkBytes;
exports.writeSnapshotChunks = writeSnapshotChunks;
const Protocol_1 = require("../../common/binary/Protocol");
const BinaryDebugError_1 = require("../BinaryDebugError");
const countSnapshotBytes_1 = require("./countSnapshotBytes");
const writeSnapshot_1 = require("./writeSnapshot");
// A snapshot is written as an append-only sequence of independently counted
// chunks: engine/user envelope first, then zero or more channel-specific
// sections and cached fragments. Keeping chunks explicit lets channel writers
// specialize without re-coupling visibility collection to binary writing.
function createSnapshotPlanChunk(label, plan, context, protocol = Protocol_1.DEFAULT_PROTOCOL) {
    const bytes = (0, countSnapshotBytes_1.countSnapshotBytes)(plan, context, protocol);
    return {
        label,
        bytes,
        write: writer => (0, writeSnapshot_1.writeSnapshot)(plan, context, writer, protocol),
        writeDebug: writer => (0, writeSnapshot_1.writeSnapshotDebug)(plan, context, writer, protocol)
    };
}
function createSnapshotChunk(label, bytes, write, writeDebug) {
    return { label, bytes, write, writeDebug };
}
function sumSnapshotChunkBytes(chunks) {
    let bytes = 0;
    for (let i = 0; i < chunks.length; i++) {
        bytes += chunks[i].bytes;
    }
    return bytes;
}
function writeSnapshotChunks(chunks, writer, options = {}) {
    try {
        writeChunks(chunks, writer, false, false);
    }
    catch (err) {
        if (!options.debug) {
            throw err;
        }
        if (options.createWriter) {
            const debugWriter = options.createWriter(sumSnapshotChunkBytes(chunks));
            try {
                writeChunks(chunks, debugWriter, true, true);
            }
            catch (debugErr) {
                throw debugErr;
            }
        }
        throw (0, BinaryDebugError_1.createBinaryDebugError)(err, {
            phase: 'write',
            section: 'Snapshot',
            offset: writer.offset
        });
    }
}
function writeChunks(chunks, writer, debug, wrapErrors) {
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
            if (debug && chunk.writeDebug) {
                chunk.writeDebug(writer);
            }
            else {
                chunk.write(writer);
            }
        }
        catch (err) {
            if (!wrapErrors) {
                throw err;
            }
            if (err instanceof BinaryDebugError_1.BinaryDebugError) {
                throw err;
            }
            throw (0, BinaryDebugError_1.createBinaryDebugError)(err, {
                phase: 'write',
                section: chunk.label,
                index: i,
                offset: writer.offset
            });
        }
    }
}
