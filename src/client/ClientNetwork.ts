import IEntity from '../common/IEntity'
import NQueue from '../NQueue'
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

class ClientNetwork {
    client: Client
    entities: Map<number, IEntity>
    snapshots: Snapshot[]
    outbound: NQueue<any> // TODO a type
    messages: any[]
    socket: WebSocket | null
    requestId: number
    requestQueue: NQueue<any>
    requests: Map<number, any>

    constructor(client: Client) {
        this.client = client
        this.entities = new Map()
        this.snapshots = []
        this.messages = []
        this.outbound = new NQueue()
        this.socket = null
        this.requestId = 1
        this.requestQueue = new NQueue()
        this.requests = new Map()
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
        dw.writeUInt8(EngineMessage.ConnectionAttempt)
        writeMessage(handshakeMessage, connectionAttemptSchema, dw)
        return dw.buffer
    }

    createOutboundBuffer(binaryWriterCtor: IBinaryWriterClass) {
        let bytes = 0
        bytes += 1 // commands!
        bytes += 1 // number of commands

        this.outbound.arr.forEach((command: any) => {
            bytes += count(this.client.context.getSchema(command.ntype)!, command)
        })

        bytes += 1 // requests
        bytes += 1 // number of requests
        this.requestQueue.arr.forEach((request: any) => {
            bytes += 12 + request.body.length
        })

        // @ts-ignore
        const dw = binaryWriterCtor.create(bytes)

        dw.writeUInt8(BinarySection.Commands)
        dw.writeUInt8(this.outbound.arr.length)

        this.outbound.arr.forEach((command: any) => {
            writeMessage(command, this.client.context.getSchema(command.ntype)!, dw)
        })

        this.outbound.arr = []

        dw.writeUInt8(BinarySection.Requests)
        dw.writeUInt8(this.requestQueue.arr.length)

        this.requestQueue.arr.forEach((request: any) => {
            dw.writeUInt32(request.requestId)
            dw.writeUInt32(request.endpoint)
            dw.writeString(request.body)
        })

        this.requestQueue.arr = []

        return dw.buffer
    }

    readSnapshot(dr: IBinaryReader) {
        const snapshot: Snapshot = {
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
        this.snapshots.push(snapshot)
    }

}

export { ClientNetwork }