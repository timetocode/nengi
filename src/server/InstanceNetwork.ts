import { Instance } from './Instance'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { User, UserConnectionState } from './User'
import type { CommandTimingEstimate, CommandTimingInput } from './User'
import { BinarySection } from '../common/binary/BinarySection'
import { EngineMessage } from '../common/EngineMessage'
import readEngineMessage from '../binary/message/readEngineMessage'
import readMessage from '../binary/message/readMessage'
import countMessage from '../binary/message/count'
import { writeMessage } from '../binary/message/writeMessage'
import { BinaryPayload } from '../common/binary/BinaryAdapter'
import { binaryGet } from '../common/binary/BinaryExt'
import { Binary } from '../common/binary/Binary'
import { ProtocolConfig } from '../common/binary/Protocol'
import { createEndpointPayload, readSizedEndpointPayload, skipEndpointPayload } from '../binary/endpoint/EndpointPayload'
import { ResponseStatus } from '../common/Endpoint'
import type { ResponseEndpoint } from './Instance'
import { createSchemaFingerprint } from '../common/binary/schema/schemaFingerprint'

export interface INetworkEvent {
    type: NetworkEvent
    user: User
    commands?: any
    clientTick?: number
    commandTimings?: Array<CommandTimingEstimate | undefined>
    serverReceivedTimeMs?: number
    payload?: any
}

export type ResponseBacklogInfo = {
    user: User
    queued: number
    sent: number
    remaining: number
    tick: number
}

export type SnapshotPerformanceSample = {
    collectMs: number
    countMs: number
    writeMs: number
    commitMs: number
    sendMs: number
    bytes: number
    creates: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
    deletes: number
    messages: number
    engineMessages: number
    responses: number
}

export type SnapshotPerformanceWindow = {
    snapshots: number
    sharedSnapshots: number
    collectTotalMs: number
    collectMaxMs: number
    countTotalMs: number
    countMaxMs: number
    writeTotalMs: number
    writeMaxMs: number
    commitTotalMs: number
    commitMaxMs: number
    sendTotalMs: number
    sendMaxMs: number
    bytesTotal: number
    bytesMax: number
    createsTotal: number
    updatePropsTotal: number
    updateGroupsTotal: number
    groupedUpdatePropsTotal: number
    deletesTotal: number
    messagesTotal: number
    messagesMax: number
    engineMessagesTotal: number
    engineMessagesMax: number
    responsesTotal: number
    responsesMax: number
    sharedMessageFragmentBuilds: number
    sharedMessageFragmentHits: number
    sharedMessageFragmentCountTotalMs: number
    sharedMessageFragmentCountMaxMs: number
    sharedMessageFragmentWriteTotalMs: number
    sharedMessageFragmentWriteMaxMs: number
    sharedMessageFragmentBytesTotal: number
    sharedMessageFragmentBytesMax: number
    sharedMessageFragmentCopyTotalMs: number
    sharedMessageFragmentCopyMaxMs: number
    sharedMessageFragmentCopyBytesTotal: number
    sharedMessageFragmentMessagesTotal: number
    sharedFragmentBuilds: number
    sharedFragmentHits: number
    sharedFragmentCollectTotalMs: number
    sharedFragmentCollectMaxMs: number
    sharedFragmentCountTotalMs: number
    sharedFragmentCountMaxMs: number
    sharedFragmentWriteTotalMs: number
    sharedFragmentWriteMaxMs: number
    sharedFragmentBytesTotal: number
    sharedFragmentBytesMax: number
    sharedFragmentCopyTotalMs: number
    sharedFragmentCopyMaxMs: number
    sharedFragmentCopyBytesTotal: number
}

export type SharedSnapshotFragment = {
    payload: BinaryPayload
    bytes: number
    updateProps: number
    updateGroups: number
    groupedUpdateProps: number
}

export type SharedMessageFragment = {
    payload: BinaryPayload
    bytes: number
    messages: number
}

