import { Instance } from './Instance'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { User, UserConnectionState } from './User'
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

export interface INetworkEvent {
    type: NetworkEvent
    user: User
    commands?: any
    clientTick?: number
}

export type ResponseBacklogInfo = {
    user: User
    queued: number
    sent: number
    remaining: number
    tick: number
}

function countStringBytes(value: string) {
    return binaryGet(Binary.String).byteSize(value)
}

function errorPayload(code: string, message: string) {
    return { code, message }
}

export class InstanceNetwork {
    instance: Instance
    responseBacklogUsers = new Set<User>()
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

    async onHandshake(user: User, handshake: any) {
        try {
            user.connectionState = UserConnectionState.OpenAwaitingHandshake
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
                const jsonErr = JSON.stringify(err)
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
                const jsonErr = JSON.stringify(err)
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
            const binaryReader = user.networkAdapter.binary.createReader(buffer)
            const commands: any[] = []

            const commandSet = {
                type: NetworkEvent.CommandSet,
                user,
                commands,
                clientTick: -1
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
                            this.onHandshake(user, handshake)
                        }

                        if (msg.ntype === EngineMessage.ClientTick) {
                            const clientTick = msg.tick
                            user.lastReceivedClientTick = clientTick
                            commandSet.clientTick = clientTick
                        }

                        if (msg.ntype === EngineMessage.Pong) {
                            user.calculateLatency()
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
