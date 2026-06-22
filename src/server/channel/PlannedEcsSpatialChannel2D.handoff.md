# Planned ECS Spatial Channel Handoff

This note captures the context behind the current planned ECS spatial channel work. It is intended for a fresh agent/session that has the repo but not the conversation history.

## What Nengi Is Doing Here

Nengi snapshots are server-to-client binary frames. A user subscribes to channels, and channels decide what entities/components/messages the user receives. Historically, visibility was user-first: for each user, compute what is visible, produce create/update/delete snapshot sections, then move to the next user. Some work can be cached as binary fragments, but the general pipeline still has a lot of generic visibility and `SnapshotPlan` machinery.

The research direction in this branch is channel-first/cell-first snapshot generation:

- Userland owns ECS state and explicitly mutates components.
- The engine trusts manual mutation writes instead of scanning for changed component state.
- Spatial cells are the unit of visibility and dirty work.
- Users with the same visible cell signature share visibility/update work.
- Snapshot writing should move toward direct binary frames/fragments instead of large generic plans.

## Important Files

Core channel work:

- `src/server/channel/PlannedEcsSpatialChannel2D.ts`
- `src/server/channel/PlannedEcsSpatialChannel2DSnapshot.ts`
- `src/server/channel/EcsSpatialChannel2D.ts`
- `src/server/channel/EcsSpatialChannel3D.ts`
- `src/server/channel/SpatialGrid.ts`
- `src/server/channel/SpatialView.ts`

Snapshot infrastructure:

- `src/binary/snapshot/createSnapshotBuffer.ts`
- `src/binary/snapshot/SnapshotPlan.ts`
- `src/binary/snapshot/SnapshotChunk.ts`
- `src/binary/snapshot/writeSnapshot.ts`
- `src/binary/snapshot/countSnapshotBytes.ts`
- `src/binary/snapshot/manualUpdates.ts`
- `src/binary/snapshot/ecsSnapshotCrud.ts`
- `src/binary/snapshot/channelModes.ts`

Tests:

- `src/binary/snapshot/createSnapshotBuffer.test.ts`
- `src/binary/snapshot/EcsSpatialCorrectness.test.ts`
- `src/binary/snapshot/ObjectChannelCorrectness.test.ts`
- `src/server/channel/EcsChannel.test.ts`
- `src/server/channel/ManualSpatialChannel.test.ts`

Benchmarks:

- `src/performance/SnapshotPipeline.performance.ts`
- Run via `npm run profile:snapshot`

## Current Channel Shape

`PlannedEcsSpatialChannel2D` extends `EcsSpatialChannel2D`.

Important properties:

- It is registered as `ChannelType.PlannedEcsSpatialChannel2D`.
- It has `plannedEcsSpatialChannelMode = true`.
- It owns its visibility state in `visibilityStateByUser`.
- It no longer mirrors planned ECS visibility into `User.currentlyVisible` / `tickLastSeen`.
- It no longer depends on legacy `User.hasPendingVisibilityDeletes()` for dispatch/planning.
- It groups users by visible cell signature.
- For each signature group, it computes visible root/component nids once.
- Per-user create/delete deltas are derived from the channel-owned previous visible set.

Important optimization already added:

- If a user remains on the same cell signature and there are no lifecycle deltas or visible boundary-crossing moves, the channel reuses the stable no-create/no-delete snapshot.
- `EcsSpatialChannel2D` exposes `onRootCellMove(pid, fromCell, toCell)` so the planned channel can cheaply detect whether moves crossed visibility boundaries for a cell-signature group.

## Manual Mutation / Coalescing

The ECS spatial channels use manual component writers:

- `Transform.props.x(component, value)`
- `Transform.groups.position(component, x, y, ...)`

These writers are now internally coalesced for `EcsSpatialChannel2D` and `EcsSpatialChannel3D`.

Current strategy:

- Writer calls append cheaply to the dirty cell log.
- Each cell log also records operation order arrays.
- The channel does not duplicate every manual write into a channel-wide manual log for ECS spatial; ECS spatial snapshots are cell-log based.
- When a snapshot reads a dirty cell via `getManualCellUpdateLog`, the log lazily coalesces.
- A fast no-conflict prepass avoids reducing logs where every write is unique.
- If repeated writes or prop/group overlaps exist, the reducer collapses to final prop/group values.

Semantics:

- Last write wins within one server frame.
- Group-only repeated writes stay grouped.
- Prop writes overlapping prior groups split only when needed.
- Deleted or no-longer-live components are filtered before fragment creation.

Important tests:

- `coalesces repeated ECS spatial manual writes to final prop values`
- `coalesces repeated ECS spatial 3D manual writes to final prop values`
- stale delete/update tests under `ECS spatial visibility transitions`

## Old Bug Context

There was a pernicious bug where a client could receive a delete and an update for the same nid in the same snapshot, often related to stale dirty binary fragments.

Current protection:

- `createSnapshotBuffer.ts` filters ECS spatial manual logs through `filterEcsSpatialManualLog`.
- Planned ECS snapshot writer filters blocked nids for same-snapshot create/delete/update cases.
- Regression test: `does not reuse dirty ECS spatial cell fragments across users after a same-tick delete`.

When `filterEcsSpatialManualLog` was temporarily bypassed during investigation, that regression failed exactly with an update for a deleted nid. Current code passes.

## Snapshot Writer Direction

The current planned ECS writer is partly simplified, but not fully ideal.

Current state:

