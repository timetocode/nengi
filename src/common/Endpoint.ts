import { Schema } from './binary/schema/Schema'

type EndpointOptions = {
    requestSchema?: Schema,
    responseSchema?: Schema,
    name?: string
}

type EndpointDefinition<Request = any, Response = any> = EndpointOptions & {
    id: number
    __requestType?: Request
    __responseType?: Response
}

type Endpoint<Request = any, Response = any> = number | EndpointDefinition<Request, Response>

const MAX_UINT32 = 0xffffffff

function isValidUInt32(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_UINT32
}

function assertValidEndpointId(id: number) {
    if (!isValidUInt32(id) || id === 0) {
        throw new Error(`Endpoint id must be an integer from 1 to ${MAX_UINT32}.`)
    }
}

enum ResponseStatus {
    Ok = 1,
    Error = 2
}

enum RequestPolicy {
    Allow = 1,
    Dedupe = 2,
    Replace = 3
}

class RequestError extends Error {
    code: string
    requestId?: number
    endpointId?: number
    payload?: any

    constructor(message: string, code: string, options: {
        requestId?: number,
        endpointId?: number,
        payload?: any
    } = {}) {
        super(message)
        this.name = 'RequestError'
        this.code = code
        this.requestId = options.requestId
        this.endpointId = options.endpointId
        this.payload = options.payload
    }
}

function defineEndpoint<Request = any, Response = any>(
    id: number,
    options: EndpointOptions = {}
): EndpointDefinition<Request, Response> {
    assertValidEndpointId(id)
    return {
        id,
        ...options
    }
}

function getEndpointId(endpoint: Endpoint): number {
    const id = typeof endpoint === 'number' ? endpoint : endpoint.id
    assertValidEndpointId(id)
    return id
}

function getEndpointDefinition<Request = any, Response = any>(
    endpoint: Endpoint<Request, Response>
): EndpointDefinition<Request, Response> | null {
    return typeof endpoint === 'number' ? null : endpoint
}

export {
    Endpoint,
    EndpointDefinition,
    EndpointOptions,
    MAX_UINT32,
    RequestError,
    RequestPolicy,
    ResponseStatus,
    assertValidEndpointId,
    defineEndpoint,
    getEndpointDefinition,
    getEndpointId,
    isValidUInt32
}
