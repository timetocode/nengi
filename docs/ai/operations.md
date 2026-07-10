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
transport failures to the application's diagnostics. These callbacks should be
small and should not mutate authoritative state directly.

## Request pressure

Requests have a timeout by default. Set `timeoutMs` per request when a feature
needs a shorter or longer budget, and use `RequestPolicy.Dedupe` or
`RequestPolicy.Replace` with a stable `key` when duplicate UI actions should be
collapsed. `instance.processRequests(max)` bounds server request work per tick.

The client and server expose request/response backlog observers. Treat a
backlog as an operational signal: it means the current request production rate
or handler budget is not keeping up with the wire cadence. Do not hide a growing
backlog by making handlers mutate state from arbitrary promise continuations.

## Binary diagnostics

When a snapshot write fails and the raw error lacks enough context, enable:

```ts
instance.network.diagnosticBinaryWrites = true
```

This reruns the failed write with section, entity, property, and value context.
Disable it during normal play and benchmarks because it adds work to the hot
path.
