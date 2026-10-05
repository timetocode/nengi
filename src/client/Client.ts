import { Context } from '../common/Context'
import { Endpoint, RequestPolicy } from '../common/Endpoint'
import { ClientNetwork } from './ClientNetwork'
import type { InterpolationDelayReportOptions, CommandTimingOptions } from './ClientNetwork'
import { Predictor } from './prediction/Predictor'
import type { PredictionOperationOptions } from './prediction/Predictor'
import type { ClientAdapterConstructor, IClientNetworkAdapter } from './adapter/IClientNetworkAdapter'
import { getMonotonicTime, TimeSource } from '../common/time'

import { BinaryPayload } from '../common/binary/BinaryAdapter'
import {
    ClientConnectionError,
    ClientConnectionState,
    ClientConnectOptions,
    ClientDisconnectInfo,
    connectionTimeout
} from './ClientConnection'

export type DisconnectHandler = (info: ClientDisconnectInfo) => void

type ConnectionAttempt = {
    deadline: number | null
    opened: boolean
    resolve: (clientData: unknown) => void
    reject: (error: ClientConnectionError) => void
    removeAbortListener?: () => void
}
export type RequestOptions<Response = any> = {
    timeoutMs?: number,
    key?: string,
    policy?: RequestPolicy,
    prediction?: PredictionOperationOptions<Response>
}

export type ClientOptions = {
    now?: TimeSource
    /** Record entity states for nengi interpolation. Default true; false keeps raw state and prediction available. */
    entityHistory?: boolean
    /** Entire opening + handshake budget. Default 10 seconds; null disables it. */
    connectTimeoutMs?: number | null
    /** Valid inbound nengi traffic budget. Default 30 seconds; null disables it. */
    serverTimeoutMs?: number | null
    /** Warn once about stalled command/state prediction confirmation. Default 2 seconds; null disables the warning. */
    predictionWarningAfterMs?: number | null
}

class Client<Adapter extends IClientNetworkAdapter = IClientNetworkAdapter> {
    readonly context: Context
    readonly network: ClientNetwork
    readonly adapter: Adapter
    /** Expected server snapshot frequency (instance.step calls per second), not render or command rate. */
    readonly serverTickRate: number
    readonly predictor: Predictor
    readonly now: TimeSource
    private disconnectHandler: DisconnectHandler
    private state: ClientConnectionState = 'idle'
    private attempt: ConnectionAttempt | null = null
    private timer: ReturnType<typeof setTimeout> | null = null
    private readonly connectTimeoutMs: number | null
    private readonly serverTimeoutMs: number | null

    constructor(context: Context, adapterCtor: ClientAdapterConstructor<Adapter>, serverTickRate: number, adapterConfig?: any, options: ClientOptions = {}) {
        this.context = context
        this.serverTickRate = serverTickRate
        this.now = options.now ?? getMonotonicTime
        this.connectTimeoutMs = connectionTimeout(options.connectTimeoutMs, 10_000, 'connectTimeoutMs')
        this.serverTimeoutMs = connectionTimeout(options.serverTimeoutMs, 30_000, 'serverTimeoutMs')
        this.predictor = new Predictor()
        this.network = new ClientNetwork(this, options.predictionWarningAfterMs, options.entityHistory)
        this.adapter = new adapterCtor(adapterConfig)
        if (this.adapter.clientAdapterVersion !== 2 ||
            typeof this.adapter.open !== 'function' ||
            typeof this.adapter.send !== 'function' ||
            typeof this.adapter.close !== 'function') {
            throw new Error('This Client requires a version 2 client transport adapter. Update core and the client adapter together.')
        }
        this.disconnectHandler = () => {}
    }

    get connectionState(): ClientConnectionState {
        return this.state
    }

