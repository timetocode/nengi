import { User } from '../../server/User'
import { Instance } from '../../server/Instance'
import count from '../message/count'
import countDiff from '../entity/countDiff'
import { BinarySection } from '../../common/binary/BinarySection'
import { writeMessage } from '../message/writeMessage'
import writeDiff from '../entity/writeDiff'
import { binaryGet } from '../../common/binary/BinaryExt'
import { Binary } from '../../common/binary/Binary'

const getVisibleState = (user: User, instance: Instance) => {
    const vis = user.checkVisibility(instance.tick)

    const createEntities: any = []

    for (let i = 0; i < vis.newlyVisible.length; i++) {
        const nid = vis.newlyVisible[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)!
        if (nschema) {
            if (!instance.cache.cacheContains(nid)) {
                instance.cache.cacheify(instance.tick, entity, nschema)
            }
            createEntities.push(entity)
        } else {
            throw new Error(`Entity [nid ${nid}] [ntype ${entity.ntype}] is missing a network schema.`)
        }
    }

    const engineMessages = user.engineMessageQueue
    user.engineMessageQueue = []

    const messages = user.messageQueue
    // empty the queue
    user.messageQueue = []

    const deleteEntities: number[] = vis.noLongerVisible

    const updateEntities: any = []
    //console.log('stillVisible', vis.stillVisible.length)
    for (let i = 0; i < vis.stillVisible.length; i++) {
        const nid = vis.stillVisible[i]
        const entity = instance.localState.getByNid(nid)
        const nschema = instance.context.getSchema(entity.ntype)
        if (nschema) {
            const diffs = instance.cache.getAndDiff(instance.tick, entity, nschema)
            diffs.forEach(diff => {
                updateEntities.push(diff)
            })

        }
    }
    //console.log('getVisibleState', instance.tick, createEntities.length, updateEntities.length, deleteEntities.length)
    return {
        createEntities,
        updateEntities,
        deleteEntities,
        messages,
        engineMessages
    }
}

const createSnapshotBufferRefactor = (user: User, instance: Instance) => {
    let bytes = 0

    const {
        createEntities, updateEntities, deleteEntities, messages, engineMessages
    } = getVisibleState(user, instance)


    if (engineMessages.length > 0) {
        bytes += 1 // section BinarySection.EngineMessages
        bytes += 1 // quantity of engine messages
        for (let i = 0; i < engineMessages.length; i++) {
            const engineMessage = engineMessages[i]
            const nschema = instance.context.getEngineSchema(engineMessage.ntype)!
            //console.log('counting', message, nschema)
            bytes += count(nschema, engineMessage)
        }
    }

    if (messages.length > 0) {
        bytes += 1 // section BinarySection.Messages
        bytes += 4 // quantity of messages
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]
            const nschema = instance.context.getSchema(message.ntype)!
            //console.log('counting', message, nschema)
            bytes += count(nschema, message)
        }
    }

    if (user.responseQueue.length > 0) {
        bytes += 1
        bytes += 4

        for (let i = 0; i < user.responseQueue.length; i++) {
            bytes += 4 // requestId
            // @ts-ignore
            bytes += binaryGet(Binary.String).byteSize(user.responseQueue[i].response)
        }
    }

    if (createEntities.length > 0) {
        // section create
        bytes += 1
        bytes += 4

        for (let i = 0; i < createEntities.length; i++) {
            const nid = createEntities[i].nid
            const entity = instance.localState.getByNid(nid)
            const nschema = instance.context.getSchema(entity.ntype)!
            bytes += count(nschema, entity)
        }
    }

    if (updateEntities.length > 0) {
        // section update
        bytes += 1
        bytes += 4

        for (let i = 0; i < updateEntities.length; i++) {
            const diff = updateEntities[i]
            bytes += countDiff(diff, diff.nschema)
        }
    }

    if (deleteEntities.length > 0) {
        bytes += 1 // delete entities
        bytes += 4 // quantity of entities to delete
        for (let i = 0; i < deleteEntities.length; i++) {
            bytes += 4
        }
    }

    const bw = user.networkAdapter.createBufferWriter(bytes)

    if (engineMessages.length > 0) {
        bw.writeUInt8(BinarySection.EngineMessages)
        bw.writeUInt8(engineMessages.length)
        for (let i = 0; i < engineMessages.length; i++) {
            const engineMessage = engineMessages[i]
            const nschema = instance.context.getEngineSchema(engineMessage.ntype)!
            writeMessage(engineMessage, nschema, bw)
        }
    }

    if (messages.length > 0) {
        bw.writeUInt8(BinarySection.Messages)
        bw.writeUInt32(messages.length)
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i]
            const nschema = instance.context.getSchema(message.ntype)!
            writeMessage(message, nschema, bw)
        }
    }

    if (user.responseQueue.length > 0) {
        bw.writeUInt8(BinarySection.Responses)
        bw.writeUInt32(user.responseQueue.length)

        for (let i = 0; i < user.responseQueue.length; i++) {
            bw.writeUInt32(user.responseQueue[i].requestId)
            bw.writeString(user.responseQueue[i].response)
        }
    }

    if (createEntities.length > 0) {
        bw.writeUInt8(BinarySection.CreateEntities)
        bw.writeUInt32(createEntities.length)

        for (let i = 0; i < createEntities.length; i++) {
            const entity = createEntities[i]
            const nschema = instance.context.getSchema(entity.ntype)!
            writeMessage(entity, nschema, bw)
        }
    }

    if (updateEntities.length > 0) {
        bw.writeUInt8(BinarySection.UpdateEntities)
        bw.writeUInt32(updateEntities.length)

        //console.log('updates', updateEntities.length)

        for (let i = 0; i < updateEntities.length; i++) {
            const diff = updateEntities[i]
            writeDiff(diff.nid, diff, diff.nschema, bw)
        }
    }

    if (deleteEntities.length > 0) {
        bw.writeUInt8(BinarySection.DeleteEntities)
        bw.writeUInt32(deleteEntities.length)
        for (let i = 0; i < deleteEntities.length; i++) {
            bw.writeUInt32(deleteEntities[i])
        }
    }

    user.responseQueue = []
    return bw.buffer
}

export default createSnapshotBufferRefactor