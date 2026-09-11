# Performance Harnesses

These scripts are local profiling tools for nengi hot paths. They are not
product tests and their numbers are machine-dependent. Use them to compare
variants on the same machine in the same session.

## Client History

`ClientHistoryWorkload.ts` exercises real client frame application and retained
history without a transport or renderer. Run one scenario and phase at a time:

```bash
PROFILE_SCENARIO=sparse PROFILE_PHASE=prune npm run profile:history
PROFILE_SCENARIO=sparse PROFILE_PHASE=sample npm run profile:history
PROFILE_CHROMIUM_PATH=/absolute/path/to/chrome PROFILE_SCENARIO=sparse PROFILE_PHASE=sample npm run profile:history:browser
```

Scenarios are `stationary`, `sparse` (one percent changing), `dense` (all
changing), `churn` (delete/create with reused IDs and periodic channel close/open),
`ecs` (three components per root, one percent changing), and `selective` (sample
at most 500 IDs from a larger sparse population). Defaults are 50,000 entities,
or 10,000 for `dense` and `ecs`, 240 history frames, 60 warmup iterations, and
120 measured iterations. Override with `PROFILE_ENTITIES`,
`PROFILE_HISTORY_FRAMES`, `PROFILE_WARMUP`, and `PROFILE_ITERATIONS`.

The prune phase reports both the whole frame-processing duration and its nested
pruning duration, so the cost of recording the expiration index is included in
the whole-frame measurement. Synthetic snapshot construction is outside that
measurement. The sample phase uses fixed retained history and three playback
positions per frame interval (20 Hz receive / 60 Hz render), isolating sampling
from receive cost. It includes sample diagnostics but does not model live
arrival jitter, a renderer, or wall-clock playback scheduling.

Output includes p50/p95/p99/max, timeline and record counts, expiration-index
counts, and heap readings before/after explicit GC. Heap readings measure
retained memory and transient heap occupancy, **not total allocated bytes or GC
pause duration**. Browser timings below the clock's resolution can report zero.
The Node command exposes GC; the browser runner uses a fresh headless Chromium
process and profile, and requires a local Chromium executable. Chromium runs
without its sandbox for compatibility with local container environments.

For a before/after comparison, copy these two workload files into a clean
baseline checkout's `src/performance` directory and run the same configurations
sequentially on the same machine. The browser runner accepts
`PROFILE_SOURCE_ROOT=/absolute/path/to/baseline`; the Node entry can be run from
that checkout using the current checkout's tsx loader. Do not benchmark both
versions concurrently. Dense workloads retain millions of records and require
substantial heap space. Keep full JSON results outside the published package.

## Snapshot Pipeline

`SnapshotPipeline.performance.ts` measures server-side snapshot production
without WebSocket or client processing cost. It uses real `Instance`, `User`,
channels, entity schemas, entity cache, diffing, byte counting, and binary
writing. The only mocked part is the network adapter: it counts sends and bytes
and then discards the buffer.

Each measured tick contributes one pre-step, index and snapshot duration;
inactive stages contribute zero. Combined statistics summarize the sums of
matching ticks. They exclude harness bookkeeping outside the measured stages.
Separate decode/apply tests establish output correctness for the fixed-membership
workloads; timing and byte counts alone do not establish correctness.

Spatial ECS lifecycle workloads also have decode/apply checks in
`SnapshotPipeline.test.ts`. They cover 2D/3D, shared/direct output, root or
component replacement, and writes before/after removal. Removed objects must
have survived an earlier snapshot; no benchmark relies on creating and removing
the same object in one tick.

To measure structural work in the existing pipeline, use `ecs-channel-2d`,
`ecs-channel-3d`, or `ecs-channel-clump` with these additional options:

```bash
PROFILE_SCENARIO=ecs-channel-2d PROFILE_USERS=20 PROFILE_ENTITIES=1000 \
PROFILE_SPATIAL_DISTRIBUTION=single-cell PROFILE_CELL_SIZE=512 PROFILE_VIEW_HALF=1024 \
PROFILE_SHARED_UPDATES=1 PROFILE_CHURN=100 PROFILE_ECS_CHURN=components \
PROFILE_ECS_CHURN_ORDER=after-writes PROFILE_ECS_MATERIALIZE=0 \
PROFILE_WARMUP=200 PROFILE_TICKS=600 npm run profile:snapshot
```

`PROFILE_ECS_CHURN` is `none` (default), `roots`, or `components`. Root replacement
replaces the root and its three components; component replacement replaces only
vitals on a surviving root. Replacement copies current gameplay values so it
preserves the intended movement workload. `PROFILE_CHURN` is the number replaced
per tick, capped at the population; it remains zero by default in spatial ECS
scenarios. Every root still has three live components after replacement.

`PROFILE_ECS_CHURN_ORDER` is `before-writes` or `after-writes` (default).
`PROFILE_ECS_MATERIALIZE=1` calls a public visibility query after writes and before
removal; it requires `after-writes`. This exercises already-built cell logs as
well as ordinary pending writes. These options default off and do not change
the existing fixed-membership workloads. Full and summary output report the
chosen structural settings alongside mutation, snapshot, and total timings.

