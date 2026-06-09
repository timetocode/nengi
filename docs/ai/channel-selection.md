# Channel selection

Choose the simplest channel that expresses who should see what. A faster-looking channel can be worse if it adds bookkeeping the game does not need.

## Quick table

| Situation | Use |
| --- | --- |
| Everyone subscribed sees every entity, and automatic diffing is fine | `Channel` |
| Everyone subscribed sees every entity, and game code explicitly knows hot mutations | `ManualChannel` |
| Visibility depends on 2D position or an `xy`/`xz` plane | `SpatialChannel2D` |
| 2D/projected spatial visibility plus explicit hot mutations | `ManualSpatialChannel2D` |
| Visibility depends on true 3D position | `SpatialChannel3D` |
| True 3D spatial visibility plus explicit hot mutations | `ManualSpatialChannel3D` |
| ECS roots are ids and component state is manually updated | `EcsChannel` |
| ECS roots are culled by a spatial component | `EcsSpatialChannel2D` or `EcsSpatialChannel3D` |

## `Channel`

Use `Channel` when all subscribed users should see all entities in that channel.

Good fits:

- Match-wide scoreboard state.
- Team data for one team channel.
- Small arenas where every player sees every gameplay entity.
- Inventory/container state after a user opens a container.
- Early implementation before profiling.

Avoid when:

- The channel contains tens or hundreds of thousands of entities and most users only see a small area.
- The game already has clear mutation points and snapshot scanning is hot.

## `ManualChannel`

Use `ManualChannel` when visibility is all-visible within the channel, but updates should be explicit.

Good fits:

- Many users subscribe to the same channel and the same hot updates fan out to all of them.
- Game systems already mutate state in one known place.
- Transform-like properties dominate network traffic and can use update groups.

Avoid when:

- Mutations happen in many disconnected places and the game cannot reliably call writers.
- Correctness is still being built and automatic diffing is safer.
- Very few entities/users exist and scanning cost is irrelevant.

## `SpatialChannel2D`

Use `SpatialChannel2D` when a user's view determines which entities are relevant in 2D.

Good fits:

- Top-down games.
- Side scrollers using constant `y` or simple view rectangles.
- 3D games where horizontal culling is enough using the `xz` plane.
- Large worlds where each user sees a small portion.

Avoid when:

- Everyone sees most entities.
- Entity counts are small.
- Visibility is by team, ownership, quest, inventory, or permissions rather than position.

## `ManualSpatialChannel2D`

Use this when spatial culling matters and game code can explicitly write mutations.

Good fits:

- Large 2D/projected worlds with rare or explicit mutations.
- Many users clustered by area where shared cell fragments help.
- Movement systems where transform writes are centralized.

Avoid when:

- You are still prototyping core state and might forget writer calls.
- Most users see most cells.

## `SpatialChannel3D`

Use `SpatialChannel3D` when vertical visibility matters.

Good fits:

- Space games.
- Flight games.
- Voxel worlds.
- Any game where objects above/below the player should be culled.

Avoid when:

- The game is 3D visually but visibility is effectively horizontal. In that case, `SpatialChannel2D` on the `xz` plane is usually simpler.

## `ManualSpatialChannel3D`

Use this for true 3D worlds where spatial culling and explicit mutation writes both matter.

Good fits:

- Large 3D worlds with high user counts and low mutation fractions.
- Space or voxel games where most entities are outside most users' spherical views.

## ECS channels

Use `EcsChannel` only if the game matches nengi's ECS contract: roots are network ids, and replicated state lives on component entities with `pid`.

Use `EcsSpatialChannel2D/3D` when a component, usually a transform-like component, determines root visibility.

Do not use ECS channels just because the game has objects with child data. Parent/child entity trees and nengi ECS channels are different models.

## Combine channels

A real game often uses multiple channels:

- Main world: `SpatialChannel2D` or `SpatialChannel3D`.
- Private inventory: `Channel`.
- Team-only state: one `Channel` per team.
- Map UI or remote camera: a second spatial channel with its own view.
- High-frequency combat transforms: manual spatial channel if profiling justifies it.

This is normal. Keep each channel's visibility rule clear.

## Start simple, optimize later

When uncertain, begin with `Channel` or `SpatialChannel2D/3D`. After the feature works, benchmark the real pattern. If the benchmark shows snapshot cost is hot and game code has clear mutation points, switch to the matching manual channel.