export type SharedCreateFragment = {
    payload: BinaryPayload
    bytes: number
    creates: number
    nids: Set<number>
}

export type SharedDeleteFragment = {
    payload: BinaryPayload
    bytes: number
    deletes: number
    nids: Set<number>
}

function createSnapshotPerformanceWindow(): SnapshotPerformanceWindow {
    return {
        snapshots: 0,
        sharedSnapshots: 0,
        collectTotalMs: 0,
        collectMaxMs: 0,
        countTotalMs: 0,
        countMaxMs: 0,
        writeTotalMs: 0,
        writeMaxMs: 0,
        commitTotalMs: 0,
        commitMaxMs: 0,
        sendTotalMs: 0,
        sendMaxMs: 0,
        bytesTotal: 0,
        bytesMax: 0,
        createsTotal: 0,
        updatePropsTotal: 0,
        updateGroupsTotal: 0,
        groupedUpdatePropsTotal: 0,
        deletesTotal: 0,
        messagesTotal: 0,
        messagesMax: 0,
        engineMessagesTotal: 0,
        engineMessagesMax: 0,
        responsesTotal: 0,
        responsesMax: 0,
        sharedMessageFragmentBuilds: 0,
        sharedMessageFragmentHits: 0,
        sharedMessageFragmentCountTotalMs: 0,
        sharedMessageFragmentCountMaxMs: 0,
        sharedMessageFragmentWriteTotalMs: 0,
        sharedMessageFragmentWriteMaxMs: 0,
        sharedMessageFragmentBytesTotal: 0,
        sharedMessageFragmentBytesMax: 0,
        sharedMessageFragmentCopyTotalMs: 0,
        sharedMessageFragmentCopyMaxMs: 0,
        sharedMessageFragmentCopyBytesTotal: 0,
        sharedMessageFragmentMessagesTotal: 0,
        sharedFragmentBuilds: 0,
        sharedFragmentHits: 0,
        sharedFragmentCollectTotalMs: 0,
        sharedFragmentCollectMaxMs: 0,
        sharedFragmentCountTotalMs: 0,
        sharedFragmentCountMaxMs: 0,
        sharedFragmentWriteTotalMs: 0,
        sharedFragmentWriteMaxMs: 0,
        sharedFragmentBytesTotal: 0,
        sharedFragmentBytesMax: 0,
        sharedFragmentCopyTotalMs: 0,
        sharedFragmentCopyMaxMs: 0,
        sharedFragmentCopyBytesTotal: 0
    }
}

function countStringBytes(value: string) {
    return binaryGet(Binary.String).byteSize(value)
}

function errorPayload(code: string, message: string) {
    return { code, message }
}

function serializeConnectionError(err: any) {
    if (err instanceof Error) {
        return JSON.stringify({
            name: err.name,
            message: err.message
        })
    }
    return JSON.stringify(err)
}

export class InstanceNetwork {
    instance: Instance
    responseBacklogUsers = new Set<User>()
    requireSchemaFingerprint = false
    debugBinaryWrites = false
    sharedUpdateFragmentsEnabled = false
    sharedUpdateFragments: Map<string, SharedSnapshotFragment> = new Map()
    sharedCreateFragments: Map<string, SharedCreateFragment> = new Map()
    sharedDeleteFragments: Map<string, SharedDeleteFragment> = new Map()
    sharedMessageFragments: Map<string, SharedMessageFragment> = new Map()
    /**
     * Disabled by default because each sample takes several high-resolution
     * clock reads per user. The fields intentionally mirror the snapshot
     * pipeline so stress tests can tell whether time is going to visibility
     * and plan collection, exact byte counting, binary writing, commit work,
     * or the adapter send call.
     */
    snapshotPerformanceEnabled = false
    snapshotPerformance = createSnapshotPerformanceWindow()
    onResponseBacklog: (info: ResponseBacklogInfo) => void = (info: ResponseBacklogInfo) => {
        console.warn(
            `nengi response backlog: ${info.remaining} responses remain queued for user ${info.user.id} after sending ${info.sent} of ${info.queued} on server tick ${info.tick}.`
        )
    }

