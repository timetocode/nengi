# Networking primitives

Before choosing a channel, decide what kind of network data the feature needs.

## Connection handshake

Each `Client` permits one established session and one pending connection attempt
at a time. After a failed initial attempt rejects, retry on the same Client. After
an established session ends, create a fresh Client and its session helpers; the
`Context` can be reused. See [connection lifetime](./client-state.md#connection-lifetime).

Use the connection handshake for facts the server needs before accepting a
socket:

- auth token or session token
- selected character, shard, room, or save slot
- client build/version
- requested display name or cosmetic profile id

If the game has no connection setup data, the client can connect with only the
target:

```ts
await client.connect('ws://localhost:8079')
```

When the server needs setup data, the client passes a JSON-serializable value
to `connect`:

```ts
await client.connect('ws://localhost:8079', {
    token,
    characterId,
    clientBuild: BUILD_ID
})
```

The server validates that value in `instance.onConnect`. Treat handshake data as
untrusted client input: use it to look up server-side facts, not as proof that a
user is an admin or owns a character.

Check shape and field sizes before starting authentication or database work.
nengi checks binary structure, JSON syntax and byte budgets; it cannot infer the
application's allowed fields. This handler expects three string fields:

```ts
type ConnectionInput = { token: string, characterId: string, clientBuild: string }

function isConnectionInput(value: unknown): value is ConnectionInput {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const input = value as Record<string, unknown>
    return typeof input.token === 'string' && input.token.length > 0 && input.token.length <= 4096 &&
        typeof input.characterId === 'string' && input.characterId.length > 0 && input.characterId.length <= 64 &&
        typeof input.clientBuild === 'string' && input.clientBuild.length > 0 && input.clientBuild.length <= 128 &&
        Object.keys(input).every(key => key === 'token' || key === 'characterId' || key === 'clientBuild')
}

instance.onConnect = async (handshake, { signal }) => {
    if (!isConnectionInput(handshake)) {
        return { deny: { reason: 'invalid_handshake' } }
    }

    const session = await verifySessionToken(handshake.token, { signal })
    signal.throwIfAborted()
    if (!session) {
        return false
    }

    const character = await loadOwnedCharacter(session.accountId, handshake.characterId, { signal })
    signal.throwIfAborted()
    if (!character) {
        return false
    }

    return {
        serverData: {
            accountId: session.accountId,
            character,
            isAdmin: session.roles.includes('admin')
        },
        clientData: {
            characterId: character.id,
            characterName: character.name
        }
    }
}
```

Choose field bounds for your application. String `.length` counts UTF-16 code
units; `limits.maxHandshakeBytes` limits the complete encoded packet to 8 KiB by
default, including wire metadata. Raise that finite limit for a deliberate larger
setup payload; see [network limits](./network-limits.md#handshake-input).

Valid JSON can contain deeply nested arrays or objects. Reject unexpected shapes
before logging the entire input, merging it into server objects, or walking it
recursively. The shallow validator above never traverses unexpected nested
values. Applications accepting recursive data must bound depth and collection
sizes themselves. A byte budget alone does not establish a safe recursion depth.

Return `false` to deny or `true` to accept without setup data. To accept with data,
use `{ serverData?, clientData? }` (the exported `ConnectionAcceptance` type).
Both fields are optional. To deny with a public explanation, return `{ deny: detail }`
(the exported `ConnectionDenial` type); see below. Other return shapes are rejected;
wrap an existing server-local payload in `serverData`.

nengi waits for `onConnect` before admitting the user. `serverData` becomes
`event.payload` on the server-side `NetworkEvent.UserConnected` event, by reference.
It is never serialized, so it can contain loaded records and other local objects:

```ts
if (event.type === NetworkEvent.UserConnected) {
    const session = event.payload
    users.set(event.user.id, session)
    spawnCharacter(event.user, session.character)
}
```

On acceptance, only `clientData` crosses the network. Choose a small JSON-serializable value
containing public setup facts; keep credentials, private records and live server
objects in `serverData`. The client's `connect()` resolves with decoded `clientData`,
or `undefined` if omitted. JSON values such as `null`, `false`, `0`, and `""` remain
distinct from omission. Normal JSON serialization rules apply; circular values,
BigInt, and values that cannot produce JSON reject admission before acceptance.

```ts
type ConnectionSetup = { characterId: string, characterName: string }
const setup = await client.connect<ConnectionSetup>(address, { token, characterId })
if (setup) {
    showCharacterName(setup.characterName)
}
```

The generic describes application data; it does not validate the payload at runtime.
Without a generic the result is `unknown`. A failed connection rejects a
`ClientConnectionError`, regardless of whether the game uses setup data.

Acceptance means asynchronous admission has completed. It does not wait for the
game loop to handle `UserConnected`, create the player, or send the first snapshot.
Keep evolving state such as health and inventory on the replication path. Wait
for the player's replicated entity before entering gameplay when needed.
The connection deadlines include setup and encoding time. See
[connection budgets](./timing-and-liveness.md#handshake-deadlines) when authentication
needs longer than the default five seconds.

### Public connection denials

Use an explicit denial for an expected refusal that the client should understand:

```ts
instance.onConnect = async (handshake, { signal }) => {
    const account = await authenticate(handshake.token, { signal })
    signal.throwIfAborted()
    if (!account) return false
    if (account.banned) {
        return { deny: { reason: 'banned' } }
    }
    return { serverData: account }
}
```

The client rejects with `ClientConnectionError.code === 'CONNECTION_DENIED'` and
the decoded public value in `detail`. That value is `unknown`; validate its shape
before using application-specific fields. Denial delivery is best effort, so a
transport close or the client's own timeout can arrive instead.

| Server outcome | Public `detail` |
| --- | --- |
| `return false` | `{ reason: 'connection_denied' }` |
| `return { deny: detail }` | The JSON-decoded `detail` |
| Unexpected exception or invalid setup/denial data | `{ reason: 'server_error' }` |
| Handshake deadline exceeded | `{ reason: 'handshake_timeout' }` |
| Wire/schema incompatibility | `reason: 'wire_protocol_mismatch'`, `'schema_fingerprint_required'`, or `'schema_fingerprint_mismatch'`, with the relevant version/fingerprint fields |

Choose small, deliberately public JSON denial data. The same JSON rules as
`clientData` apply, except `deny: undefined` is invalid. Do not combine `deny` with
acceptance fields or other top-level fields. Invalid detail, including a cycle
or BigInt, becomes a generic server error. An expired or cancelled attempt takes
precedence over a late denial, just as it does over a late acceptance.

Throwing an Error or another value is a server failure, not a public refusal API.
The original exception stays in the server's `UserConnectionDenied` event payload
and the attempt's `signal.reason`. Explicit denials preserve the original detail
by reference in those local diagnostics. Log failures on the server; do not put
credentials, private records or backend exception messages into `deny`.

### Cancellation and setup ownership

The second `onConnect` argument is a `ConnectionAttemptContext`: `{ user, signal }`.
Existing one-argument handlers remain valid. `user` identifies this specific
attempt; it has no accepted ID (`id` is 0) or `instance` yet. Do not spawn, subscribe,
or send gameplay data through this provisional user. Its identity can be used as
a reservation token; its accepted ID is assigned only on successful admission.

nengi aborts `signal` if the attempt fails before acceptance: peer close, timeout,
adapter shutdown, protocol/limit failure, application denial or exception, invalid
setup data, or failure to encode/send acceptance. Core state and capacity are
released before abort listeners run. `signal.reason` carries the denial/close
reason when available; otherwise it is an Error. Treat it as diagnostic data,
not a fixed error schema. nengi does not await asynchronous listeners.

Abort listeners must catch their own cleanup errors, including Promise rejections.
In Node, an uncaught listener exception or rejection becomes an uncaught exception
and terminates the process by default. A peer disconnect can trigger this cleanup.
A `try/catch` around the operation that aborts the signal cannot catch the later
platform exception. For cleanup that can fail, use a handler such as:

```ts
signal.addEventListener('abort', async () => {
    try {
        await releaseReservation()
    } catch (error) {
        reportCleanupFailure(error) // Application logging that does not throw.
    }
}, { once: true })
```

Pass the signal to application I/O that supports it and check it after `await`.
The functions above are application helpers; forwarding `{ signal }` only cancels
their work if they implement that support. For non-cancellable I/O, check after it
finishes and explicitly release any resource it acquired. nengi discards late
results, but cannot cancel arbitrary Promises or roll back database transactions.

Returning `{ serverData }` is not the resource handoff: acceptance encoding or
sending can still fail afterwards. Keep cancellation cleanup registered until
acceptance succeeds. A successful acceptance queues `UserConnected` with that
payload, after which cleanup belongs to the normal `UserDisconnected` lifecycle.
The attempt signal does **not** abort on an accepted session's later disconnect.
Once supplied to `onConnect`, it aborts on failure before server-side acceptance
and remains unaborted on acceptance. This handoff does not prove that the client
received the acceptance packet.

For a single-login reservation, compare its owner before releasing it. This
prevents old cleanup from erasing a replacement session's reservation:

```ts
const accountOwners = new Map<string, object>()

instance.onConnect = async (handshake, { user, signal }) => {
    const account = await verifySessionToken(handshake.token, { signal })
    signal.throwIfAborted()
    if (!account || accountOwners.has(account.id)) return false

    accountOwners.set(account.id, user)
    const release = () => {
        if (accountOwners.get(account.id) === user) accountOwners.delete(account.id)
        signal.removeEventListener('abort', release)
    }
    signal.addEventListener('abort', release, { once: true })

    const character = await loadOwnedCharacter(account.id, handshake.characterId, { signal })
    signal.throwIfAborted()
    if (!character) return false
    return { serverData: { character, release } }
}

// In the game loop's ordered event drain:
if (event.type === NetworkEvent.UserConnected) {
    sessions.set(event.user.id, event.payload)
}
if (event.type === NetworkEvent.UserDisconnected) {
    sessions.get(event.user.id)?.release()
    sessions.delete(event.user.id)
}
```

Here loading returns a plain record. A loader that acquires a resource must also
dispose of an abandoned result. Release functions should be idempotent. Process
both lifecycle events even when a user disconnected before the game drained its
`UserConnected` event; skip spawning if `user.connectionState !== UserConnectionState.Open`, but
still retain or release the payload's resources. Do not depend on a denial event
for every abandoned attempt: peer close and shutdown before acceptance use the
signal and do not emit `UserDisconnected` or an additional denial event.

This policy rejects a new login while the old session remains alive, which may
last until the Pong deadline after a network drop. A game can instead authenticate
the new login and deliberately disconnect/replace the old session. Choose that
account policy explicitly and retain the owner comparison in either model.

## Entity

Use an entity for persistent replicated state.

Good fits:

- Player position.
- NPC state.
- Door open/closed state.
- Inventory item that should exist on the client while visible.
- Projectile or world object with state over multiple snapshots.

An entity has:

- `nid`: network id assigned by nengi.
- `ntype`: schema/type id.
- Schema properties.

Entities are created, updated, and deleted through snapshots. A newly subscribed user receives creates for visible entities.

Validate actions before allocating networked entities or components when possible.
Registration, queued writes, and removal all cost server work. In the fast spatial
ECS channels, new roots and components must survive their first snapshot; remove
them in a subsequent tick. Follow the
[spatial ECS lifetime rules](./ecs-channels.md#mutation-responsibility) instead of
relying on same-tick creation and cancellation. Use a message for an event that
must be observed even if it lasts less than a tick.

Network ids are reusable transport identities, not permanent gameplay identities.
Removed ids become reusable after the snapshot boundary. Until then they still
occupy allocator slots, so a large burst of temporary objects can widen ids from
8 to 16 or 32 bits. The width does not shrink during that instance's lifetime.
This is another reason to keep temporary calculations outside networked state.

For discontinuous movement, call `channel.skipInterpolation(entity)` after
moving the entity on the server. This marks the next snapshot so the client
snaps to the new value instead of interpolating from the old position. Use it
for teleports, blinks, respawns, wraparound, and object-pool reuse.

## Message

Use a message for transient events.

Good fits:

- Chat line.
- Sound cue.
- Hit marker.
- Floating damage number.
- Short-lived notification.

Messages are not persistent. A user who was not subscribed or connected when the message was sent does not reconstruct that message later from state.

Messages have the same scope as the server API that sent them. Messages queued
directly to a user are top-level frame messages. Messages added to a channel are
channel-scoped and must be read from that channel's `ChannelFrame`.

For a subscribed channel, `user.queueChannelMessage(channelId, message)` keeps
issue order within that channel. `queueChannelInterpolatedMessage` preserves
order in its separate interpolated-message queue. Broadcasts, per-user messages,
different channels and ordinary/interpolated messages occupy separate queues;
their calls do not establish one combined delivery order.

Subscribe before queueing per-user channel messages. Calls for an unsubscribed
channel are ignored. Unsubscribe discards that subscription's unsent ordinary
and interpolated messages, including during channel destruction or disconnect.
Resubscribing starts with a fresh queue for that channel, even within one server
tick. Messages already sent in an earlier snapshot are not recalled.

For asynchronous work tied to a particular channel object, check
`user.subscriptions.get(channel.nid) === channel` after awaiting and before
queueing its result. The numeric-ID queue APIs cannot identify a stale operation
if a different channel now owns that ID. If work belongs to a particular visit
to the same channel, game code also owns that visit's cancellation or identity.

On the client, top-level messages may be handled immediately from processed
frames or on the interpolation timeline:

```ts
for (const frame of client.network.drainFrames()) {
    frame.messages.forEach(message => {
        if (message.ntype === NType.YouArePlayer) {
            setControlledPlayer(message.nid)
        }
    })
}
```

Handle channel-scoped messages from the matching channel frame:

```ts
const worldFrame = frame.getChannel(worldChannelId)
worldFrame?.messages.forEach(message => {
    if (message.ntype === NType.Impact) {
        spawnImpactEffect(message.x, message.y)
    }
})
```

Use ordinary messages for UI/control context, chat, notifications, and other
logic that should run after the snapshot's authoritative state has been applied.
Use interpolated messages for transient effects that should line up with
interpolated entity motion, such as shots, impacts, casts, or sounds tied to
moving entities.

Server APIs:

```ts
user.queueMessage(message)       // top-level frame.messages
channel.addMessage(message)      // channelFrame.messages

user.queueInterpolatedMessage(message)  // top-level frame.interpolatedMessages
channel.addInterpolatedMessage(message) // channelFrame.interpolatedMessages
```

These are separate lanes. Do not send the same side effect through both unless
duplicate client handling is intentional.

## Command

Use a command for client-to-server input that does not inherently need a response.

Good fits:

- Movement input.
- Aim direction.
- Fire button.
- Repeated input stream.

Commands should be validated on the server. The authoritative result should usually appear later as entity state or messages.

For movement commands, define a clear cadence. Either send movement commands at
a fixed client command rate, or include enough timing/input information for the
server to simulate a bounded amount of time. Do not accidentally make movement
speed depend on browser render frame rate by sending one command per
`requestAnimationFrame` and applying a fixed movement step per command.

For predicted real-time movement, read
[real-time movement prediction](./realtime-movement-prediction.md). The movement
command handler is usually the right place to apply player-authored movement and
the collision rules caused by that movement.

## Command payloads and sequencing

Command payloads should describe the game input for that command: movement
axes, aim direction, selected tool, fire button, or another gameplay choice.

Nengi supplies command-frame sequencing separately from the payload. Each client
flush has a numeric `commandFrameNumber`. Every command in that flush also has a
numeric `commandIndex`, which identifies the command's position inside that one
flush. It is not a second timeline; Nengi uses it to attach optional sparse
timing metadata to the matching command. On the server, `CommandRouter` passes
both numbers to the handler:

```ts
commands.on<MoveCommand>(NType.MoveCommand, ({ user, command, commandFrameNumber, commandIndex }) => {
    movePlayer(user, command)
    recordInput(commandFrameNumber, commandIndex)
})
```

Ordinary `client.addCommand(...)` / `addCommandWithTiming(...)` inputs are released
after a successful send. Games using them need no command confirmation call.
Explicit completion is needed for command/state prediction, or when the application
itself uses a completed-input boundary. Request predictions resolve by response.

Each applied frame exposes `frame.confirmedCommandFrameNumber`: the server game
has completed authoritative handling of every received command batch through
that number. A command deliberately rejected by game validation is still
confirmed; confirmation does not mean its requested action succeeded.

For command/state prediction, game code must call
`user.confirmCommandsThrough(commandFrameNumber)` after the relevant simulation
work and before `instance.step()`. Receiving packets,
dequeueing events, returning from `CommandRouter` handlers and producing snapshots
do not advance confirmation. The initial confirmed number is 0. The method
returns the confirmed number, ignores older/duplicate completions, and throws
`RangeError` for a non-UInt32 number or a number beyond received input.
`user.lastReceivedCommandFrameNumber` and `user.lastConfirmedCommandFrameNumber`
expose the separate receipt and completion boundaries.

For a synchronous tick that fully handles all received commands, including any
game-owned movement queue, confirm each user after simulation:

```ts
// All received input has been applied or deliberately rejected in this tick.
for (const user of instance.users.values()) {
    user.confirmCommandsThrough(user.lastReceivedCommandFrameNumber)
}
instance.step()
```

For deferred work, retain the batch's `event.commandFrameNumber` and explicitly
confirm through the last fully completed batch after integration. Do not sample
the latest received number after an `await`: newer input may still be pending.
Do not confirm a batch from its first command handler, or confirm a later batch
while an earlier one is unfinished. Nengi validates the numeric boundary; game
code owns the assertion that all work through it is complete. Keep the snapshot's
predicted fields aligned with that boundary. Explicit confirmation alone does not
define physics tick assignment or make a replay model deterministic.

Without explicit confirmation the number stays 0. Snapshots, ordinary commands,
requests, responses and connection liveness continue independently. Use a request
result when an individual asynchronous operation needs a response. See the
[prediction guide](./realtime-movement-prediction.md) for replay, expected-state
reconciliation and diagnostics, and the [server cycle](./architecture-and-ticks.md#server-cycle).

```ts
let frame
while ((frame = client.network.processNextFrame())) {
    reconcilePredictionThrough(frame.confirmedCommandFrameNumber)
}
```

Nengi's prediction helpers use the same tick flow. `client.predictCommand(...)`
and `CommandReplayPrediction` record the command against the current
`commandFrameNumber`; when a later frame confirms that number, the helper knows
which commands are confirmed and which commands are still pending.

Use an app-level command id only when the game itself needs one, such as a
custom ability id, a UI correlation id, or a later custom message that refers to
one specific command. Ordinary movement and fire commands can usually let the
payload stay focused on gameplay input while `commandFrameNumber` and
`commandIndex` handle sequencing and prediction bookkeeping.

For commands that need server-side lag compensation, use
`client.addCommandWithTiming(command, options)` or
`client.predictCommandWithTiming(command, predictionOptions, timingOptions)`.
The timing metadata lets server code use `getCommandViewTimeMs(...)` to query a
historian around what the client was viewing when the command was authored.
Use `client.getEstimatedServerTimeMs()` when the command needs an explicit
`viewServerTimeMs`; this estimate is not required for ordinary interpolation.

Use `CommandRouter` on the server when a game has several command types and the
raw `event.commands` loop becomes repetitive:

```ts
const commands = new CommandRouter()

commands.on<MoveCommand>(NType.MoveCommand, ({ user, command }) => {
    movePlayer(user, command)
})

commands.on<GatherCommand>(NType.GatherCommand, ({ user, command }) => {
    gatherResource(user, command)
})

commands.process(event)
```

`CommandRouter` dispatches commands by `ntype` in their original order while the
user is `UserConnectionState.Open`. If a handler disconnects the user, remaining
handlers and commands for that user are skipped, including later queued batches.
`process(event)` returns the number of commands whose dispatch began; skipped
commands are excluded. A command with no registered handler still counts.

Hand-written command loops must check the same condition before each command,
including batches collected earlier in the tick:

```ts
import { UserConnectionState } from 'nengi'

for (const command of event.commands) {
    if (event.user.connectionState !== UserConnectionState.Open) break
    processCommand(event.user, command)
}
```

## Request/response

Use request/response for client-originated interactions that need a result.

Good fits:

- Open a chest.
- Move an item between inventory slots.
- Buy an item.
- Accept a quest.
- Start crafting.

Pattern:

1. Client sends request.
2. Server validates.
3. Server mutates state or subscriptions.
4. Server responds with accepted/rejected data.
5. Normal snapshots deliver resulting entities/messages.

For expected game failures, prefer normal responses like `{ accepted: false, reason: 'too_far' }` rather than throwing.

A missing response to an immediate game action (such as an inventory swap) is a
request-flow fault to investigate, not a normal gameplay denial. A timeout does
not prove rejection or cancel server work. API-style endpoints waiting on external
work may have normal deadline failures. Keep these distinct from domain outcomes.

### Client results and queued intent

`client.request(endpoint, payload, options?)` returns a Promise. Use `await` with
`try/catch`, or handle rejection in a Promise chain; there is no success-callback
form. A response settles when its snapshot is applied, after authoritative state
and request prediction reconciliation. Promise observers run asynchronously, so
the live store can already contain newer applied frames when they run. Keep the
normal client frame-processing and flush loop running while awaiting a result.

```ts
try {
    const result = await client.request(OpenChest, { chestNid }, { timeoutMs: 5000 })
    if (result.accepted) showInventory(result.inventoryNid)
    else showDenied()
} catch (error) {
    showRequestFault(error)
}
```

Choose the policy according to the meaning of the action:

| Policy | Meaning |
| --- | --- |
| `RequestPolicy.Allow` (default) | Every request has its own outcome. Use for a switch where every press toggles it. |
| `RequestPolicy.Dedupe` | With a matching `key`, return the existing outstanding Promise, even after sending. Use when another click means waiting for the same action. |
| `RequestPolicy.ReplaceQueued` | Reject matching requests still in the outbound queue as `REPLACED`, then queue the new request. Requests selected for sending or already sent keep their own results. Use for a latest desired setting such as on/off. |

Keys are client-session-wide, including across endpoints; include the action and
object identity, such as `switch:42:desired-state`. Without a key, requests remain
independent. `ReplaceQueued` can collapse multiple queued matches, but cannot
recall server work or suppress its real outcome. Handle the replaced Promises too:
`REPLACED` is expected local cancellation of unsent intent. Dedupe can suppress
presses while waiting for a response, so it is not an input-rate-independent way
to implement a toggle or a gameplay cooldown. None of these policies provide
server-side idempotency or constrain a modified client.

The timeout defaults to 10,000 ms, starts when queued, and includes waiting for
flush and frame application. `timeoutMs: 0` disables it. A timeout or disconnect
does not cancel an action already sent. The generic `HANDLER_ERROR`,
`HANDLER_REJECTED`, `RESPONSE_ENCODING_ERROR`, and `RESPONSE_TOO_LARGE` failures
also do not prove that the action had no effects: the server may have mutated
state before the reply failed. Recover from current authority and action-specific
retry rules. Do not blindly retry a purchase or restore captured old state.

### Selecting the action model

Movement, automatic fire and reload share an ordered simulation timeline; use
commands for those coupled actions. Requests and commands are ordered within
their categories, not interleaved by send-call order. Optimistic requests should
derive local display from current authority and remaining intent; blindly restoring
a captured old value on rejection can overwrite a later valid change. See the
[action model](./realtime-movement-prediction.md#fire-reload-requests-and-physics).

Requests do not have to own the resulting state. In many game features, a
request is only the validated transaction boundary. The durable result then
arrives through normal entities, messages, or channel subscription changes.
Moving an inventory item is usually a request, while the item records
inside the open inventory channels are still entities. The client UI can also
keep local-only state such as drag position, selected slot, pending/open/denied
status, or optimistic visual feedback.

Use one shared endpoint definition when the request or response has a binary
schema. Register it in the context before connecting so schema fingerprinting
can include the endpoint contract:

```ts
// shared/endpoints.ts
import { Binary, defineEndpoint, definePayloadSchema } from 'nengi'

export type OpenChestRequest = { chestNid: number }
export type OpenChestResponse = { accepted: boolean, inventoryNid: number }

export const OpenChest = defineEndpoint<OpenChestRequest, OpenChestResponse>(20, {
    requestSchema: definePayloadSchema({
        chestNid: Binary.UInt32
    }),
    responseSchema: definePayloadSchema({
        accepted: Binary.Boolean,
        inventoryNid: Binary.UInt32
    })
})
```

```ts
// shared/context.ts
const context = new Context()
context.registerEndpoint(OpenChest)
```

The server queues inbound requests when it reads a packet. It does not invoke
handlers from the adapter callback and `instance.step()` does not process the
request queue automatically. Put request processing at an explicit point before
the snapshot boundary:

```ts
instance.respond(OpenChest, ({ user, body }) => {
    return openChestForUser(user, body.chestNid)
})

function tick() {
    while (!instance.queue.isEmpty()) {
        const event = instance.queue.next()
        processConnectionOrCommandEvent(event)
    }

    instance.processRequests(100)
    stepAuthoritativeSimulation()
    instance.step()
}
```

`processRequests(max)` returns the number of dequeued requests and can bound
work per tick. A handler may return a response, call the supplied `send` callback
once, or return a promise. Promise completion queues the response later; any
authoritative mutation after `await` is outside the synchronous tick order and
should be deliberately re-entered through the game's own queue if deterministic
ordering matters.

Prefer returning a value or returning an `async` function's result. Returning
`undefined` without calling `send` leaves the request pending; for an immediate
game action this usually means a forgotten return. Retaining `send` for later is
supported deliberate deferral. Only the first chosen reply is used; a handler
failure also consumes that reply opportunity. The client timeout cannot tell a
forgotten reply from intentionally deferred work and does not cancel either.

Handler throws/rejections and response encoding/size failures are reported locally
through `instance.onRequestError`. The client receives a generic request error
when it fits the normal output budgets. See [request failures](./operations.md#request-failures).

Requests reach handlers in issue order, including across calls to
`processRequests(max)`. Synchronous responses preserve that order; deferred
responses may complete out of order and are matched to their originating
requests. Commands and requests have separate queues: alternating
`addCommand()`, `request()`, and `addCommand()` does not interleave their server
handlers. The game chooses when to drain each category. Request deduplication
or replacement policies can intentionally suppress superseded requests.

Passing a numeric endpoint id is the schema-less form. Prefer the shared endpoint
definition object for typed request/response payloads. The current API is
client-request/server-response, not bidirectional RPC: server-initiated actions
should use a command-like client message, a normal message, or replicated state.

### Validate JSON request input

JSON endpoints accept arbitrary valid JSON. A TypeScript request type constrains
your client code, not a modified client. Validate the decoded body before looking
up state or starting asynchronous work:

```ts
import type { User } from 'nengi'

instance.respond(9, ({ user, body }: { user: User, body: unknown }) => {
    if (typeof body !== 'object' || body === null || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !('chestId' in body) ||
        typeof body.chestId !== 'number' || !Number.isSafeInteger(body.chestId) || body.chestId <= 0) {
        return { accepted: false, reason: 'invalid_request' }
    }

    // This game function must check proximity/ownership using server-owned state.
    return openNearbyChest(user, body.chestId)
})
```

Apply the same field-size and nesting rules used for handshakes. Shared binary
endpoint schemas constrain payload representation, but game code must still
validate numeric ranges, permissions and whether the requested action is legal.
Bound expensive work before starting it; `processRequests(max)` limits dequeues,
not concurrent asynchronous operations. See [application budgets](./network-limits.md#application-responsibilities-and-migration).

### Complete an action before leaving

`client.disconnect()` ends the logical session immediately and discards queued nengi
work. It does not wait for a server result. If a final action matters, use a game endpoint
that responds after that action has completed, then disconnect from the client.
For a shared `FinalAction` endpoint whose response includes `accepted`:

```ts
async function finishAndLeave(payload) {
    const pending = client.request(FinalAction, payload, { timeoutMs: 5000 })
    client.flush()
    const response = await pending
    if (response.accepted) client.disconnect('finished')
    return response
}
```

Keep the normal client frame-processing loop running while this function waits:
request responses resolve when their snapshot is applied. The server must keep
processing requests and sending snapshots too. Handle rejection or timeout in
the calling UI; a missing response does not prove the action failed, and a
timeout does not cancel server work. Decide whether to retry or leave based on
the game action. The server handler should not close the connection before its
response can reach the client.

### Disconnect during an asynchronous request

Disconnect removes queued requests that have not started. A running handler's
promise continues, and nengi suppresses its eventual response after the user
closes. The application owns any effects of that operation. If applying its
result requires the original session to be connected, check immediately before
the mutation:

```ts
import { UserConnectionState } from 'nengi'

instance.respond(LoadSelection, async ({ user, body }) => {
    const selection = await loadSelection(body.selectionId)
    if (user.connectionState !== UserConnectionState.Open) return
    applySelectionToPlayer(user, selection)
    return { accepted: true }
})
```

These endpoint and game functions are application-defined. Check again after
any further `await`, or inside the game's tick queue when applying a deferred
result there. Use the original `user` object; a replacement connection is a
different session. The connection check does not undo work already performed,
such as a database write. Persistence that should finish after departure can
deliberately continue. A request timeout likewise does not cancel the handler.

## Channel

A channel answers "who can see these entities/messages?" It is not itself replicated state.

Use channels for visibility and subscription:

- World region.
- Team.
- Inventory.
- Container.
- Remote map.
- ECS world.

Do not create a channel merely because you need a replicated object. Create an entity for replicated state.

A channel has an internal channel id, allocated from the same compact id space as
entities for binary encoding. Every channel also has a replicated header
descriptor. The descriptor's `nid` is the channel id, and `channelType` is one
of nengi's `ChannelType` enum values.

On the client, use `Frame` channel buckets and `EntityStore` channel headers.
Default headers carry channel id/type metadata, and include `name` when the
server creates the channel with `name`. Use a schema-backed header object when
the client needs structured channel context, such as inventory id, owner id,
slot count, team id, or terminal mode. Schema-backed header data is sent with
channel open before normal channel entities. Choose the header when creating the
channel; mutate schema-backed header fields later and call `syncHeader()`
when those fields should replicate.

```ts
const inventory = frame.getChannel(inventoryChannelId)
const header = client.network.store.getChannelHeaderById(inventoryChannelId)
```

Treat `name` as simple creation-time metadata, not mutable game state. The
server mutates the schema-backed header object you pass in; it is not cloned on
channel creation.

When a channel closes, the client receives a channel close and purges entities
that came through that channel. The server does not send a full per-entity
delete list for the close; the client derives the purged ids from local channel
membership. `frame.closedChannels` includes the purged `entityNids` so userland
can destroy local presentation state keyed by nid.

## Schema

Schemas define how nengi serializes data. Register schemas in a shared `Context` used by both server and client.

Use:

```ts
defineEntitySchema(...)
defineMessageSchema(...)
definePayloadSchema(...)
```

Keep schema properties flat. Use ids or separate entities/components for relationships.

## Parent/child entities

Plain nengi entities can have parent/child relationships through
`Instance.attachChild(parent, child)`. This is a visibility cascade in the normal
entity model: when the parent is visible, its children become visible too.
Creates are parent-first and deletes are child-first. This is useful for
scenegraph-like objects or objects with replicated parts.

Pass the actual registered objects to `attachChild` and `detachChild`, including
the parent. A copied object with the same `nid` is not a lifecycle handle.
Keep the references returned by channel creation/attachment; let nengi assign
and clear their network ids. Invalid copies are rejected before tree or id-pool
bookkeeping changes.

Parent/child entities are not the ECS channel model. In nengi ECS channels, a
root is only an id and replicated state lives on component entities with `pid`.

## Feature decisions

Simple private inventory counters:

- If the inventory is just counts like wood, stone, gold, ammo, or berries, a private message can be enough.
- The server owns the real counts.
- Send the current counts to the owning user when they change.
- Do not create an inventory channel unless the inventory needs entity lifecycle, item metadata, multiple viewers, slots, drag/drop, or container context.

Open/shared inventory:

- If items need create/update/delete lifecycle, use a `Channel` with a header.
- If multiple users can view the same container, subscribe all authorized users to that channel.
- Use request/response for item moves so the server can accept or reject the transaction.

Player movement:

- Client sends command input.
- Server simulates movement.
- Server replicates player entity or transform component.
- Use spatial channel if visibility is position-based.

Open chest:

- Client sends request.
- Server validates distance/permissions.
- Server subscribes user to chest inventory channel, which has an inventory header.
- Server response says accepted and may include ids.
- Snapshot opens the channel with its header, then creates inventory item entities.

Explosion:

- Persistent area hazard: entity.
- One-time visual/sound event: message.
- Damage results: entity updates or messages depending on gameplay need.

Scoreboard:

- Persistent match score: entity in `Channel`.
- One-time "team scored" event: message.
