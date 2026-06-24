import { Binary } from '../../common/binary/Binary'
import { binaryGet } from '../../common/binary/BinaryExt'
import { IBinaryReader } from '../../common/binary/IBinaryReader'
import { IBinaryWriter } from '../../common/binary/IBinaryWriter'
import { Schema } from '../../common/binary/schema/Schema'

type JsonEndpointPayload = {
    kind: 'json',
    value: string
}

type SchemaEndpointPayload = {
    kind: 'schema',
    schema: Schema,
    value: any
}

type EndpointPayload = JsonEndpointPayload | SchemaEndpointPayload

function stringifyPayload(value: any): string {
    const json = JSON.stringify(value)
    if (json === undefined) {
        throw new Error('Request/response payloads must be JSON serializable.')
    }
    return json
}

function countSchemaPayload(schema: Schema, value: any) {
    let bytes = 0
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i]
        bytes += propData.binary.byteSize(value[propData.prop])
    }
    return bytes
}

function writeSchemaPayload(schema: Schema, value: any, writer: IBinaryWriter) {
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i]
        propData.binary.write(value[propData.prop], writer)
    }
}

function readSchemaPayload(schema: Schema, reader: IBinaryReader) {
    const value: any = {}
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i]
        value[propData.prop] = propData.binary.post(propData.binary.read(reader))
    }
    return value
}

function createEndpointPayload(value: any, schema?: Schema): EndpointPayload {
    if (schema) {
        return {
            kind: 'schema',
            schema,
            value
        }
    }

    return {
        kind: 'json',
        value: stringifyPayload(value)
    }
}

function countEndpointPayload(payload: EndpointPayload) {
    if (payload.kind === 'json') {
        return binaryGet(Binary.String).byteSize(payload.value)
    }

    return countSchemaPayload(payload.schema, payload.value)
}

function writeEndpointPayload(payload: EndpointPayload, writer: IBinaryWriter) {
    if (payload.kind === 'json') {
        writer.writeString(payload.value)
        return
    }

    writeSchemaPayload(payload.schema, payload.value, writer)
}

function readEndpointPayload(reader: IBinaryReader, schema?: Schema) {
    if (schema) {
        return readSchemaPayload(schema, reader)
    }

    return JSON.parse(reader.readString())
}

function getEndpointPayloadEnd(reader: IBinaryReader, byteLength: number) {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
        throw new Error(`Invalid endpoint payload byte length ${byteLength}.`)
    }
    const endOffset = reader.offset + byteLength
    if (endOffset > reader.byteLength) {
        throw new Error(`Endpoint payload byte length ${byteLength} exceeds the remaining packet bytes.`)
    }
    return endOffset
}

function readSizedEndpointPayload(reader: IBinaryReader, byteLength: number, schema?: Schema) {
    const endOffset = getEndpointPayloadEnd(reader, byteLength)
    const value = readEndpointPayload(reader, schema)
    if (reader.offset !== endOffset) {
        throw new Error(`Endpoint payload consumed ${reader.offset > endOffset ? 'more' : 'fewer'} bytes than its declared byte length.`)
    }
    return value
}

function skipEndpointPayload(reader: IBinaryReader, byteLength: number) {
    reader.offset = getEndpointPayloadEnd(reader, byteLength)
}

export {
    EndpointPayload,
    countEndpointPayload,
    createEndpointPayload,
    readEndpointPayload,
    readSizedEndpointPayload,
    skipEndpointPayload,
    writeEndpointPayload
}
