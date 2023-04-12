import { Instance } from './Instance'
import { NetworkEvent } from '../common/binary/NetworkEvent'
import { User, UserConnectionState } from './User'
import { BinarySection } from '../common/binary/BinarySection'
import { EngineMessage } from '../common/EngineMessage'
import readEngineMessage from '../binary/message/readEngineMessage'
import readMessage from '../binary/message/readMessage'

interface INetworkEvent {
    type: NetworkEvent
    user: User
    command?: any
}

class InstanceNetwork {
    instance: Instance
    constructor(instance: Instance) {
        this.instance = instance
    } 

    onRequest() {
        // TODO
    }

    onOpen(user: User) {
        user.connectionState = UserConnectionState.OpenPreHandshake
        user.network = this
    }

    onCommand(user: User, command: any) {
        this.instance.queue.enqueue({
            type: NetworkEvent.Command,
            user,
            command
        })
    }

    async onHandshake(user: User, handshake: any) {
        try {
            user.connectionState = UserConnectionState.OpenAwaitingHandshake
            const connectionAccepted = await this.instance.onConnect(handshake)

            // @ts-ignore ts is wrong that this is always false; the value can change during the
            // above await
            if (user.connectionState === UserConnectionState.Closed) {
                throw new Error('Connection closed before handshake completed.')
            }

            user.connectionState = UserConnectionState.Open

            // allow
            const bw = user.networkAdapter.createBufferWriter(3)
            bw.writeUInt8(BinarySection.EngineMessages)
            bw.writeUInt8(1)
            bw.writeUInt8(EngineMessage.ConnectionAccepted)

            user.send(bw.buffer)
            user.instance = this.instance
            this.onConnectionAccepted(user, connectionAccepted)
        } catch (err: any) {
            //console.log('Handshake catch block', { err, ws: user.socket, foo: user.connectionState })
            this.onConnectionDenied(user, err)

            // NOTE: we are keeping the code between these cases duplicated
            // if these do turn out to be identical in production we will clean it up
            // but for now I am suspicious that there will be different logic
            // in each of these later

            if (user.connectionState === UserConnectionState.OpenAwaitingHandshake) {
                // developer's code decided to reject this connection (rejected promise)
                const jsonErr = JSON.stringify(err)
                const denyReasonByteLength = Buffer.byteLength(jsonErr, 'utf8')

                // deny and send reason
                const bw = user.networkAdapter.createBufferWriter(3 + 4 /* string length 32 bits */ + denyReasonByteLength /* length of actual string*/)
                //binaryWriterCtor.create(3 + 4 /* string length 32 bits */ + denyReasonByteLength /* length of actual string*/)
                bw.writeUInt8(BinarySection.EngineMessages)
                bw.writeUInt8(1)
                bw.writeUInt8(EngineMessage.ConnectionDenied)
                bw.writeString(jsonErr)
                user.send(bw.buffer)
            }
            
            if (user.connectionState === UserConnectionState.Open) {
                // a loss of connection after handshake is complete
                const jsonErr = JSON.stringify(err)
                const denyReasonByteLength = Buffer.byteLength(jsonErr, 'utf8')

                // deny and send reason
                // @ts-ignore
                const bw = user.networkAdapter.createBufferWriter(3 + 4 /* string length 32 bits */ + denyReasonByteLength /* length of actual string*/)
                bw.writeUInt8(BinarySection.EngineMessages)
                bw.writeUInt8(1)
                bw.writeUInt8(EngineMessage.ConnectionDenied)
                bw.writeString(jsonErr)
                user.send(bw.buffer)
            }
        }
    }

    onMessage(user: User, buffer: Buffer | ArrayBuffer) {
        const binaryReader = user.networkAdapter.createBufferReader(buffer)
        while (binaryReader.offset < binaryReader.byteLength) {
            const section = binaryReader.readUInt8()

            switch (section) {
                case BinarySection.EngineMessages: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const type = binaryReader.readUInt8()
                        if (type === EngineMessage.ConnectionAttempt) {
                            const msg:any = readEngineMessage(binaryReader, this.instance.context)
                            const handshake = JSON.parse(msg.handshake)
                            this.onHandshake(user, handshake)
                        }
                    }
                    break
                }
                case BinarySection.Commands: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const msg = readMessage(binaryReader, this.instance.context)
                        this.onCommand(user, msg)
                    }
                    break
                }
                case BinarySection.Requests: {
                    const count = binaryReader.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const requestId = binaryReader.readUInt32()
                        const endpoint = binaryReader.readUInt32()
                        const str = binaryReader.readString()
                        const body = JSON.parse(str)
                        const cb = this.instance.responseEndPoints.get(endpoint)
                        if (cb) {
                            cb({ user, body }, (response: any) => {
                                console.log('supposed to response with', response)
                                user.responseQueue.push({
                                    requestId,
                                    response: JSON.stringify(response)
                                })
                            })
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

export { InstanceNetwork, INetworkEvent }
