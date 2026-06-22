# Cell-First Visibility Hypothesis

The old `Planned*` channel names came from an optimization hypothesis, not from
an API concept we want to keep exposing. The hypothesis was:

1. For culled channels, visible cells are often a better unit of work than users.
2. Users with the same visible cell set can share visibility work and update
   fragments.
3. Channel output can be cheaper and simpler when the channel first groups by
   visible cell signature, then derives each user's creates/deletes from that
   grouped state.

`EcsChannel2D` and `EcsChannel3D` currently apply this most directly. They build
a per-tick visibility plan grouped by cell signature, cache the visible nids for
that group, and reuse shared update fragments when the group is stable enough.

`Channel2D`, `Channel3D`, `ManualChannel2D`, and `ManualChannel3D` still use a
more user-first visibility delta and then opportunistically reuse cell fragments
for binary output. That shape is correct, but it may leave performance on the
table when many users share overlapping views.

## What To Try

The next experiment should not reintroduce "planned" naming. It should be a
private implementation detail of culled channel output:

- Build a per-tick map of `cellSignature -> users`.
- Resolve visible root/entity nids once per signature.
- Derive per-user creates/deletes by comparing the grouped visible nids against
  the user's remembered visible set.
- Reuse create/update/delete fragments by cell where possible.
- Keep final binary emission channel-owned through `createSnapshotOutput`.

## Expected Upside

Cell-first grouping is most likely to help when:

- many users occupy the same or nearby views,
- view rectangles/circles cover multiple populated cells,
- shared update fragments are enabled,
- entities are relatively stable across ticks,
- channel subscription count is high enough that repeated user visibility scans
  dominate.

It is less likely to help when:

- users have mostly unique views,
- each view touches very few cells,
- most cells churn every tick,
- entity trees force expensive per-root expansion,
- the grouping bookkeeping costs more than the saved scans.

## Correctness Constraints

The grouped cell state must not become the user's authoritative visibility
memory. The user still needs remembered visible nids or an equivalent per-channel
state so creates and deletes are correct across view changes, entity movement,
subscription opens, and removals.

Manual channels also need stale-update filtering: dirty-cell logs can contain
mutations for entities that were removed or moved before the snapshot is written.
The binary output path must filter those logs against currently live nids for
the cell.

## Future Regression Coverage

Before doing another broad channel refactor, add focused regression tests for
the cases that combine multiple snapshot features in one frame:

- channel open with a schema-backed header, followed by same-snapshot entity
  creates and channel-scoped messages,
- dirty header updates on an already-open channel while normal CRUD is also
  written,
- `skipInterpolation` nids passing through the snapshot envelope alongside
  channel-owned output,
- same-tick create/delete for roots and entity trees, including a child created
  after the parent was already visible,
- movement where an entity, its subscriber view, or both cross cells in one
  server tick,
- manual update logs that include removed entities, moved-out entities, and
  surviving entities in the same dirty cell,
- shared fragment reuse across two users where one user's visibility has a
  create/delete delta and the other user's visibility is stable,
- protocol width changes on snapshots that also include channel opens, headers,
  fragments, and ECS component sections.

These tests should be small and scenario-shaped. The goal is not broad fuzzing;
it is to lock down the contract between channel visibility memory, fragment
reuse, envelope sections, and client apply order.

## Performance Notes

Automatic diff channels are expected to be slower when many entities mutate,
because their feature is that userland does not need to report mutation intent.
That ergonomics/performance tradeoff is valid and should remain available.

For culled channels, prioritize clump profiles when deciding whether a visibility
optimization is worth keeping. Spread-out profiles matter, but clumped users and
entities are the server-killing case: many subscribers sharing a small set of
hot cells is where repeated per-user work can dominate.

When benchmarking a future cell-first port to `Channel2D` or `ManualChannel2D`,
compare at least these shapes in the same session:

- single-cell fanout with shared updates enabled,
- homogeneous spread with low movement fraction,
- clustered distribution with partial overlap,
- churn with same-tick creates/deletes,
- entity-tree roots with one or more children.

If a change is slightly slower in the spread-out case but materially improves
the clumped case without weakening correctness, it may still be the better
server architecture.