    /**
     * Resolves with the server's optional JSON setup data after acceptance.
     * This does not wait for the first snapshot or a replicated player entity.
     * ClientData describes application data; it does not perform runtime validation.
     * Failed initial attempts may be retried; an established session requires a fresh Client.
     */
    connect<ClientData = unknown>(target: Parameters<Adapter['open']>[0], handshake: any = {}, options: ClientConnectOptions = {}): Promise<ClientData | undefined> {
        if (this.state !== 'idle') {
            return Promise.reject(new ClientConnectionError('INVALID_STATE', this.state === 'connecting'
                ? 'A connection attempt is already pending on this Client.'
                : 'This Client has already established a session. Create a new Client to connect again.'))
        }
        const signal = options.signal
        if (signal?.aborted) {
            return Promise.reject(new ClientConnectionError('CANCELLED', 'Connection attempt cancelled.', { detail: signal.reason }))
        }

        return new Promise<ClientData | undefined>((resolve, reject) => {
            const attempt: ConnectionAttempt = {
                deadline: this.connectTimeoutMs === null ? null : this.now() + this.connectTimeoutMs,
                opened: false,
                resolve: clientData => resolve(clientData as ClientData | undefined),
                reject
            }
            this.state = 'connecting'
            this.attempt = attempt
            if (signal) {
                const abort = () => {
                    if (this.attempt === attempt && this.state === 'connecting') {
                        this.end(new ClientConnectionError('CANCELLED', 'Connection attempt cancelled.', { detail: signal.reason }))
                    }
                }
                signal.addEventListener('abort', abort, { once: true })
                attempt.removeAbortListener = () => signal.removeEventListener('abort', abort)
            }
            this.scheduleDeadline(attempt)
            try {
                this.adapter.open(target, {
                    onOpen: () => {
                        if (!this.isCurrent(attempt) || attempt.opened) return
                        attempt.opened = true
                        let payload: BinaryPayload
                        try {
                            payload = this.network.createHandshake(handshake, this.adapter.binary)
                        } catch (cause) {
                            if (this.attempt === attempt) {
                                this.end(new ClientConnectionError('PROTOCOL_ERROR', 'Could not encode the connection handshake.', { cause }))
                            }
                            return
                        }
                        if (this.isCurrent(attempt)) this.send(attempt, payload)
                    },
                    onMessage: payload => this.receive(attempt, payload),
                    onClose: detail => {
                        if (this.isCurrent(attempt)) {
                            this.end(new ClientConnectionError('REMOTE_CLOSE', 'The transport closed.', { detail }))
                        }
                    },
                    onError: cause => {
                        if (this.isCurrent(attempt)) {
                            this.end(new ClientConnectionError('TRANSPORT_ERROR', 'The transport failed.', { cause }))
                        }
                    }
                })
            } catch (cause) {
                if (this.attempt === attempt) {
                    this.end(new ClientConnectionError('TRANSPORT_ERROR', 'Could not open the transport.', { cause }))
                }
            }
        })
    }

    disconnect(detail?: unknown) {
        if (!this.attempt) return
        const code = this.state === 'connecting' ? 'CANCELLED' : 'LOCAL_DISCONNECT'
        this.end(new ClientConnectionError(code, 'Disconnected locally.', { detail }))
    }

    setDisconnectHandler(handler: DisconnectHandler) {
        this.disconnectHandler = handler
    }

    private isCurrent(attempt: ConnectionAttempt) {
        if (this.attempt !== attempt) return false
        if (attempt.deadline !== null && this.now() >= attempt.deadline) {
            const connecting = this.state === 'connecting'
            this.end(new ClientConnectionError(connecting ? 'CONNECT_TIMEOUT' : 'SERVER_TIMEOUT', connecting
                ? 'Connection attempt timed out.'
                : 'The server stopped sending nengi traffic.'))
            return false
        }
        return true
    }

    private scheduleDeadline(attempt: ConnectionAttempt) {
        if (attempt.deadline === null) return
        this.timer = setTimeout(() => {
            this.timer = null
            if (this.isCurrent(attempt)) this.scheduleDeadline(attempt)
        }, Math.max(1, attempt.deadline - this.now()))
        // An otherwise idle Node process need not stay alive for this deadline.
        if (typeof this.timer === 'object') this.timer.unref?.()
    }

    private receive(attempt: ConnectionAttempt, payload: BinaryPayload) {
        if (!this.isCurrent(attempt)) return
        try {
            const reader = this.adapter.binary.createReader(payload)
            if (this.state === 'connecting') {
                if (!attempt.opened) throw new Error('Received a handshake before the transport opened.')
                const result = this.network.readHandshakeResponse(reader)
                if (!result.accepted) {
                    this.end(new ClientConnectionError(result.denied ? 'CONNECTION_DENIED' : 'PROTOCOL_ERROR',
                        result.denied ? 'The server denied the connection.' : 'Invalid connection response.',
                        result.denied ? { detail: result.reason } : { cause: result.reason }))
                    return
                }
                this.state = 'connected'
                attempt.removeAbortListener?.()
                attempt.removeAbortListener = undefined
                if (this.timer !== null) clearTimeout(this.timer)
                this.timer = null
                attempt.deadline = this.serverTimeoutMs === null ? null : this.now() + this.serverTimeoutMs
                this.scheduleDeadline(attempt)
                attempt.resolve(result.clientData)
            } else {
                this.network.readSnapshot(reader)
                // Receiving a packet only renews liveness after successful decoding.
                attempt.deadline = this.serverTimeoutMs === null ? null : this.now() + this.serverTimeoutMs
                this.network.flushPongs(this.adapter.binary, pong => {
                    if (!this.isCurrent(attempt) || !this.send(attempt, pong)) {
                        throw new Error('Connection ended while sending a Pong.')
                    }
                })
            }
        } catch (cause) {
            if (this.attempt === attempt) {
                this.end(cause instanceof ClientConnectionError ? cause
                    : new ClientConnectionError('PROTOCOL_ERROR', 'Invalid server data.', { cause }))
            }
        }
    }