For comparisons, hold this harness and its binary backend identical across
source revisions, use fresh sequential processes, rotate variant order, and
report both p50 and p95 with individual repeats. An untouched old release measures
all intervening changes; a control changing only the suspected code is needed to
attribute a difference. Output counts and bytes help characterize a workload,
but fewer updates are not automatically a correctness or performance improvement.

Run from the `nengi` package:

```bash
npm run profile:snapshot
```

Useful knobs:

```bash
PROFILE_SCENARIO=shared-npcs     # shared-npcs | players-300 | sparse-visible | non-overlap | channel-2d | channel-3d | manual-channel | manual-channel-2d | manual-channel-3d | ecs-channel | ecs-channel-2d | ecs-channel-clump
PROFILE_SUITE=spatial-fanout     # optional: run channel-2d, manual-channel-2d, and ecs-channel-2d back-to-back
PROFILE_USERS=20
PROFILE_ENTITIES=1000
PROFILE_VISIBLE=1000
PROFILE_CELL_SIZE=50
PROFILE_VIEW_HALF=47
PROFILE_CHURN=100
PROFILE_CHILDREN=1
PROFILE_SPATIAL_DISTRIBUTION=homogeneous  # default | single-cell | centered-cell | cell-corner | cell-crossing | homogeneous | clustered
PROFILE_SPATIAL_PLANE=xy       # xy | xz
PROFILE_VIEW_SHAPE=aabb        # aabb | circle | sphere
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
PROFILE_OUTPUT=summary        # optional: compact JSON for quick comparisons
npm run profile:snapshot
```

Scenarios:

- `shared-npcs`: all users see the same moving entities. Good for fanout and
  grouped transform update testing.
- `players-300`: default shape matches the all-visible player stress profile:
  300 users, 302 visible entities.
- `sparse-visible`: all users subscribe to one ordinary `Channel` containing
  the first `min(PROFILE_VISIBLE, PROFILE_ENTITIES)` entities. Remaining entities
  belong to an unsubscribed channel. The entire population mutates, but only the
  subscribed set should be diffed. This models fixed room membership, not spatial
  visibility-query cost.
- `non-overlap`: each user subscribes to a separate ordinary `Channel` with a
  disjoint slice of `PROFILE_VISIBLE` entities. Unassigned entities belong to an
  unsubscribed channel. Requires `PROFILE_ENTITIES >= PROFILE_USERS * PROFILE_VISIBLE`;
  invalid configurations throw rather than silently reusing entities across views.
  Without an explicit visible count, it uses `floor(entities / users)`. Compare
  this against shared membership to assess fragment reuse with different audiences.
- `channel-2d`: whole-cell spatial visibility workload through `Channel2D`,
  using per-cell create/update/delete fragments.
  `PROFILE_STABLE_FRAGMENT_CELL_LIMIT` allows stable views to use more copied
  cell fragments than unstable CRUD frames, while keeping broad churny views on
  the normal reconciliation path.
  `PROFILE_VIEW_SHAPE=circle` uses coarse circular cell selection for 2D or
  projected views.
- `channel-3d`: true volumetric `Channel3D` workload using
  `AABB3D` views and `x:y:z` cell keys. This is the control for games that
  need vertical culling rather than horizontal projection. `PROFILE_VIEW_SHAPE=sphere`
  uses coarse spherical cell selection.
- `Channel2D` and `Channel3D` are backed by the shared
  `SpatialGrid` core; the older grid comparison channels were removed after the
  retained spatial channels adopted the same bookkeeping.
- `channel-churn`: all users share one plain all-visible channel while the
  server removes and adds `PROFILE_CHURN` roots per tick. `PROFILE_CHILDREN`
  attaches child entities to each created root so create/delete fragments cover
  parent-first creates and child-first deletes.
- `manual-channel`: all users share one experimental `ManualChannel`.
  Membership still uses normal `addEntity`/`removeEntity`; the manual path is
  only for explicit update writes. The benchmark assigns transform props
  directly and records a generated update writer from
  `channel.createEntityWriter(ntype, schema).transform`, then the snapshot path writes that manual log directly
  without diffing, cloning, schema-name lookup, or cache updates. The generated
  type object also exposes `props` and `groups` namespaces when a schema name
  collides with a reserved/root name.
- `manual-channel-2d`: experimental manual spatial 2D/projected channel. Users
  subscribe with AABB views, entities are bucketed by cell, and generated
  manual writers record updates into per-cell logs. Stable-view snapshots skip
  generic visibility/diff collection and copy only dirty visible cell fragments.
  `PROFILE_MANUAL_EMIT=props` emits the same transform as four manual single
  prop writes instead of one grouped write, which is useful for comparing binary
  representations.
