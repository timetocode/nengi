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
        const spec = binaryGet(propData.type)
        bytes += spec.byteSize(value[propData.prop])
    }
    return bytes
}

function writeSchemaPayload(schema: Schema, value: any, writer: IBinaryWriter) {
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i]
        const spec = binaryGet(propData.type)
        spec.write(value[propData.prop], writer)
    }
}

function readSchemaPayload(schema: Schema, reader: IBinaryReader) {
    const value: any = {}
    for (let i = 0; i < schema.keys.length; i++) {
        const propData = schema.keys[i]
        const spec = binaryGet(propData.type)
        value[propData.prop] = spec.post(spec.read(reader))
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

function readSizedEndpointPayload(reader: IBinaryReader, byteLength: number, schema?: Schema) {
    const startOffset = reader.offset
    const value = readEndpointPayload(reader, schema)
    reader.offset = startOffset + byteLength
    return value
}

function skipEndpointPayload(reader: IBinaryReader, byteLength: number) {
    reader.offset += byteLength
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