    private send(attempt: ConnectionAttempt, payload: BinaryPayload) {
        try {
            this.adapter.send(payload)
            return this.attempt === attempt
        } catch (cause) {
            if (this.attempt === attempt) {
                this.end(new ClientConnectionError('TRANSPORT_ERROR', 'Could not send to the server.', { cause }))
            }
            return false
        }
    }

    private end(error: ClientConnectionError) {
        const attempt = this.attempt
        if (!attempt) return
        const established = this.state === 'connected'
        // Invalidate before cleanup, transport calls, promises, or user callbacks.
        this.attempt = null
        this.state = established ? 'closed' : 'idle'
        if (this.timer !== null) clearTimeout(this.timer)
        this.timer = null
        attempt.removeAbortListener?.()
        attempt.removeAbortListener = undefined
        if (established) this.network.endSession(error)
        else attempt.reject(error)
        try {
            this.adapter.close(error.code, error.code !== 'LOCAL_DISCONNECT')
        } catch (cause) {
            // The logical session is already over, even if transport cleanup fails.
            console.error('nengi transport cleanup failed.', cause)
        }
        if (established) {
            try {
                this.disconnectHandler(error)
            } catch (cause) {
                console.error('nengi disconnect handler failed.', cause)
            }
        }
    }

    flush() {
        const attempt = this.attempt
        if (this.state !== 'connected' || !attempt || !this.isCurrent(attempt)) return
        let payload: BinaryPayload
        try {
            payload = this.network.createOutbound(this.adapter.binary)
        } catch (error) {
            if (this.attempt === attempt) this.network.rollbackOutbound()
            throw error
        }
        if (this.isCurrent(attempt) && this.send(attempt, payload)) this.network.flush()
    }

    private requireConnected() {
        if (this.state !== 'connected' || !this.attempt || !this.isCurrent(this.attempt)) {
            throw new ClientConnectionError('INVALID_STATE', 'This operation requires a connected Client.')
        }
    }

    /** Queue input and return its zero-based index in the current command batch. */
    addCommand(command: any) {
        this.requireConnected()
        return this.network.addCommand(command)
    }

    /**
     * Sends a command with optional input/view timing metadata for server-side
     * lag compensation. Use ordinary addCommand when the server does not need
     * to know what the client was viewing when the input was authored.
     * Returns the zero-based command index in the current batch.
     */
    addCommandWithTiming(command: any, options: CommandTimingOptions = {}) {
        this.requireConnected()
        return this.network.addCommandWithTiming(command, options)
    }

    reportInterpolationDelay(delayMs: number, options: InterpolationDelayReportOptions = {}) {
        // Presentation can still be sampled before acceptance or after close.
        if (this.state !== 'connected' || !this.attempt || !this.isCurrent(this.attempt)) return false
        return this.network.reportInterpolationDelay(delayMs, options)
    }

    getEstimatedServerTimeMs(nowMs?: number) {
        return this.network.getEstimatedServerTimeMs(nowMs)
    }

    getClockSync() {
        return this.network.getClockSync()
    }

    predictCommand(command: any, options: PredictionOperationOptions = {}) {
        this.requireConnected()
        return this.network.predictCommand(command, options)
    }

    /**
     * Predicts locally and sends the command with timing metadata. This is the
     * command-replay path for movement, shooting, dodging, and similar actions
     * where reconciliation and lag compensation both matter.
     */
    predictCommandWithTiming(command: any, predictionOptions: PredictionOperationOptions = {}, timingOptions: CommandTimingOptions = {}) {
        this.requireConnected()
        return this.network.predictCommandWithTiming(command, predictionOptions, timingOptions)
    }

    /**
     * Records a local expectation against the current command batch; sends nothing.
     * Send the causal command separately and confirm only after its authoritative
     * handling is complete. Request predictions instead resolve with their response.
     */
    predictState(payload: any, options: PredictionOperationOptions = {}) {
        this.requireConnected()
        return this.network.predictState(payload, options)
    }

    request<Request = any, Response = any>(
        endpoint: Endpoint<Request, Response>,
        payload: Request,
        options?: RequestOptions<Response>
    ) {
        this.requireConnected()
        return this.network.request(endpoint, payload, options)
    }
}

export { Client }