- `manual-channel-3d`: true 3D manual spatial channel using AABB or
  sphere views and `x:y:z` cell keys.
- `parent-child-channel`, `parent-child-manual-channel`,
  `parent-child-channel-2d`, and `parent-child-manual-channel-2d`:
  parent/child variants for the four intended public channel shapes.
  `PROFILE_ENTITIES` is the number of parent roots and `PROFILE_CHILDREN`
  attaches that many child entities to each root. The steady-state benchmark
  mutates roots and children so child update costs are visible.
- `wide-channel`, `wide-manual-channel`, `ecs-manual-channel`, `ecs-channel`,
  `wide-manual-channel-2d`, and `ecs-manual-channel-2d`: compare equivalent
  transform/vitals/loadout state as one wider entity versus ECS-shaped state.
  `wide-channel` is the normal automagic `Channel` scan/diff control;
  `wide-manual-channel` is useful in two modes. With
  `PROFILE_SHARED_UPDATES=1`, it is the intended high-fanout manual-channel
  shape: one encoded manual update stream is shared across users. With
  `PROFILE_SHARED_UPDATES=0`, it is a deliberate worst-case fanout control that
  rewrites the same large manual payload per user. Keep that variant for
  detecting regressions and understanding costs, but do not treat it as a
  recommended game architecture.
  `ecs-manual-channel` uses the older root-with-child-components model;
  `ecs-channel` uses the dedicated `EcsChannel`, where the root is only a pid
  and transform/vitals/loadout are component entities. `PROFILE_ENTITY_SHAPE`
  can also select the shape explicitly, but these scenarios set the intended
  shape by default.
- `ecs-channel-churn`: fixed-size `EcsChannel` population where each tick
  removes and creates `PROFILE_CHURN` ECS roots with transform/vitals/loadout
  components. Root deletes imply component deletes on the wire.
- `ecs-channel-2d`: dedicated spatial ECS 2D/projected channel. Root visibility comes
  from the spatial component, while transform/vitals/loadout component updates
  are written as typed ECS component group sections per visible dirty cell.
- `ecs-channel-clump`: worst-case 2D spatial ECS fanout profile. Defaults to
  350 users controlling 350 ECS roots in one visible cell, with every root
  moving every tick. Spatial culling intentionally provides no benefit here;
  this profile exists to watch cell-fragment reuse under clumped CCU pressure.
  Override `PROFILE_USERS` and `PROFILE_ENTITIES` together for 250-450 player
  variants.
Suites:

- `spatial-fanout`: runs `channel-2d`,
  `manual-channel-2d`, and `ecs-channel-2d` with the
  same profile knobs, then prints one JSON result bundle. Use this for direct
  clumped fanout and distributed spatial comparisons.

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

Set `PROFILE_OUTPUT=summary` to print only the scenario/config identity and
the highest-signal timing, byte, fragment, and update-count fields. This is
better for quick local comparison and AI-assisted review; omit it when you need
the full breakdown.

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
PROFILE_SCENARIO=wide-manual-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=ecs-manual-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_MOVE_FRACTION=1 PROFILE_SHARED_UPDATES=0 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel-churn PROFILE_USERS=20 PROFILE_ENTITIES=10000 PROFILE_CHURN=100 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel-clump npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel-clump PROFILE_USERS=450 PROFILE_ENTITIES=450 PROFILE_VISIBLE=450 npm run profile:snapshot
PROFILE_SCENARIO=ecs-channel-2d PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_USERS=100 PROFILE_ENTITIES=500000 PROFILE_VIEW_HALF=640 PROFILE_CELL_SIZE=512 PROFILE_WORLD_SIZE=8192 PROFILE_MOVE_FRACTION=0.01 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SCENARIO=manual-channel-2d PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_USERS=100 PROFILE_ENTITIES=500000 PROFILE_VIEW_HALF=640 PROFILE_CELL_SIZE=512 PROFILE_WORLD_SIZE=8192 PROFILE_MOVE_FRACTION=0.01 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
PROFILE_SUITE=spatial-fanout PROFILE_SPATIAL_DISTRIBUTION=single-cell PROFILE_USERS=200 PROFILE_ENTITIES=200 PROFILE_VISIBLE=200 PROFILE_VIEW_HALF=512 PROFILE_CELL_SIZE=512 PROFILE_WORLD_SIZE=512 PROFILE_MOVE_FRACTION=1 PROFILE_TICKS=500 PROFILE_WARMUP=100 PROFILE_SHARED_UPDATES=1 npm run profile:snapshot
```

Interpretation notes:

- This harness is best for server architecture work. It will not expose
  WebSocket backpressure, bot CPU saturation, or client decode/apply cost.
- Compare variants by running them back-to-back. Absolute numbers are less
  useful than ratios.
- Fixed-membership scenarios now use supported channels instead of the old
  synthetic visibility fixture. Their results are not directly comparable to
  historical measurements of that fixture. Earlier combined p50/p95/max fields
  added stage statistics; regenerate those figures with the corrected harness.
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
