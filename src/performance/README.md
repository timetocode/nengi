# Performance Harnesses

These scripts are local profiling tools for nengi hot paths. They are not
product tests and their numbers are machine-dependent. Use them to compare
variants on the same machine in the same session.

## Snapshot Pipeline

`SnapshotPipeline.performance.ts` measures server-side snapshot production
without WebSocket or client processing cost. It uses real `Instance`, `User`,
channels, entity schemas, entity cache, diffing, byte counting, and binary
writing. The only mocked part is the network adapter: it counts sends and bytes
and then discards the buffer.

Run from the `nengi` package:

```bash
npm run profile:snapshot
```

Useful knobs:

```bash
PROFILE_SCENARIO=shared-npcs     # shared-npcs | players-300 | sparse-visible | non-overlap | spatial-channel | spatial-channel-3d | spatial-grid-channel | spatial-grid-channel-3d | manual-channel | manual-spatial-channel | ecs-channel | ecs-spatial-channel
PROFILE_USERS=20
PROFILE_ENTITIES=1000
PROFILE_VISIBLE=1000
PROFILE_CELL_SIZE=50
PROFILE_VIEW_HALF=47
PROFILE_CHURN=100
PROFILE_CHILDREN=1
PROFILE_SPATIAL_DISTRIBUTION=homogeneous  # default | single-cell | centered-cell | homogeneous | clustered
PROFILE_SPATIAL_PLANE=xy       # xy | xz
PROFILE_WORLD_SIZE=5000
PROFILE_CLUSTERS=8
PROFILE_MOVE_FRACTION=1
PROFILE_QUERY_PADDING=0
PROFILE_FRAGMENT_CELL_LIMIT=16
PROFILE_STABLE_FRAGMENT_CELL_LIMIT=64
PROFILE_MANUAL_EMIT=group4      # group4 | props
PROFILE_TICKS=300
PROFILE_WARMUP=60
PROFILE_SHARED_UPDATES=0
PROFILE_GROUPS_OFF=0
npm run profile:snapshot
```

Scenarios:

- `shared-npcs`: all users see the same moving entities. Good for fanout and
  grouped transform update testing.
- `players-300`: default shape matches the all-visible player stress profile:
  300 users, 302 visible entities.
- `sparse-visible`: many entities mutate, but users see only a small fixed set.
  This is useful for avoiding global-diff designs that would scan the whole
  world.
- `non-overlap`: users each see a different fixed slice. This tests whether an
  optimization only helps shared visibility.
- `spatial-channel`: whole-cell spatial visibility workload through `SpatialChannel`,
  using per-cell create/update/delete fragments.
  `PROFILE_STABLE_FRAGMENT_CELL_LIMIT` allows stable views to use more copied
  cell fragments than unstable CRUD frames, while keeping broad churny views on
  the normal reconciliation path.
- `spatial-channel-3d`: true volumetric `SpatialChannel3D` workload using
  `AABB3D` views and `x:y:z` cell keys. This is the control for games that
  need vertical culling rather than horizontal projection.
- `spatial-grid-channel` and `spatial-grid-channel-3d`: experimental
  comparison channels backed by the shared `SpatialGrid` core. They exist to
  benchmark whether extracting cell bookkeeping costs too much on hot paths.
- `channel-churn`: all users share one plain all-visible channel while the
  server removes and adds `PROFILE_CHURN` roots per tick. `PROFILE_CHILDREN`
  attaches child entities to each created root so create/delete fragments cover
  parent-first creates and child-first deletes.
- `manual-channel`: all users share one experimental `ManualChannel`.
  Membership still uses normal `addEntity`/`removeEntity`; the manual path is
  only for explicit update writes. The benchmark assigns transform props
  directly and records a generated update writer from `channel.type(ntype,
  schema).transform`, then the snapshot path writes that manual log directly
  without diffing, cloning, schema-name lookup, or cache updates. The generated
  type object also exposes `props` and `groups` namespaces when a schema name
  collides with a reserved/root name.
- `manual-spatial-channel`: experimental manual spatial channel. Users
  subscribe with AABB views, entities are bucketed by cell, and generated
  manual writers record updates into per-cell logs. Stable-view snapshots skip
  generic visibility/diff collection and copy only dirty visible cell fragments.
  `PROFILE_MANUAL_EMIT=props` emits the same transform as four manual single
  prop writes instead of one grouped write, which is useful for comparing binary
  representations.
