export type ClientConnectionState = 'idle' | 'connecting' | 'connected' | 'closed'

export type ClientConnectionCode =
    | 'INVALID_STATE'
    | 'CONNECT_TIMEOUT'
    | 'SERVER_TIMEOUT'
    | 'CANCELLED'
    | 'CONNECTION_DENIED'
    | 'LOCAL_DISCONNECT'
    | 'REMOTE_CLOSE'
    | 'PROTOCOL_ERROR'
    | 'TRANSPORT_ERROR'

export type ClientDisconnectInfo = {
    code: ClientConnectionCode
    /** Local diagnostic data. It is never serialized as a WebSocket close reason. */
    detail?: unknown
    cause?: unknown
}

export class ClientConnectionError extends Error implements ClientDisconnectInfo {
    readonly code: ClientConnectionCode
    readonly detail?: unknown
    readonly cause?: unknown

    constructor(code: ClientConnectionCode, message: string, options: { detail?: unknown, cause?: unknown } = {}) {
        super(message)
        this.name = 'ClientConnectionError'
        this.code = code
        this.detail = options.detail
        this.cause = options.cause
    }
}

export type ClientConnectOptions = {
    /** Cancels this attempt only; no longer governs the session after acceptance. */
    signal?: AbortSignal
}

export function connectionTimeout(value: number | null | undefined, fallback: number, name: string) {
    if (value === null) return null
    const timeout = value ?? fallback
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
        throw new RangeError(`${name} must be a positive finite duration <= 2147483647 ms, or null.`)
    }
    return timeout
}
