# Operational safeguards

Use these hooks at the network boundary for diagnostics and deployment safety.
They observe failures; they should not become hidden gameplay control flow.

## Schema fingerprints

During development or controlled deployments, require the client and server to
agree on registered entity/message schemas and registered endpoint definitions:

```ts
// client, before connect
client.network.sendSchemaFingerprint = true

// server, before accepting connections
instance.network.requireSchemaFingerprint = true
```

A mismatch rejects the handshake. The fingerprint is a deterministic drift
check, not authentication or a cryptographic protocol proof. Register endpoint
definitions in the shared context before connecting if their payload schemas
should be covered.

## Malformed traffic and send failures

Malformed inbound packets are reported and then the sender is disconnected:

```ts
instance.onInboundMessageError = ({ user, error, byteLength }) => {
    logger.warn('malformed nengi packet', { userId: user.id, error, byteLength })
}

instance.onSnapshotSendError = ({ user, error, byteLength, tick }) => {
    logger.error('snapshot send failed', { userId: user.id, error, byteLength, tick })
}
```

On the client, use `client.network.onMalformedSnapshot`,
`client.setDisconnectHandler`, and `client.setWebsocketErrorHandler` to connect
transport failures to the application's diagnostics. A malformed snapshot is
fatal because decoding may already have changed protocol bookkeeping; Nengi
reports it and closes the client transport. These callbacks should be small and
should not mutate authoritative state directly.

The server validates the complete initial handshake packet before invoking
`onConnect`; a valid handshake prefix followed by malformed data does not start
authentication work. A failed packet does not publish its command batch, and
disconnect cleanup removes that sender's queued requests. Commands already
queued from earlier valid packets retain the normal disconnected-user handling
described in the command guide. Packets arriving after the user is logically
Closed are ignored before decoding. An asynchronous handler started by an
earlier valid packet still owns its cancellation and session-dependent effects.

Commands and requests received before acceptance are protocol errors and close
the connection. Wait for successful `client.connect()` before flushing either.
The server does not queue error responses for unauthenticated requests.

For half-open sockets and clients that stop processing Nengi traffic, configure
the server's `pingIntervalMs`, `pongTimeoutMs`, and `handshakeTimeoutMs`.
Pre-acceptance handshake expiry emits `UserConnectionDenied`; Pong expiry after
acceptance emits `UserDisconnected`. See
[timing-and-liveness.md](./timing-and-liveness.md) for the clock domains and
adapter termination contract. Official adapters answer Pings independently of
the application's render and flush cadence, so `pong_timeout` means the client
stopped processing network traffic or could not return it, not merely that a
browser paused `requestAnimationFrame`.

For an accepted connection, nengi completes its channel-side cleanup before
`UserDisconnected` is observable. The disconnected user is removed from every
subscribed channel, including spatial views and per-user visibility caches.
Userland must still remove resources it owns, such as player entities, room and
account indexes, timers, physics bodies, and persistence sessions. Explicitly
calling `channel.unsubscribe(user)` in a disconnect handler is safe but is not
required for nengi's channel lifecycle.

`user.disconnect(reason)` marks the server user Closed and performs that cleanup
immediately, before asking the adapter to close the transport. Delayed close
callbacks or adapter close exceptions do not leave the user registered. Repeated
disconnects do not emit another `UserDisconnected`; the initiating reason is
preserved when a transport callback arrives later. A transport's close handshake
may still take time. Timeout handling can use the adapter's `terminate` method.