- `parent-child-channel`, `parent-child-manual-channel`,
  `parent-child-spatial-channel`, and `parent-child-manual-spatial-channel`:
  parent/child variants for the four intended public channel shapes.
  `PROFILE_ENTITIES` is the number of parent roots and `PROFILE_CHILDREN`
  attaches that many child entities to each root. The steady-state benchmark
  mutates roots and children so child update costs are visible.
- `wide-channel`, `wide-manual-channel`, `ecs-manual-channel`, `ecs-channel`,
  `wide-manual-spatial`, and `ecs-manual-spatial`: compare equivalent
  transform/vitals/loadout state as one wider entity versus ECS-shaped state.
  `wide-channel` is the normal automagic `Channel` scan/diff control;
  `ecs-manual-channel` uses the older root-with-child-components model;
  `ecs-channel` uses the dedicated `EcsChannel`, where the root is only a pid
  and transform/vitals/loadout are component entities. `PROFILE_ENTITY_SHAPE`
  can also select the shape explicitly, but these scenarios set the intended
  shape by default.
- `ecs-channel-churn`: fixed-size `EcsChannel` population where each tick
  removes and creates `PROFILE_CHURN` ECS roots with transform/vitals/loadout
  components. Root deletes imply component deletes on the wire.
- `ecs-spatial-channel`: dedicated spatial ECS channel. Root visibility comes
  from the spatial component, while transform/vitals/loadout component updates
  are written as typed ECS component group sections per visible dirty cell.

Output is JSON and includes:

- `stepMs`: avg/p50/p95/max for `instance.step()`
- `preStepMs`: avg/p50/p95/max for benchmark pre-step work
- `preStepPlusStepMs`: pre-step work plus `instance.step()`
- `totalMs`: pre-step work plus spatial index work plus `instance.step()`
- `bytesPerSnapshot` and `bytesPerTick`
- per-snapshot collect/count/write/send timing from the existing snapshot
  metrics
- per-snapshot commit timing, plus create/delete counts
- shared update-fragment build/hit/copy timing when
  `PROFILE_SHARED_UPDATES=1`
- message/engine-message/response counts per snapshot
- average update prop/group counts

Examples:

```bash
PROFILE_SCENARIO=shared-npcs PROFILE_USERS=20 PROFILE_ENTITIES=1000 npm run profile:snapshot
PROFILE_SCENARIO=sparse-visible PROFILE_ENTITIES=50000 PROFILE_VISIBLE=200 npm run profile:snapshot
PROFILE_SCENARIO=non-overlap PROFILE_USERS=100 PROFILE_ENTITIES=10000 PROFILE_VISIBLE=100 npm run profile:snapshot
PROFILE_SCENARIO=channel-churn PROFILE_USERS=100 PROFILE_ENTITIES=1000 PROFILE_CHURN=100 PROFILE_CHILDREN=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=channel-churn PROFILE_USERS=100 PROFILE_ENTITIES=1000 PROFILE_CHURN=100 PROFILE_CHILDREN=1 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=manual-channel PROFILE_USERS=50 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=manual-channel PROFILE_MANUAL_EMIT=props PROFILE_USERS=50 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=wide-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=wide-manual-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=ecs-manual-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel-churn PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_CHURN=100 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=ecs-spatial-channel PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_USERS=100 PROFILE_ENTITIES=500000 PROFILE_VIEW_HALF=640 PROFILE_CELL_SIZE=512 PROFILE_WORLD_SIZE=8192 PROFILE_MOVE_FRACTION=0.01 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=manual-spatial-channel PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_USERS=100 PROFILE_ENTITIES=500000 PROFILE_VIEW_HALF=640 PROFILE_CELL_SIZE=512 PROFILE_WORLD_SIZE=8192 PROFILE_MOVE_FRACTION=0.01 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
```

Interpretation notes:

- This harness is best for server architecture work. It will not expose
  WebSocket backpressure, bot CPU saturation, or client decode/apply cost.
- Compare variants by running them back-to-back. Absolute numbers are less
  useful than ratios.
- Keep experimental variants short-lived until they beat the current per-user
  snapshot path across both shared and non-overlapping visibility shapes.
- Unknown `PROFILE_SCENARIO` values throw immediately. A typo can otherwise
  turn a sparse control into a shared-channel test and make the numbers look
  better than the workload actually is.
- `PROFILE_SHARED_UPDATES=1` exercises the opt-in shared update-fragment
  prototype for plain all-visible channels. It intentionally does not apply to
  culled or fixed-visible channels. The prototype reuses complete encoded
  update sections when channel membership is stable, relying on the client
  reader's existing support for repeated snapshot sections.
