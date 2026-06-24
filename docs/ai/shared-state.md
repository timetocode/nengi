# Shared state and nengi schemas

Use this when defining replicated game state, commands, messages, requests, and
their nengi schemas.

## Rule

Keep the TypeScript shape and the nengi schema beside each other.

If a property exists in replicated state, the nearby schema should say how that
property is encoded. If a property is renamed, added, or removed, the type and
schema should be edited in the same file during the same change.

Do not put all TypeScript state in one file and all nengi schemas in another
large file once a game has more than a few network types. That split is easy to
read at first, but it invites drift: a field can change in the type while the
schema silently keeps the old name or binary type.

Use "nengi schema" and "nengi context" in public docs and generated code. If a
project team says "n schema" or "n context" informally, treat that as shorthand
for the same thing.

## Plain replicated objects

For ordinary channels, the replicated object is the network entity. Put the
entity type, nengi schema, and create function together.

```ts
// shared/entities/player.ts
import { Binary, defineEntitySchema } from 'nengi'
import { NType } from '../ntype'

export type PlayerEntity = {
    nid: number
    ntype: NType.Player
    x: number
    y: number
    hp: number
}

export const PlayerSchema = defineEntitySchema({
    x: Binary.Float32,
    y: Binary.Float32,
    hp: Binary.UInt8
})

export function createPlayer(x: number, y: number): PlayerEntity {
    return {
        nid: 0,
        ntype: NType.Player,
        x,
        y,
        hp: 100
    }
}
```

The context file should register exported schemas. It should not become the
only place where schemas are defined.

```ts
// shared/context.ts
import { Context } from 'nengi'
import { NType } from './ntype'
import { PlayerSchema } from './entities/player'

export function createContext() {
    const context = new Context()
    context.register(NType.Player, PlayerSchema)
    return context
}
```

Plain object entities may have server-only or client-only neighbors, but those
neighbors are not the replicated entity unless they have `nid`, `ntype`, and a
registered nengi schema.

## ECS replicated components

For nengi ECS channels, the ECS root entity is only an id. Replicated state
lives on components. Put the component type, nengi schema, component type
descriptor, and create function together.

```ts
// shared/components/transform.ts
import {
    Binary,
    ecs,
    defineEntitySchema
} from 'nengi'
import { NType } from '../ntype'

export type TransformComponent = {
    nid: number
    pid: number
    ntype: NType.Transform
    x: number
    y: number
    rotation: number
    radius: number
}

export const TransformSchema = defineEntitySchema({
    x: Binary.Float32,
    y: Binary.Float32,
    rotation: Binary.Float32,
    radius: Binary.Float32
})

export const Transform = ecs.defineComponent<TransformComponent>(
    NType.Transform,
    'Transform'
)

export function createTransform(
    x: number,
    y: number,
    radius: number
): Omit<TransformComponent, 'pid'> {
    return {
        nid: 0,
        ntype: NType.Transform,
        x,
        y,
        rotation: 0,
        radius
    }
}
```

Prefer plain object components for replicated state. A component may be a class
instance if it exposes `pid`, `ntype`, optional `nid`, and schema fields directly,
but hidden class methods should not obscure where channel writers are called.

Do not put component writers in shared component files. Writers are bound to a
specific server channel instance.

```ts
// server/world.ts
const TransformWriter = worldChannel.createComponentWriter(
    NType.Transform,
    context.getSchema(NType.Transform)!
)
```

The client and server can both import `Transform` for queries. The server alone
creates writers for the channel it authors.

## Messages, commands, and requests

Keep protocol payloads beside their schemas too.

```ts
// shared/messages/shot.ts
import { Binary, defineMessageSchema } from 'nengi'
import { NType } from '../ntype'

export type ShotEventMessage = {
    ntype: NType.ShotEvent
    x: number
    y: number
    angle: number
}

export const ShotEventSchema = defineMessageSchema({
    x: Binary.Float32,
    y: Binary.Float32,
    angle: Binary.Float32
})
```

Use the same pattern for high-frequency commands and request/response bodies.
The payload type and schema should tell the same story.

## Client-only and server-only state

Not every component or object is networked.

Use shared replicated files for state that crosses the network:

- plain entity types with `nid`, `ntype`, and a nengi schema
- ECS component types with `nid`, `pid`, `ntype`, and a nengi schema
- message, command, request, and response payloads with registered schemas

Use server-only files for authoritative state that clients never receive:

- spawn timers
- AI state
- cooldown bookkeeping
- connection indexes
- server-only ECS components
- ECS resources aka singletons, such as historian or validation state

Use client-only files for local state that the server never receives:

- sprites and presentation records
- local prediction state
- input state
- camera state
- UI state
- client-only ECS components
- ECS resources aka singletons, such as renderer, scene, or UI service references

Server-only and client-only state should not have a nengi schema. If it later
needs to cross the network, move it to a shared replicated file and define the
schema beside it.

## Suggested folder shape

Small games can keep this in a few files. Larger games should prefer folders
that keep related truth together:

```txt
shared/
  ntype.ts
  context.ts
  entities/
    player.ts
    resourceNode.ts
  components/
    transform.ts
    health.ts
    inventoryItem.ts
  messages/
    shotEvent.ts
  commands/
    playerInput.ts
  requests/
    inventoryMove.ts
server/
  components/
    aiState.ts
    spawnState.ts
client/
  components/
    spriteRecord.ts
    predictedTransform.ts
```

For a tiny prototype, one `shared/schema.ts` file is acceptable. As soon as a
game has several network types, colocate each type with its schema before the
schema file becomes a dumping ground.
