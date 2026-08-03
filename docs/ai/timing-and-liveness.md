# Timing and connection liveness

Nengi uses monotonic milliseconds for elapsed time. The server owns the
authoritative network-time domain; the client has its own local monotonic clock.
Neither value is UTC, and client and server clock origins must not be subtracted
directly.

## Time vocabulary

- `serverTimeMs`: monotonic time in the server process's clock domain.
- `clientTimeMs`: monotonic time in the client process's clock domain.
- `tick`: an ordering and simulation marker. It is not a clock reading.
- `receivedAtMs`: the local client time when a snapshot arrived.
- `dt`: an application-owned simulation duration measured in the same domain as
  the transition that consumes it.

Every snapshot has a mandatory `serverTimeMs` header. A client `Frame` exposes
that value as `frame.serverTimeMs` and exposes local arrival time as
`frame.receivedAtMs`.

```ts
for (const frame of client.network.drainFrames()) {
    console.log(frame.tick, frame.serverTimeMs, frame.receivedAtMs)
}
```

Use server time for authoritative simulation records, historian samples,
command timing, lag compensation, replays, and server-scheduled effects. Do
not use a client render clock as server authority.

## Server clock injection

The server uses one monotonic clock source for snapshots, inbound receive
times, Ping/Pong, and connection deadlines. Tests and embedded runtimes can
replace that source through `InstanceOptions`:

```ts
let nowMs = 0
const instance = new Instance(context, { now: () => nowMs })

nowMs += 50
instance.step()
```

Do not pass a separate simulation timestamp into Nengi. If the application
needs a deterministic network clock, inject it through `now` so every network
event remains in one clock domain.

Use `Date.now()` only for wall-clock logging or user-facing dates. Do not use it
for deadlines, intervals, simulation, or latency calculations because the wall
clock can jump.

The client accepts the same kind of injected local clock as its fifth
constructor argument, after the adapter configuration:

```ts
const client = new Client(context, Adapter, 20, adapterConfig, { now: () => nowMs })
```

## Client server-time estimate

Pings include server time. The client combines that value with its local receive
time and the latest measured round-trip estimate to maintain an approximate
server-clock offset:

```ts
const estimatedServerTimeMs = client.getEstimatedServerTimeMs()
const sync = client.getClockSync()
```

The estimate is `null` until a Ping has supplied a sample. It is useful when a
command needs to state what server-time view the client was using:

```ts
client.addCommandWithTiming(command, {
    inputTimeMs: clientTimeMs,
    viewServerTimeMs: client.getEstimatedServerTimeMs() ?? -1
})
```

Treat this as an estimate. Server code must clamp rewind windows and retain
authority over hit validation, movement, permissions, and state changes.

## Ping and Pong

Ping/Pong has two responsibilities:

1. measure round-trip time and estimate clock offset;
2. prove that the client runtime is still processing Nengi traffic.

The server owns the sent time for each recent Ping. A Pong identifies the Ping
and reports the client's receive and send times. The client captures its send
time when the response is serialized.

Pongs are engine traffic. Game code does not construct them manually. Official
client adapters send a Pong-only packet immediately after a snapshot containing
a Ping is parsed. This control packet does not advance the command frame and
does not flush commands, requests, predicted operations, or other application
traffic. A normal `client.flush()` also carries any Pong that remains queued,
which preserves liveness for custom adapters that have not implemented the
immediate control path.

This separation matters in browsers. `requestAnimationFrame` commonly pauses in
a hidden tab, but receiving and answering network traffic must not depend on the
render loop. An open client that continues processing socket messages can remain
connected while rendering is suspended.

The server likewise needs a regular `instance.step()` cadence even when no game
or service state changed. Snapshots carry Pings, and each step evaluates
handshake and Pong deadlines. An event-driven service should schedule an idle
network step rather than stepping only after application mutations.

## Heartbeat deadlines

`Instance` defaults are intended for an active realtime game:

```ts
const instance = new Instance(context, {
    pingIntervalMs: 2000,
    pongTimeoutMs: 15000,
    handshakeTimeoutMs: 5000
})
```

The Pong timeout allows several missed Ping cycles and a short runtime stall. A
user who is idle in the game but continues responding to Pings is healthy;
gameplay AFK policy belongs to the application. Increase the timeout when the
product deliberately preserves sessions through longer process stalls. No
finite browser timeout can guarantee survival when an operating system fully
suspends or unloads the page.

Immediate Pongs solve connection liveness, not hidden-page application work.
Snapshots continue to produce queued `Frame` reports. A game that intends to
preserve a hidden session should switch to a low-frequency maintenance loop that
drains and handles frames, processes essential messages, and neutralizes any
latched input. Do not run simulation or rendering with one large elapsed `dt`
when the page becomes visible again; resume from authoritative state and reset
the application's accumulators. A game may instead choose to disconnect hidden
clients as an explicit product policy.

The handshake timeout covers the complete pre-acceptance lifecycle: waiting for
the initial Nengi handshake and waiting for `instance.onConnect` to resolve.
Configure a larger value when authentication has a deliberately larger budget;
do not leave an authentication promise unbounded.

If a handshake deadline expires before userland received `UserConnected`, Nengi
closes the transport and emits one `UserConnectionDenied` event with
`handshake_timeout`. It does not emit `UserDisconnected`. Once `UserConnected`
has been emitted, a Pong timeout closes the transport and emits exactly one
`UserDisconnected` event with `pong_timeout`.

Adapters may provide an immediate `terminate` operation so a half-open
transport does not wait indefinitely for a graceful WebSocket close.

Use [network-condition-simulation.md](./network-condition-simulation.md) to
exercise these deadlines under seeded asymmetric delay and stalls. Inject one
manual monotonic clock into the `Instance`, `Client`, and simulated link so the
test controls every deadline explicitly.

## Wire compatibility

The connection handshake and every snapshot carry Nengi's wire-protocol
version. A mismatch is fatal and is distinct from the optional schema
fingerprint check. Keep nengi and every official adapter or binary package on
the same exact release-candidate version.

## Interpolation is separate

The default interpolators use local playback time, frame order, and local
arrival history. They do not require a synchronized server clock. This keeps
presentation smoothing stable when clock estimates change or snapshots arrive
with jitter.

Use `frame.serverTimeMs` as metadata and for authority-related features. Keep
interpolation and render scheduling in the client application.
