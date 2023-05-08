import { IEntity } from '../common/IEntity'
import { NQueue } from '../NQueue'
import { Client } from './Client'
import { Snapshot } from './Snapshot'
import { writeMessage } from '../binary/message/writeMessage'
import { connectionAttemptSchema } from '../common/schemas/connectAttemptSchema'
import readMessage from '../binary/message/readMessage'
import readEntity from '../binary/entity/readEntity'
import readDiff from '../binary/entity/readDiff'
import { IBinaryWriter, IBinaryWriterClass } from '../common/binary/IBinaryWriter'
import { IBinaryReader } from '../common/binary/IBinaryReader'
import { EngineMessage } from '../common/EngineMessage'
import { BinarySection } from '../common/binary/BinarySection'
import count from '../binary/message/count'
import readEngineMessage from '../binary/message/readEngineMessage'
import { Chronus } from './Chronus'

class ClientNetwork {
    client: Client
    entities: Map<number, IEntity>
    snapshots: Snapshot[]
    outboundEngine: NQueue<any>
    outbound: NQueue<any> // TODO a type
    messages: any[]
    predictionErrorFrames: any[]
    socket: WebSocket | null
    requestId: number
    requestQueue: NQueue<any>
    requests: Map<number, any>
    clientTick: number
    previousSnapshot: Snapshot | null
    chronus: Chronus
    onDisconnect: (reason: any, event?: any) => void
    onSocketError: (event: any) => void

    constructor(client: Client) {
        this.client = client
        this.entities = new Map()
        this.snapshots = []
        this.messages = []
        this.predictionErrorFrames = []
        this.outboundEngine = new NQueue()
        this.outbound = new NQueue()
        this.socket = null
        this.requestId = 1
        this.requestQueue = new NQueue()
        this.requests = new Map()
        this.clientTick = 1
        this.previousSnapshot = null
        this.chronus = new Chronus()

        this.onDisconnect = (reason: any, event?: any) => {
            this.client.disconnectHandler(reason, event)
        }
        this.onSocketError = (event: any) => {
            this.client.websocketErrorHandler(event)
        }
    }

    incrementClientTick() {
        this.clientTick++
        if (this.clientTick > 65535) {
            this.clientTick = 1
        }
    }

    addEngineCommand(command: any) {
        this.outboundEngine.enqueue(command)
    }

    addCommand(command: any) {
        this.outbound.enqueue(command)
    }

    request(endpoint: number, payload: any, callback: (response: any) => any) {
        const obj = {
            endpoint,
            requestId: this.requestId++,
            body: JSON.stringify(payload),
            callback
        }

        //console.log(obj)
        this.requestQueue.enqueue(obj)
        this.requests.set(obj.requestId, obj)
    }

    createHandshakeBuffer(handshake: any, binaryWriterCtor: IBinaryWriterClass) {
        const handshakeMessage = {
            ntype: EngineMessage.ConnectionAttempt,
            handshake: JSON.stringify(handshake)
        }

        const handshakeByteLength = count(connectionAttemptSchema, handshakeMessage)
        // @ts-ignore
        const dw = binaryWriterCtor.create(handshakeByteLength + 3)
        dw.writeUInt8(BinarySection.EngineMessages)
        dw.writeUInt8(1)
        writeMessage(handshakeMessage, connectionAttemptSchema, dw)
        return dw.buffer
    }

