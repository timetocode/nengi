# API surface

Import Nengi from the package root:

```ts
import {
    Channel2D,
    Client,
    Context,
    EcsWorld,
    Instance,
    bindEcsChannel,
    defineEntitySchema,
    ecs
} from 'nengi'
```

Deep imports into `nengi/src` or `nengi/build` are not part of the package
contract. The root also exports advanced types because adapter authors and
profiling tools need them; application code should use the smallest tier that
matches its job.

## Application tier

Use these for ordinary game or service code:

- `Context`, schemas, `defineEndpoint`, and protocol payload types
- `Instance`, `InstanceOptions`, `InstanceStepError`, `ConnectionAcceptance`, `ConnectionDenial`, `ConnectionAttemptContext`, `User`, channels, `CommandRouter`, and `NetworkEvent`
- `user.confirmCommandsThrough(K)`, `user.lastReceivedCommandFrameNumber`, and
  `user.lastConfirmedCommandFrameNumber` for explicit command completion when
  using command/state prediction or application completion tracking
- `Client`, `ClientOptions`, `ClientConnectOptions`, `ClientConnectionState`, `ClientConnectionError`, `ClientConnectionCode`, `ClientDisconnectInfo`, `RequestOptions`, `Frame`, `EntityStore`, and interpolation/prediction helpers
- `TimeSource`, `client.getEstimatedServerTimeMs()`, and `client.getClockSync()`
- `EcsWorld`, `ecs`, `bindEcsChannel`, and ECS channel frame appliers

The application owns the game loop, authoritative state, renderer, ECS systems,
and effects. Nengi supplies transport-neutral network state and snapshot facts.

## Integration tier

Use these when implementing or configuring an adapter:

- `IClientNetworkAdapter`, `ClientAdapterConstructor`, and `ClientTransportHandlers`
- `IServerNetworkAdapter`, `ServerAdapterHost`, and `ServerConnection`
- `BinaryAdapter`, `IBinaryReader`, and `IBinaryWriter`
- `BinaryPayload`, `ProtocolConfig`, and `WIRE_PROTOCOL_VERSION`

Official socket and binary packages declare compatible core ranges and release
independently. See [package compatibility](./package-compatibility.md).

## Advanced tier

Use these deliberately and test them against the game's workload:

- `ManualChannel*` and generated component/entity writers
- `Historian2D` / `Historian3D`
- `PublicPathSmoother2D` / `PublicPathSmoother3D`, including atomic `enqueueRoute`
- `client.network` / `instance.network` observations and supported controls,
  `EntityHistory`, and playback details
- `InterpolationOutput` and `interpolator.sampleEntitiesInto(...)` for reusable
  presentation storage; see [output lifetime](./client-state.md#reusable-presentation-output)
- schema fingerprint descriptions and binary diagnostics

These APIs expose useful control, but they also expose more responsibility. The
AI should not introduce them merely because they sound faster or more general.

## Test tier

Use `LocalInstanceAdapter` and `LocalClientAdapter` for in-memory tests and
embedded simulations. They exercise the normal handshake, request, command,
snapshot, and binary paths without opening a socket. `MockInstanceAdapter` and
`MockClientAdapter` are compatibility aliases; new code should use the `Local*`
names.

Keep a strict boundary around these tiers. Application code should not import
internal serializer or snapshot-header functions. Compose application-specific presentation and
prediction code around the raw `EntityStore` and `Frame` APIs, while keeping
snapshot order visible at the application boundary.

## Engine-owned state

`User`, `ClientNetwork` and `InstanceNetwork` are root-exported **types**, not
constructors. Obtain them from lifecycle events, `instance.users`,
`client.network`, or `instance.network`. A game never needs to create its own
network or inject a user into an instance.

| Surface | Supported access |
| --- | --- |
| `client.network` | `drainFrames`, `processNextFrame`, `getPendingFrameCount`, read-only `frames` / `latestFrame`, `store`, `commandFrameNumber`, timing observations |
| Client tuning | `maxFrameHistory`, `requestTimeoutMs`, interpolation delay reporting thresholds, `sendSchemaFingerprint`, `onRequestBacklog` |
| Client construction | `ClientOptions.entityHistory` defaults to true; [disable entity recording](./client-state.md#games-that-own-their-history) when the game owns its history |
| `instance.network` | `getPendingConnectionCount`, `getQueueStats`, `requireSchemaFingerprint`, `diagnosticBinaryWrites`, `sharedUpdateFragmentsEnabled`, `snapshotPerformanceEnabled`, read-only `snapshotPerformance`, `resetSnapshotPerformance`, `onResponseBacklog` |
| `User` | Read identity, address, connection status, timing and command boundaries; confirm completed commands, queue application messages, disconnect |
| Server membership | Read-only `instance.users`; consume `instance.queue` with `next`/`dequeue`/`removeWhere`/`clear`; admission and enqueueing belong to core |
| Custom transports | `instance.adapterHost`, through the [server adapter contract](./adapters.md#server-adapter-contract-version-1) |

Call `client.addCommand`, `client.addCommandWithTiming`, `client.request`,
`client.flush` and prediction methods on `Client`. Internal duplicates on the
network, mutable queues/maps, fragment caches, packet encoders/decoders and engine
control messages are not application extension points. `EngineMessage`,
`BinarySection` and internal protocol read/write helpers are not root exports.

`addCommand` and `addCommandWithTiming` return the zero-based command index in the
current batch. Custom prediction journals can capture
`client.network.commandFrameNumber` before enqueueing and retain the returned
index. The index counts commands only; requests and engine controls do not share
that order. A successful flush starts another batch. Built-in prediction methods
still return their prediction operation.

Read-only declarations and omitted internal members define supported use; they
are not a JavaScript security sandbox. No runtime freezing, deep copies or proxy
objects are added. Received values remain read-only by contract; copy them before
mutating presentation state. See [client state](./client-state.md).