Commands already in `instance.queue` remain observable, but `CommandRouter`
skips them for closed users. Hand-written command loops need a connection check
before each command. Unstarted requests are removed automatically; running
asynchronous work remains application-owned. See
[request and disconnect workflows](./networking-primitives.md#disconnect-during-an-asynchronous-request).

Local and simulated-local adapters notify the client through its normal
disconnect handler, reject outstanding requests with `DISCONNECTED`, and clear
their connected state. Close notification happens synchronously for these
in-memory transports, so disconnect handlers should tolerate being called from
within `client.disconnect()` or a local server kick.

Engine controls are validated independently of game commands and requests.
All official adapters reject text data. ws/uWS/Bun also budget native WebSocket
Ping/Pong callbacks; Deno does not expose those callbacks. See
[network limits](./network-limits.md#engine-controls-and-transport-frames) for
message direction/state rules, fixed control ceilings and transport boundaries.

## Request pressure

Finite connection, traffic and queue budgets are enabled by default. Configure
them with `new Instance(context, { limits: { ... } })`; see
[network limits](./network-limits.md) for defaults, units, diagnostics and queue
consumption rules.

Requests have a timeout by default. Set `timeoutMs` per request when a feature
needs a shorter or longer budget, and use `RequestPolicy.Dedupe` or
`RequestPolicy.Replace` with a stable `key` when duplicate UI actions should be
collapsed. These client policies do not constrain a modified or hostile client.
`instance.processRequests(max)` limits the number of requests dequeued in that
call. It does not cap the incoming queue, handler duration, concurrent async
operations, or queued response bytes. Limit expensive operations in game code
before starting them, including authentication work in `onConnect`; a connection
timeout does not cancel an already running database operation.

The client and server expose request/response backlog observers. Treat a
backlog as an operational signal: it means the current request production rate
or handler budget is not keeping up with the wire cadence. Do not hide a growing
backlog by making handlers mutate state from arbitrary promise continuations.

## Transport budgets

Configure the server adapter for the expected traffic. The current defaults and
controls differ by runtime:

| Adapter | Incoming messages | Outgoing pressure |
| --- | --- | --- |
| ws | `maxPayloadLength`, defaults to core `maxPacketBytes` (64 KiB); enforced by ws during reception | `maxBufferedBytes`, 4 MiB; rejects queued bytes plus the next payload above the budget and terminates |
| uWS | `behavior.maxPayloadLength`, defaults to core `maxPacketBytes` (64 KiB) | `behavior.maxBackpressure`, runtime default 64 KiB; a dropped send disconnects the user |
| Bun | `maxPayloadLength`, defaults to core `maxPacketBytes` (64 KiB); enforced by Bun | `maxBufferedBytes`, 4 MiB; native backpressure limit plus adapter checks and termination |
| Deno | No configurable receive-size limit exposed by this adapter | `maxBufferedBytes`, 4 MiB; checks queued bytes plus the next payload, then closes on overflow |

The ws/Bun/Deno outgoing checks also reject a single payload larger than their
budget. Size initial snapshots accordingly or configure more room. uWS uses a
different native threshold that may be exceeded by one accepted message.
These values do not describe total process memory or kernel buffering.

An accepted transport send can still be queued locally; it does not confirm
client receipt or processing. uWS status 0 and Bun status -1 indicate accepted
buffered data. Dropped sends must end the session because snapshot deltas have
already been committed. Synchronous snapshot send failures reach
`onSnapshotSendError`; ws errors detected asynchronously close the user through
transport cleanup and are not reported as synchronous snapshot failures.

Native transport budgets are complemented by core admission, packet/byte credit,
and retained-input/response ceilings. These protect different stages; see
[network limits](./network-limits.md). Bound process-wide connections at the
service boundary and expensive work in game code; `processRequests(max)` and
client request timeouts do not bound asynchronous concurrency.

Use the server-associated user identity to authorize every action. Schema
decoding checks representation, not ownership or gameplay validity. Only
replicate state a user is permitted to inspect. For IP-based controls, the ws
adapter now uses the direct peer address unless its `trustProxy` callback
explicitly trusts that peer. The trusted proxy must sanitize `X-Forwarded-For`;
the other official server adapters expose the direct peer address.

## Binary diagnostics

When a snapshot write fails and the raw error lacks enough context, enable:

```ts
instance.network.diagnosticBinaryWrites = true
```

This reruns the failed write with section, entity, property, and value context.
Disable it during normal play and benchmarks because it adds work to the hot
path.
