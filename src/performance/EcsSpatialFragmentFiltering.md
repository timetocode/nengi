# ECS Spatial Fragment Filtering Notes

## Context

`EcsSpatialChannel2D` writes per-cell manual update fragments for visible dirty
cells. This is intentionally optimized for high fanout: build or reuse encoded
cell update payloads, then copy those payloads into each user's snapshot.

The stale-update fix in `src/binary/snapshot/createSnapshotBuffer.ts` filters
ECS spatial manual cell logs before creating an update fragment. A manual prop
or group update is skipped if its component no longer exists in the channel.
This prevents a snapshot from containing:

- a component delete for `nid`
- followed later by a copied prop/group update for the same deleted `nid`

That invalid snapshot shape can crash the client while reading diffs because
the delete removes the client's schema knowledge before the stale update is
decoded.

## Current Fix Shape

The current implementation is conservative and localized at the serialization
boundary:

1. Get the dirty cell's manual update log.
2. Scan `manualPropNids` and `manualGroupNids`.
3. If all nids still resolve through `channel.getComponent(nid)`, return the
   original log with no allocation.
4. If any stale nid is found, allocate a filtered log and copy only live
   component updates.
5. Build or fetch the encoded manual update fragment from that filtered log.

This avoids broad changes to channel mutation bookkeeping, and it protects the
final wire format even if stale entries remain in the channel's per-cell log.

## Measured Cost

These numbers were taken with `npm run profile:snapshot` on the same machine in
one session. Treat them as relative, not absolute.

Worst-case clump fanout:

```bash
PROFILE_SCENARIO=ecs-spatial-clump \
PROFILE_USERS=200 \
PROFILE_ENTITIES=200 \
PROFILE_VISIBLE=200 \
PROFILE_TICKS=500 \
PROFILE_WARMUP=100 \
PROFILE_MANUAL_EMIT=props \
npm run profile:snapshot
```

Observed comparison:

```text
HEAD:
  totalMs avg: 2.702
  collectMsPerSnapshot: 0.007

Patched:
  totalMs avg: 3.404
  collectMsPerSnapshot: 0.011
```

Distributed spatial workload:

```bash
PROFILE_SCENARIO=ecs-spatial-channel-2d \
PROFILE_SPATIAL_DISTRIBUTION=homogeneous \
PROFILE_USERS=100 \
PROFILE_ENTITIES=20000 \
PROFILE_VISIBLE=200 \
PROFILE_VIEW_HALF=240 \
PROFILE_CELL_SIZE=200 \
PROFILE_WORLD_SIZE=5000 \
PROFILE_MOVE_FRACTION=0.05 \
PROFILE_TICKS=200 \
PROFILE_WARMUP=50 \
npm run profile:snapshot
```

Observed comparison:

```text
HEAD:
  totalMs avg: 13.401
  collectMsPerSnapshot: 0.113

Patched:
  totalMs avg: 13.642
  collectMsPerSnapshot: 0.115
```

The distributed case is essentially unchanged. The clump profile shows a
measurable regression because many users share the same dirty cell. The current
fix scans the cell log per user before reaching the cached encoded fragment.

## Performance Concern

The hot path for ECS spatial clumps is supposed to do minimal per-user work:

- determine visible cells
- copy cached encoded cell payloads
- avoid revalidating or rewriting the same update stream for every user

The current fix preserves correctness but adds a per-user scan of the dirty
cell's manual update log. In a clumped game profile, that can become:

```text
users * dirty visible cells * updates in cell
```

even though the encoded fragment itself is shared.

## Improvement Path

If the regression matters, move the filtering to the fragment build path rather
than the per-user fragment lookup path.

Desired shape:

1. Compute the fragment cache key for `tick + channel + cell`.
2. If a cached fragment exists, return it immediately.
3. Only when building the fragment, filter stale component nids once.
4. Cache the filtered encoded payload.
5. Let subsequent users copy the cached safe payload without rescanning the log.

That preserves the final invariant:

```text
No update section or copied fragment may reference a component nid that has
already been deleted from the channel before this snapshot is written.
```

while restoring the clump path closer to its previous per-user cost.

Another possible design is to remove stale manual log entries at mutation time,
inside `EcsSpatialChannel2D.removeComponentInternal`. That keeps snapshot
writing closer to trusting channel logs, but it spreads correctness across more
mutation code and is easier to miss for future channel variants. Filtering at
fragment build time is the safer next optimization.

## Suggested Future Check

After optimizing, rerun at least:

```bash
PROFILE_SCENARIO=ecs-spatial-clump PROFILE_USERS=200 PROFILE_ENTITIES=200 PROFILE_VISIBLE=200 PROFILE_TICKS=500 PROFILE_WARMUP=100 npm run profile:snapshot
PROFILE_SCENARIO=ecs-spatial-channel-2d PROFILE_SPATIAL_DISTRIBUTION=homogeneous PROFILE_USERS=100 PROFILE_ENTITIES=20000 PROFILE_VISIBLE=200 PROFILE_VIEW_HALF=240 PROFILE_CELL_SIZE=200 PROFILE_WORLD_SIZE=5000 PROFILE_MOVE_FRACTION=0.05 PROFILE_TICKS=200 PROFILE_WARMUP=50 npm run profile:snapshot
```

The clump profile should recover most of the `collectMsPerSnapshot` difference.
The distributed profile should remain flat.
