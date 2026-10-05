import { BinaryAdapter, BinaryPayload } from '../../common/binary/BinaryAdapter'
import type { NetworkLimits } from '../NetworkLimits'

/** Transport-owned socket/peer metadata with core-owned lifecycle observations. */
export interface ServerConnection<Socket = unknown> {
    socket: Socket
    remoteAddress: string | null
    readonly id: number
    readonly isClosed: boolean
}

/** The server transport boundary. Obtain it from instance.adapterHost. */
export interface ServerAdapterHost {
    readonly serverAdapterVersion: 1
    readonly limits: Readonly<NetworkLimits>
    createConnection<Socket>(socket: Socket, adapter: IServerNetworkAdapter<any, any, any>, remoteAddress?: string | null): ServerConnection<Socket>
    onOpen(connection: ServerConnection): void
    onMessage(connection: ServerConnection, payload: BinaryPayload): void
    onTransportControl(connection: ServerConnection, byteLength: number): boolean
    onClose(connection: ServerConnection, reason?: unknown): void
    disconnectUser(connection: ServerConnection, reason: unknown, force?: boolean): void
    disconnectMalformedInboundUser(connection: ServerConnection): void
    notifyInboundMessageError(connection: ServerConnection, payload: BinaryPayload, error: unknown): void
    shutdownAdapter(adapter: IServerNetworkAdapter<any, any, any>, reason?: unknown): void
}

interface IServerNetworkAdapter<
    InboundPayload extends BinaryPayload = BinaryPayload,
    OutboundPayload extends BinaryPayload = InboundPayload,
    ListenOptions = number
> {
    readonly serverAdapterVersion: 1
    binary: BinaryAdapter<InboundPayload, OutboundPayload>
    listen(options: ListenOptions, ready?: () => void): void
    /** Terminal and idempotent: stop admissions, disconnect owned users, and close the owned listener. */
    shutdown(reason?: any): Promise<void>
    /** Send must synchronously accept/own the bytes or throw; silently dropping a snapshot is invalid. */
    send(connection: ServerConnection, buffer: OutboundPayload): void
    disconnect(connection: ServerConnection, reason: any): void
    /** Immediately destroys an unresponsive transport when graceful close may hang. */
    terminate?(connection: ServerConnection, reason: any): void
}

export { IServerNetworkAdapter }
