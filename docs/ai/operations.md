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

Fingerprints are cached per `Context`. `context.register(...)` and
`context.registerEndpoint(...)` invalidate the cache when adding a definition.
Complete registrations before accepting connections; changing a live protocol
does not update peers that have already connected.

Treat compiled schemas and endpoint definitions as immutable setup data. Do not
edit their properties, property order, update-group definitions or payload schemas
after registration. `context.schemas` and `context.endpointDefinitions` are
read-only inspection views in TypeScript; writing through a cast or JavaScript
bypasses registration and cache invalidation. Make new definitions and a new
context for a changed protocol. This does not restrict mutation of game entities
or nengi's internal update-group counters.

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

On the client, catch `client.connect()` failures and register
`client.setDisconnectHandler(info => ...)` before connecting. Initial failure
rejects the Promise; after acceptance, terminal outcomes use the disconnect
handler exactly once. Record `info.code`, `info.detail`, and `info.cause` for
diagnostics. Malformed snapshots end the session with `PROTOCOL_ERROR`; transport
failures use `TRANSPORT_ERROR`. There is no separate error callback to trigger a
second reconnect. See [connection lifetime](./client-state.md#connection-lifetime).

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
adapter termination contract. Core answers Pings through the transport independently of
the application's render and flush cadence, so `pong_timeout` means the client
stopped processing network traffic or could not return it, not merely that a
browser paused `requestAnimationFrame`.

Log `UserConnectionDenied` on the server to diagnose admission failures. Its
payload and the attempt's abort reason retain the original local error; unexpected
exceptions reach the client only as `{ reason: 'server_error' }`. For an expected
public refusal, return `{ deny: detail }` from `onConnect`. See
[public denials](./networking-primitives.md#public-connection-denials) and
[safe setup cleanup](./networking-primitives.md#cancellation-and-setup-ownership).

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

All client transports complete logical disconnect synchronously, including browser
and Node WebSockets. Stop the game loop and release presentation in the disconnect
handler. Pending requests reject with `DISCONNECTED` and their server outcomes
may be unknown. Queued frames and commands are discarded; last applied state and
history remain readable. Transport close can finish later, and does not notify
again. Local server kicks can also invoke the client handler synchronously.
Configure client `connectTimeoutMs` and `serverTimeoutMs` to bound unreachable
servers and accepted peers that stop publishing.

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
`RequestPolicy.ReplaceQueued` with a stable `key` when the action semantics permit
collapsing input. Dedupe shares an outstanding result; ReplaceQueued supersedes
only unsent intent. Sent requests keep their results. See the
[policy table](./networking-primitives.md#client-results-and-queued-intent).
These client policies do not constrain a modified or hostile client.
`instance.processRequests(max)` limits the number of requests dequeued in that
call. It does not cap the incoming queue, handler duration, concurrent async
operations, or queued response bytes. Limit expensive operations in game code
before starting them, including authentication work in `onConnect`. Its new
cancellation signal lets cooperating I/O stop on timeout or abandonment, but
cannot forcibly cancel arbitrary database work. See
[setup ownership](./networking-primitives.md#cancellation-and-setup-ownership)
for reservation cleanup and late results.

The client and server expose request/response backlog observers. Treat a
backlog as an operational signal: it means the current request production rate
or handler budget is not keeping up with the wire cadence. Do not hide a growing
backlog by making handlers mutate state from arbitrary promise continuations.

## Request failures

Register the protected server diagnostic hook to see handler and reply failures:

```ts
instance.onRequestError = ({ user, requestId, endpointId, phase, code, error }) => {
    logger.error('nengi request failed', {
        userId: user.id, requestId, endpointId, phase, code, error
    })
}
```

`phase` is `handler` or `response`. Codes are `HANDLER_ERROR`, `HANDLER_REJECTED`,
`RESPONSE_ENCODING_ERROR`, and `RESPONSE_TOO_LARGE`. The original `error` stays on
the server; size errors include `byteLength` and `maximum`. Keep logging bounded
and local. Observer exceptions are contained, and the hook does not choose a
response. A handler failure is still reported after it has already replied or
its user has disconnected; nengi does not produce a second reply.

A single successful reply that exceeds either the per-user or whole-instance
response byte budget is replaced by a small `RESPONSE_TOO_LARGE` error. Encoding
failures, such as circular JSON or a missing schema string, produce
`RESPONSE_ENCODING_ERROR`. Both preserve the connection when the fallback fits.
Fallbacks count toward all normal response budgets. Accumulated output pressure,
or a configured budget too small for even the fallback, retains the normal
`onNetworkLimit` disconnect behavior. These checks bound retained responses;
they cannot prevent application allocation or undo work already performed.

Use normal response data for gameplay denial. Catch client Promise failures and
investigate missing responses to immediate game actions. A handler that returns
`undefined` and never calls `send` remains a likely application bug; nengi also
permits retaining `send` for deliberate deferral and cannot infer that intent.

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

## Snapshot step failures

`Instance.step()` is not transactional. Collection can advance shared diff
baselines and consume queues before encoding finishes, and earlier users can
already have received this tick's snapshot. Repairing a bad value and retrying
the same instance cannot reliably restore missing updates or messages.

An exception after snapshot work begins throws `InstanceStepError` and records
it in the read-only `instance.failure` property. The error exposes `tick` and
`cause`, which retains the original error and any binary diagnostic context.
Later `step()` calls throw the same error before doing any work. There is no reset
or resume operation. Cleanup errors also fail the instance; if encoding failed
first, that original cause is preserved.

The application must stop its game loop and shut down every adapter serving the
failed instance. The failure flag does not itself close sockets, stop admission,
cancel application async work, or stop timers. Use the ordinary
[adapter shutdown](./adapters.md#server-shutdown) path, process lifecycle cleanup,
then recreate the instance and adapters if the game should restart. Other
instances in the process are unaffected. Keep detailed errors in server logs;
use a generic shutdown reason for clients.

Inside a game's tick callback:

```ts
try {
    instance.step()
} catch (error) {
    clearInterval(ticking)
    logger.error('Snapshot step failed', { error, failure: instance.failure })
    void adapter.shutdown('Server error').catch(shutdownError => {
        logger.error('Adapter shutdown failed', { error: shutdownError })
    })
    return
}
```

This pattern conservatively stops on any step error. An invalid clock rejected
before snapshot preparation does not set `instance.failure` and can be retried
after repairing the clock. Ordinary caught transport send errors still close
only that user and invoke `onSnapshotSendError`; they do not fail the instance.

## Binary diagnostics

nengi always checks each independently allocated outbound payload's written
byte count and payload length before caching or sending it. This includes shared
fragments, completed snapshots, commands, handshakes and Pongs. A mismatch raises
a binary diagnostic error with the section, expected bytes, writer offset and
payload bytes. A snapshot-step error retains it as `instance.failure.cause`.
There is no second scan of entities or property values in these checks.

These checks detect size disagreements, not every incorrect value or schema
mistake. Correct-sized but semantically wrong data still needs application
validation and tests. Client encoding failures retain their existing lifecycle:
`flush()` restores queued outbound work when construction fails, while connection
and control failures follow the client's connection-error policy.

When a snapshot write fails and the raw error lacks enough context, enable:

```ts
instance.network.diagnosticBinaryWrites = true
```

This can rerun a throwing snapshot chunk with section, entity, property, and
value context. Size-mismatch errors identify the allocation boundary; they do not
promise a specific offending property. This diagnostic mode can change fragment
selection, so disable it during normal play and benchmarks. The allocation size
checks remain enabled.