    createOutboundBuffer(binaryWriterCtor: IBinaryWriterClass) {
        this.addEngineCommand({ ntype: EngineMessage.ClientTick, tick: this.clientTick })

        let bytes = 0

        // count ENGINE COMMANDS
        if (this.outboundEngine.length > 0) {
            bytes += 1 // commands!
            bytes += 1 // number of commands
            this.outboundEngine.arr.forEach((command: any) => {
                bytes += count(this.client.context.getEngineSchema(command.ntype)!, command)
            })
        }

        // count COMMANDS
        if (this.outbound.length > 0) {
            bytes += 1 // commands!
            bytes += 1 // number of commands
            this.outbound.arr.forEach((command: any) => {
                bytes += count(this.client.context.getSchema(command.ntype)!, command)
            })
        }

        // count REQUESTS
        if (this.requestQueue.length > 0) {
            bytes += 1 // requests
            bytes += 1 // number of requests
            this.requestQueue.arr.forEach((request: any) => {
                bytes += 12 + request.body.length
            })
        }

        // @ts-ignore
        const dw = binaryWriterCtor.create(bytes)

        // write ENGINE COMMANDs
        if (this.outboundEngine.length > 0) {
            dw.writeUInt8(BinarySection.EngineMessages)
            dw.writeUInt8(this.outboundEngine.arr.length)
            this.outboundEngine.arr.forEach((command: any) => {
                writeMessage(command, this.client.context.getEngineSchema(command.ntype)!, dw)
            })
            this.outboundEngine.arr = []
        }

        // write COMMANDS
        if (this.outbound.length > 0) {
            dw.writeUInt8(BinarySection.Commands)
            dw.writeUInt8(this.outbound.arr.length)
            this.outbound.arr.forEach((command: any) => {
                writeMessage(command, this.client.context.getSchema(command.ntype)!, dw)
            })
            this.outbound.arr = []
        }

        // write REQUESTS
        if (this.requestQueue.length > 0) {
            dw.writeUInt8(BinarySection.Requests)
            dw.writeUInt8(this.requestQueue.arr.length)
            this.requestQueue.arr.forEach((request: any) => {
                dw.writeUInt32(request.requestId)
                dw.writeUInt32(request.endpoint)
                dw.writeString(request.body)
            })
            this.requestQueue.arr = []
        }

        this.incrementClientTick()
        return dw.buffer
    }

    readSnapshot(dr: IBinaryReader) {
        const snapshot: Snapshot = {
            timestamp: -1,
            clientTick: -1,
            messages: [],
            createEntities: [],
            updateEntities: [],
            deleteEntities: []
        }

        while (dr.offset < dr.byteLength) {
            const section = dr.readUInt8()
            switch (section) {
                case BinarySection.EngineMessages: {
                    const count = dr.readUInt8()
                    for (let i = 0; i < count; i++) {
                        const engineMessage = readEngineMessage(dr, this.client.context)
                        //console.log(engineMessage)
                        if (engineMessage.ntype === EngineMessage.ConnectionTerminated) {
                            // @ts-ignore
                            console.log('connection terminated reason!', engineMessage.reason)
                        }
                        if (engineMessage.ntype === EngineMessage.TimeSync) {
                            // @ts-ignore
                            snapshot.timestamp = engineMessage.timestamp
                        }
                        if (engineMessage.ntype === EngineMessage.ClientTick) {
                            // @ts-ignore
                            snapshot.clientTick = engineMessage.tick
                        }
                    }
                    break
                }
                case BinarySection.Messages: {
                    const count = dr.readUInt32()
                    for (let i = 0; i < count; i++) {
                        const message = readMessage(dr, this.client.context)
                        this.messages.push(message)
                    }
                    break
                }
                case BinarySection.Responses: {
                    const count = dr.readUInt32()
                    for (let i = 0; i < count; i++) {
                        const requestId = dr.readUInt32()
                        const response = dr.readString()
                        const request = this.requests.get(requestId)
                        if (request) {
                            request.callback(response)
                            this.requests.delete(requestId)
                        }
                    }
                    break
                }
                case BinarySection.CreateEntities: {
                    const count = dr.readUInt32()
                    for (let i = 0; i < count; i++) {
                        //const entity = readEntity(dr, this.client.context)
                        const entity = readMessage(dr, this.client.context) as IEntity
                        this.entities.set(entity.nid, entity)
                        snapshot.createEntities.push(entity)
                    }
                    break
                }
                case BinarySection.UpdateEntities: {
                    const count = dr.readUInt32()
                    for (let i = 0; i < count; i++) {
                        const diff = readDiff(dr, this.client.context, this.entities)
                        snapshot.updateEntities.push(diff)
                    }
                    break
                }
                case BinarySection.DeleteEntities: {
                    const count = dr.readUInt32()
                    for (let i = 0; i < count; i++) {
                        const nid = dr.readUInt32()
                        snapshot.deleteEntities.push(nid)
                    }
                    break
                }
                default: {
                    console.log('hit unknown section while readding binary')
                    break
                }
            }
        }

        if (snapshot.timestamp !== -1) {
            this.client.network.chronus.register(snapshot.timestamp)
        } else {
            if (this.previousSnapshot) {
                snapshot.timestamp = this.previousSnapshot.timestamp + (1000 / this.client.serverTickRate)
            }
        }

        this.previousSnapshot = snapshot
        this.snapshots.push(snapshot)
    }

}

export { ClientNetwork }