- Envelope/protocol/header/message/response handling still uses generic `SnapshotPlan` chunks.
- Planned ECS visibility CRUD no longer goes through generic `SnapshotPlan`.
- `PlannedEcsSpatialChannel2DSnapshot.ts` builds a direct visibility frame:
  - `ecsCreateEntities`
  - `ecsCreateComponents`
  - `ecsDeleteEntities`
  - `deleteEntities`
- That visibility frame is counted and written directly as binary sections.
- Dirty cell updates are written as direct logs or shared `ManualUpdateFragment`s.

Desired next shape:

1. Compute/reuse visible cell signature.
2. Get channel-owned visibility frame for that signature/user.
3. Copy prebuilt visibility/update fragments where possible.
4. Append envelope/protocol/messages/responses.
5. Write directly to the binary buffer.

The long-term goal is to make fragment/direct-frame writing first-class for high-performance channels, not an adapter around generic `SnapshotPlan`.

## User Visibility Direction

Old Nengi supported entities visible from multiple sources/channels and arbitrary parent graphs. `User.currentlyVisible`, `tickLastSeen`, `stableVisibleRefs`, and `withChannelVisibilityState` were designed for that older world.

Current direction:

- Entity belongs to exactly one channel.
- If userland places the same entity in multiple channels, it is duplicated on the client; that is userland misuse.
- ECS root/components still form a tree-like replication unit, but ownership is channel-local.
- New planned channels should own visibility internally.
- Legacy `User` visibility should remain only for old/general channel paths until those are migrated.

What has already changed for planned ECS:

- The planned ECS dispatcher ignores legacy pending visibility deletes.
- The planned ECS planner does not skip users with pending legacy visibility deletes.
- A regression test proves planned ECS snapshots still work when legacy pending visibility delete state exists.

Potential migration plan:

1. New planned/manual spatial ECS channels own visibility internally.
2. Snapshot writers consume channel-owned visibility frames.
3. Generic `User` visibility remains for old channel implementations.
4. After old paths are replaced/deprecated, remove `User.currentlyVisible`, `tickLastSeen`, `stableVisibleRefs`, and `withChannelVisibilityState`.

## Performance Commands And Recent Numbers

Useful benchmark commands:

```bash
PROFILE_SCENARIO=planned-ecs-spatial-clump \
PROFILE_USERS=350 PROFILE_ENTITIES=350 PROFILE_VISIBLE=350 \
PROFILE_TICKS=50 PROFILE_WARMUP=10 PROFILE_SHARED_UPDATES=1 \
PROFILE_SPATIAL_DISTRIBUTION=single-cell PROFILE_CELL_SIZE=512 \
PROFILE_VIEW_HALF=512 PROFILE_WORLD_SIZE=512 \
npm run profile:snapshot
```

```bash
PROFILE_SCENARIO=planned-ecs-spatial-channel-2d \
PROFILE_USERS=350 PROFILE_ENTITIES=50000 PROFILE_VISIBLE=200 \
PROFILE_TICKS=50 PROFILE_WARMUP=10 PROFILE_SHARED_UPDATES=0 \
PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_CELL_SIZE=50 \
PROFILE_VIEW_HALF=22 PROFILE_WORLD_SIZE=5000 \
npm run profile:snapshot
```

Representative recent spread result:

- Scenario: `planned-ecs-spatial-channel-2d`
- Users/entities/visible: `350 / 50000 / 200`
- Step avg: about `18.9ms`
- Pre-step avg: about `44.5ms`
- Total avg: about `63.4ms`
- Bytes/snapshot: `838`

Representative clump result:

- Scenario: `planned-ecs-spatial-clump`
- Users/entities/visible: `350 / 350 / 350`
- Total avg generally around `4.3ms` to `4.8ms`
- Bytes/snapshot: `12288`

Benchmark noise is real. Compare trends across repeated runs, not single max values.

## Verification Commands

Common correctness checks:

```bash
npx jest src/binary/snapshot/createSnapshotBuffer.test.ts --runInBand
npx jest src/binary/snapshot/EcsSpatialCorrectness.test.ts --runInBand
npx jest src/binary/snapshot/ObjectChannelCorrectness.test.ts --runInBand
npx tsc --project tsconfig.test.json --noEmit
```

Recent verified state:

- `createSnapshotBuffer.test.ts`: 93 passed
- `EcsSpatialCorrectness.test.ts`: 7 passed
- `tsc --project tsconfig.test.json --noEmit`: passed

## 3D Variant Notes

`EcsSpatialChannel3D` has been updated with the same lazy per-cell manual coalescing behavior as `EcsSpatialChannel2D`.

There is not yet a `PlannedEcsSpatialChannel3D`.

Recommended path:

1. Build `PlannedEcsSpatialChannel3D` by mirroring `PlannedEcsSpatialChannel2D`.
2. Reuse the 3D base channel's lazy manual mutation logs.
3. Make a dedicated planned 3D snapshot writer or extract common planned ECS writer pieces after 2D/3D shape is clear.
4. Add 3D planned correctness tests in `EcsSpatialCorrectness.test.ts`.

## Design Bias For Next Work

Prefer:

- Channel-owned visibility.
- Cell/signature-based grouping.
- Direct visibility frames.
- Shared binary fragments for reusable update/visibility work.
- Lazy coalescing only when snapshot writing reads a dirty cell.
- Tests that inspect decoded frames, not just final client state.

Avoid:

- Reintroducing global/user-level visibility reducers for new channel paths.
- Scanning ECS component state to discover changes.
- Appending duplicate channel-wide logs when cell logs are sufficient.
- Optimizing solely for one benchmark without checking stale delete/update correctness.

