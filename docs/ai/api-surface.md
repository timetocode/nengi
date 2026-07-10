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
- `Instance`, `User`, channels, `CommandRouter`, and `NetworkEvent`
- `Client`, `ClientConnectResult`, `RequestOptions`, `Frame`, `EntityStore`, and interpolation/prediction helpers
- `EcsWorld`, `ecs`, `bindEcsChannel`, and ECS channel frame appliers

The application owns the game loop, authoritative state, renderer, ECS systems,
and effects. Nengi supplies transport-neutral network state and snapshot facts.

## Integration tier

Use these when implementing or configuring an adapter:

- `IClientNetworkAdapter` and `ClientAdapterConstructor`
- `IServerNetworkAdapter`
- `BinaryAdapter`, `IBinaryReader`, and `IBinaryWriter`
- `BinaryPayload` and `ProtocolConfig`

Official socket and binary packages should be kept at the exact same RC version
as `nengi`.

## Advanced tier

Use these deliberately and test them against the game's workload:

- `ManualChannel*` and generated component/entity writers
- `Historian2D` / `Historian3D`
- `PublicPositionSmoother2D`
- `ClientNetwork`, `InstanceNetwork`, `EntityHistory`, and playback details
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
internal serializer functions. Compose application-specific presentation and
prediction code around the raw `EntityStore` and `Frame` APIs, while keeping
snapshot order visible at the application boundary.