    constructor(instance: Instance) {
        this.instance = instance
    }

    onRequest() {
        // TODO
    }

    recordSnapshotPerformance(sample: SnapshotPerformanceSample) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.snapshots++
        metrics.collectTotalMs += sample.collectMs
        metrics.collectMaxMs = Math.max(metrics.collectMaxMs, sample.collectMs)
        metrics.countTotalMs += sample.countMs
        metrics.countMaxMs = Math.max(metrics.countMaxMs, sample.countMs)
        metrics.writeTotalMs += sample.writeMs
        metrics.writeMaxMs = Math.max(metrics.writeMaxMs, sample.writeMs)
        metrics.commitTotalMs += sample.commitMs
        metrics.commitMaxMs = Math.max(metrics.commitMaxMs, sample.commitMs)
        metrics.sendTotalMs += sample.sendMs
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sample.sendMs)
        metrics.bytesTotal += sample.bytes
        metrics.bytesMax = Math.max(metrics.bytesMax, sample.bytes)
        metrics.createsTotal += sample.creates
        metrics.updatePropsTotal += sample.updateProps
        metrics.updateGroupsTotal += sample.updateGroups
        metrics.groupedUpdatePropsTotal += sample.groupedUpdateProps
        metrics.deletesTotal += sample.deletes
        metrics.messagesTotal += sample.messages
        metrics.messagesMax = Math.max(metrics.messagesMax, sample.messages)
        metrics.engineMessagesTotal += sample.engineMessages
        metrics.engineMessagesMax = Math.max(metrics.engineMessagesMax, sample.engineMessages)
        metrics.responsesTotal += sample.responses
        metrics.responsesMax = Math.max(metrics.responsesMax, sample.responses)
    }

    recordSharedSnapshot() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedSnapshots++
    }

    recordSharedFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedFragmentHits++
    }

    recordSharedFragmentBuild(sample: {
        collectMs: number
        countMs: number
        writeMs: number
        bytes: number
    }) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedFragmentBuilds++
        metrics.sharedFragmentCollectTotalMs += sample.collectMs
        metrics.sharedFragmentCollectMaxMs = Math.max(metrics.sharedFragmentCollectMaxMs, sample.collectMs)
        metrics.sharedFragmentCountTotalMs += sample.countMs
        metrics.sharedFragmentCountMaxMs = Math.max(metrics.sharedFragmentCountMaxMs, sample.countMs)
        metrics.sharedFragmentWriteTotalMs += sample.writeMs
        metrics.sharedFragmentWriteMaxMs = Math.max(metrics.sharedFragmentWriteMaxMs, sample.writeMs)
        metrics.sharedFragmentBytesTotal += sample.bytes
        metrics.sharedFragmentBytesMax = Math.max(metrics.sharedFragmentBytesMax, sample.bytes)
    }

    recordSharedFragmentCopy(copyMs: number, bytes: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedFragmentCopyTotalMs += copyMs
        metrics.sharedFragmentCopyMaxMs = Math.max(metrics.sharedFragmentCopyMaxMs, copyMs)
        metrics.sharedFragmentCopyBytesTotal += bytes
    }

    recordSharedMessageFragmentHit() {
        if (!this.snapshotPerformanceEnabled) {
            return
        }
        this.snapshotPerformance.sharedMessageFragmentHits++
    }

    recordSharedMessageFragmentBuild(sample: {
        countMs: number
        writeMs: number
        bytes: number
        messages: number
    }) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedMessageFragmentBuilds++
        metrics.sharedMessageFragmentCountTotalMs += sample.countMs
        metrics.sharedMessageFragmentCountMaxMs = Math.max(metrics.sharedMessageFragmentCountMaxMs, sample.countMs)
        metrics.sharedMessageFragmentWriteTotalMs += sample.writeMs
        metrics.sharedMessageFragmentWriteMaxMs = Math.max(metrics.sharedMessageFragmentWriteMaxMs, sample.writeMs)
        metrics.sharedMessageFragmentBytesTotal += sample.bytes
        metrics.sharedMessageFragmentBytesMax = Math.max(metrics.sharedMessageFragmentBytesMax, sample.bytes)
        metrics.sharedMessageFragmentMessagesTotal += sample.messages
    }

    recordSharedMessageFragmentCopy(copyMs: number, bytes: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sharedMessageFragmentCopyTotalMs += copyMs
        metrics.sharedMessageFragmentCopyMaxMs = Math.max(metrics.sharedMessageFragmentCopyMaxMs, copyMs)
        metrics.sharedMessageFragmentCopyBytesTotal += bytes
    }

    recordSnapshotSend(sendMs: number) {
        if (!this.snapshotPerformanceEnabled) {
            return
        }

        const metrics = this.snapshotPerformance
        metrics.sendTotalMs += sendMs
        metrics.sendMaxMs = Math.max(metrics.sendMaxMs, sendMs)
    }

    resetSnapshotPerformance() {
        this.snapshotPerformance = createSnapshotPerformanceWindow()
    }

    resetSharedUpdateFragments() {
        this.sharedUpdateFragments.clear()
        this.sharedCreateFragments.clear()
        this.sharedDeleteFragments.clear()
        this.sharedMessageFragments.clear()
    }

    getProtocol(): ProtocolConfig {
        return {
            nidType: this.instance.localState.nidType,
            ntypeType: this.instance.context.ntypeType
        }
    }

    createProtocolEngineMessage() {
        const protocol = this.getProtocol()
        return {
            ntype: EngineMessage.Protocol,
            nidType: protocol.nidType,
            ntypeType: protocol.ntypeType
        }
    }

    queueProtocolIfChanged(user: User) {
        const protocol = this.getProtocol()
        if (user.protocol.nidType !== protocol.nidType || user.protocol.ntypeType !== protocol.ntypeType) {
            user.queueEngineMessage(this.createProtocolEngineMessage())
            user.protocol = { ...protocol }
        }
    }

    queueResponse(user: User, requestId: number, endpoint: ResponseEndpoint, response: any) {
        user.responseQueue.push({
            requestId,
            status: ResponseStatus.Ok,
            payload: createEndpointPayload(response, endpoint.endpoint?.responseSchema)
        })
    }

    queueErrorResponse(user: User, requestId: number, code: string, message: string) {
        user.responseQueue.push({
            requestId,
            status: ResponseStatus.Error,
            payload: createEndpointPayload(errorPayload(code, message))
        })
    }

    reportResponseBacklog(user: User, queued: number, sent: number) {
        const remaining = user.responseQueue.length
        if (remaining === 0) {
            this.responseBacklogUsers.delete(user)
            return
        }
        if (!this.responseBacklogUsers.has(user)) {
            this.responseBacklogUsers.add(user)
            this.onResponseBacklog({
                user,
                queued,
                sent,
                remaining,
                tick: this.instance.tick
            })
        }
    }

    runRequestHandler(user: User, requestId: number, endpoint: ResponseEndpoint, body: any) {
        let sent = false
        const send = (response: any) => {
            if (sent) {
                return
            }
            sent = true
            this.queueResponse(user, requestId, endpoint, response)
        }

        try {
            const result = endpoint.callback({ user, body }, send)
            if (result && typeof (result as Promise<any>).then === 'function') {
                ;(result as Promise<any>)
                    .then(response => {
                        if (response !== undefined) {
                            send(response)
                        }
                    })
                    .catch(err => {
                        if (!sent) {
                            this.queueErrorResponse(user, requestId, 'HANDLER_REJECTED', 'Request handler rejected.')
                        }
                    })
            } else if (result !== undefined) {
                send(result)
            }
        } catch (err) {
            if (!sent) {
                this.queueErrorResponse(user, requestId, 'HANDLER_ERROR', 'Request handler errored.')
            }
        }
    }

    onOpen(user: User) {
        user.connectionState = UserConnectionState.OpenPreHandshake
        user.network = this
    }

    async onHandshake(user: User, handshake: any, clientSchemaFingerprint = '') {
        try {
            user.connectionState = UserConnectionState.OpenAwaitingHandshake
            if (this.requireSchemaFingerprint) {
                const serverSchemaFingerprint = createSchemaFingerprint(this.instance.context)
                if (!clientSchemaFingerprint) {
                    throw new Error(`Schema fingerprint required. Server fingerprint ${serverSchemaFingerprint}.`)
                }
                if (clientSchemaFingerprint !== serverSchemaFingerprint) {
                    throw new Error(`Schema fingerprint mismatch. Client ${clientSchemaFingerprint}, server ${serverSchemaFingerprint}.`)
                }
            }

            const connectionAccepted = await this.instance.onConnect(handshake)

            if (connectionAccepted === false) {
                throw new Error('Connection denied.')
            }

            // @ts-ignore typescript is wrong that connectionState does not change, it changes during the await
            if (user.connectionState === UserConnectionState.Closed) {
                throw new Error('Connection closed before handshake completed.')
            }

            user.connectionState = UserConnectionState.Open

            // allow
            const protocolMessage = this.createProtocolEngineMessage()
            const protocolSchema = this.instance.context.getEngineSchema(protocolMessage.ntype)!
            const bw = user.networkAdapter.binary.createWriter(3 + countMessage(protocolSchema, protocolMessage))
            bw.writeUInt8(BinarySection.EngineMessages)
            bw.writeUInt8(2)
            bw.writeUInt8(EngineMessage.ConnectionAccepted)
            writeMessage(protocolMessage, protocolSchema, bw)

            user.send(bw.payload)
            user.instance = this.instance
            user.protocol = { ...this.getProtocol() }
            this.onConnectionAccepted(user, connectionAccepted)
        } catch (err: any) {
            this.onConnectionDenied(user, err)

            // NOTE: we are keeping the code between these cases duplicated
            // if these do turn out to be identical in production we will clean it up
            // but for now I am suspicious that there will be different logic
            // in each of these later

            if (user.connectionState === UserConnectionState.OpenAwaitingHandshake) {
                // developer's code decided to reject this connection (rejected promise)
                const jsonErr = serializeConnectionError(err)
                const denyReasonByteLength = countStringBytes(jsonErr)

                // deny and send reason
                const bw = user.networkAdapter.binary.createWriter(3 + denyReasonByteLength)
                bw.writeUInt8(BinarySection.EngineMessages)
                bw.writeUInt8(1)
                bw.writeUInt8(EngineMessage.ConnectionDenied)
                bw.writeString(jsonErr)
                user.send(bw.payload)
            }

            if (user.connectionState === UserConnectionState.Open) {
                // a loss of connection after handshake is complete
                const jsonErr = serializeConnectionError(err)
                const denyReasonByteLength = countStringBytes(jsonErr)

                // deny and send reason
                const bw = user.networkAdapter.binary.createWriter(3 + denyReasonByteLength)
                bw.writeUInt8(BinarySection.EngineMessages)
                bw.writeUInt8(1)
                bw.writeUInt8(EngineMessage.ConnectionDenied)
                bw.writeString(jsonErr)
                user.send(bw.payload)
            }
        }
    }

    onMessage(user: User, buffer: BinaryPayload) {

        try {
            const serverReceivedTimeMs = performance.now()
            const binaryReader = user.networkAdapter.binary.createReader(buffer)
            const commands: any[] = []
            const commandTimingInputs: CommandTimingInput[] = []

            const commandSet = {
                type: NetworkEvent.CommandSet,
                user,
                commands,
                clientTick: -1,
                commandTimings: [] as Array<CommandTimingEstimate | undefined>,
                serverReceivedTimeMs
            }

            while (binaryReader.offset < binaryReader.byteLength) {
                const section = binaryReader.readUInt8()

                switch (section) {
                case BinarySection.EngineMessages: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const msg: any = readEngineMessage(binaryReader, this.instance.context)

                        if (msg.ntype === EngineMessage.ConnectionAttempt) {
                            const handshake = JSON.parse(msg.handshake)
                            this.onHandshake(user, handshake, msg.schemaFingerprint || '')
                        }

                        if (msg.ntype === EngineMessage.ClientTick) {
                            const clientTick = msg.tick
                            user.lastReceivedClientTick = clientTick
                            commandSet.clientTick = clientTick
                        }

                        if (msg.ntype === EngineMessage.Pong) {
                            user.recordClockSyncPong({
                                pingId: msg.pingId,
                                serverTimeMs: msg.serverTimeMs,
                                clientReceiveTimeMs: msg.clientReceiveTimeMs,
                                clientSendTimeMs: msg.clientSendTimeMs
                            }, serverReceivedTimeMs)
                        }

                        if (msg.ntype === EngineMessage.CommandTiming) {
                            commandTimingInputs.push({
                                commandIndex: msg.commandIndex,
                                clientTimeMs: msg.clientTimeMs,
                                renderDelayMs: msg.renderDelayMs,
                                viewTick: msg.viewTick,
                                viewServerTimeMs: msg.viewServerTimeMs
                            })
                        }

                        if (msg.ntype === EngineMessage.InterpolationDelay) {
                            user.recordInterpolationDelay(msg.delayMs, serverReceivedTimeMs)
                        }
                    }

                    break
                }
                case BinarySection.Commands: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const msg = readMessage(binaryReader, this.instance.context, this.instance.context.ntypeType)
                        commands.push(msg)
                    }
                    break
                }
                case BinarySection.Requests: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const requestId = binaryReader.readUInt32()
                        const endpoint = binaryReader.readUInt32()
                        const payloadByteLength = binaryReader.readUInt32()
                        const responseEndpoint = this.instance.responseEndPoints.get(endpoint)
                        if (!responseEndpoint) {
                            skipEndpointPayload(binaryReader, payloadByteLength)
                            this.queueErrorResponse(user, requestId, 'NO_ENDPOINT', 'No response handler is registered for this endpoint.')
                        } else {
                            const body = readSizedEndpointPayload(binaryReader, payloadByteLength, responseEndpoint.endpoint?.requestSchema)
                            this.runRequestHandler(user, requestId, responseEndpoint, body)
                        }
                    }
                    break
                }
                default: {
                    console.log('network hit default case while reading')
                    break
                }
                }
            }

            for (let i = 0; i < commandTimingInputs.length; i++) {
                const input = commandTimingInputs[i]
                if (input.commandIndex >= 0 && input.commandIndex < commands.length) {
                    commandSet.commandTimings[input.commandIndex] = user.estimateCommandTiming(input, serverReceivedTimeMs)
                }
            }
            this.instance.queue.enqueue(commandSet)
        } catch (err) {
            // TODO there should be a way for a user to capture this error, perhaps a handler
            //console.log('on message err triggered', err)
            try {
                user.networkAdapter.disconnect(user, {})
            } catch (err2) {
                // TODO this is only in the case of an error while disconnecting
                // can these really occur?
            }
        }

    }

    onConnectionAccepted(user: User, payload: any) {
        user.network = this
        user.id = ++this.instance.incrementalUserId
        this.instance.users.set(user.id, user)

        this.instance.queue.enqueue({
            type: NetworkEvent.UserConnected,
            user,
            payload
        })
    }

    onConnectionDenied(user: User, payload: any) {
        this.instance.queue.enqueue({
            type: NetworkEvent.UserConnectionDenied,
            user,
            payload
        })
    }

    onClose(user: User) {
        this.responseBacklogUsers.delete(user)
        if (user.connectionState === UserConnectionState.Open) {
            this.instance.queue.enqueue({
                type: NetworkEvent.UserDisconnected,
                user,
            })
            this.instance.users.delete(user.id)
        }
        user.connectionState = UserConnectionState.Closed
    }
}
