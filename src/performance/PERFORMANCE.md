# Performance ambition and demonstrated results

Started 2026-09-18. This is a bookmark for contributors: what nengi is trying to
make practical, and what it has already accomplished. The design and this record
can evolve as we learn more.

## Intention

Make substantial multiplayer worlds practical on a single server simulation
thread, leaving room for the game itself. Automatic channels offer convenience;
manual writes, ECS channels, spatial visibility and shared binary fragments give
games ways to spend much less time replicating state. Their benefits depend on
the workload and the application's usage patterns.

Some channel and buffer-writing choices came from benchmarking many alternatives.
A straightforward rewrite can look reasonable, pass correctness tests, and still
lose a capability that took considerable work to achieve. Preserve knowledge of
what has been possible so future contributors do not mistake a slower result for
an inherent cost of the problem.

The results below are evidence to investigate against. They do not prescribe a
particular algorithm, prohibit particular operations, or set universal timing
limits. New techniques, additional guarantees and deliberate tradeoffs are welcome;
record what changed and why the comparison makes sense.

## Where performance matters

| Area | Work to understand | Starting points |
| --- | --- | --- |
| Server channels | Membership, visibility, spatial movement, manual write logs and entity/component lifetime | [Channels](../server/channel/) |
| Snapshot production | Change collection, byte counting, writing, reusable fragments and fanout to subscribers | [Snapshot pipeline](../binary/snapshot/), [workload harness](./SnapshotPipeline.performance.ts) |
| Client processing | Decode/apply, retained history and interpolation sampling, including quiet worlds | [Client network](../client/ClientNetwork.ts), [history](../client/EntityHistory.ts), [history harness](./ClientHistoryWorkload.ts) |
| Complete games | Application work, transport, client processing and the load generator's own cost | [Bot workload guide](../../docs/ai/benchmarking.md) |

Supported usage is part of the comparison. For example, the fast spatial ECS
lifetime model is described in the [ECS guide](../../docs/ai/ecs-channels.md).
Changes to those assumptions can change the amount of work being measured.

## Demonstrated: large shared worlds, 2026-09-17

Machine: AMD Ryzen 7 7800X3D, 8 physical cores / 16 logical CPUs, WSL2,
Node 22.17.1. Snapshot production ran on one JavaScript thread. These measurements
used the pending Next RC membership optimization on top of RC-127 and other
unreleased work; the version string alone does not identify the measured source.

The [saved evidence](./records/2026-09-17-plain-channels.json) retains workload
settings, individual timing repeats, before/after summaries and source provenance.

### Core snapshot pipeline

100 subscribers to one plain EcsChannel, 10,000 roots with three components each
(40,000 network IDs). These are steady-state ticks after initial creation. The
sparse cases change all three component groups on 100 roots per tick. Stationary
state remains visible but is not retransmitted as a full world each tick.

| Workload | Mean step, before → after | p95 step, before → after |
| --- | ---: | ---: |
| Idle, shared update fragments off | 30.41 → 0.57 ms | 36.64 → 1.43 ms |
| 1% changing, shared update fragments off | 33.75 → 3.89 ms | 39.46 → 5.71 ms |
| 1% changing, shared update fragments on | 30.14 → 0.69 ms | 33.79 → 1.33 ms |

Each cell is the median of three per-run means or p95s, with 30 warmup and 120
measured ticks per process. Step time covers `Instance.step()` with the official
nengi-buffers writer and a counting transport. Application mutation before the
step, sockets and client processing are outside that interval. Both sparse modes
emit 354,100 bytes per tick across all subscribers. Shared fragments are opt-in.

Idle retained heap fell from roughly 139 to 15 MiB, measured as the increase from
before construction to after warmup, both following explicit GC. This is retained
state, not total allocation. The host also ran development tools; parts of the
first two repetitions overlapped another browser workload. Individual repeats
remain in the evidence, and small differences should not be read as precise limits.

The achievement worth remembering is that this large, broadly shared population
could be served with sub-millisecond average snapshot steps under the stated
idle/sparse conditions. Tens of milliseconds were not an unavoidable consequence
of that population size.

### Real Jigsaw game

10,000 pieces, each with two components plus its root, 100 actors and one observer,
at 20 Hz. Players subscribe to board and puzzle channels. Each dragging actor
moves a distinct group. Shared update fragments were off in both variants.

| Workload | Mean complete server frame, before → after | p95, before → after |
| --- | ---: | ---: |
| Idle | 32.09 → 5.09 ms | 50.95 → 7.02 ms |
| Dragging | 33.76 → 6.60 ms | 40.05 → 9.06 ms |

These measurements include game logic and real WebSocket output. They are one
20-second run per workload/variant after eight seconds of warmup, with the game
pinned to logical CPU 0 and seven worker processes plus the hub assigned to
logical CPUs 2–15. All four runs passed verification and sustained bot cadence.
Their game-source fingerprints match. These runs established useful headroom;
they did not search for the maximum player count or saturate the load generator.

The same core source variants were used for the isolated and game measurements.
The compact evidence records the exact game revision reported by the runs and
the source fingerprints, including uncommitted files.

## Maintainer observation: generating enough load can be difficult

On 2026-09-18 the maintainer described workloads where bot CPU usage across the
other logical CPUs approached saturation while a single server simulation thread
remained within a 50 ms frame budget. Other applications were also using the
machine. This is a reported experience, separate from the measured Jigsaw runs
above; a reproducible workload and capacity figure have not been attached here.

Preserve the observation because it expands what future contributors should
consider possible. When investigating it, record actual bot cadence, receive
processing, worker CPU usage and server frame times. A load generator's limit can
hide remaining server capacity.

## Demonstrated: client sampling, 2026-09-18

On the same machine, constructing sampled properties directly and extending the
existing history search to selected IDs reduced work while preserving independent
sample ownership. These Next RC measurements compare against the working source
before that cleanup, including the earlier pending channel changes.

| Isolated sampling workload | p50, before → after | p95, before → after |
| --- | ---: | ---: |
| Node 22, 500 selected scalar entities from 10,000 sparse | 0.178 → 0.096 ms | 0.306 → 0.201 ms |
| Node 22, 500 selected entities with vector/array values | 0.311 → 0.161 ms | 0.567 → 0.244 ms |
| Chrome 151, 10,000 full sparse scalar entities | 3.300 → 1.600 ms | 4.300 → 2.000 ms |
| Chrome 151, 5,000 full sparse entities with vector/array values | 2.900 → 1.300 ms | 3.800 → 1.900 ms |

Each cell is the median of three per-run percentiles, with 150 warmup and 600
measured samples, 120 retained history frames and fresh sequential processes.
The [saved evidence](./records/2026-09-18-sampling.json) includes additional
stationary/dense controls, workload fields, source hashes and measurement limits.
It measures sampling without a renderer or live transport, not complete game FPS.

A separate 100-entity probe reduced vector/array property results from 400 to 200
while returning identical, independently owned values. Scalar clones return
primitives; scalar workloads mainly benefit from less CPU work here. Output Maps
and entity objects remain fresh. Total allocated bytes and GC pauses were not
measured. The useful capability is that independent sampling can be this much
cheaper without introducing output reuse or changing its ownership contract.

## Demonstrated: reusable sampling output, 2026-09-18

The opt-in `sampleEntitiesInto` API adds caller-owned output while leaving ordinary
samples independent. In a probe of 100 calls selecting 500 entities after warmup,
stable reuse produced no new output Maps or outer entities, versus 100 Maps and
50,000 outer entities with ordinary sampling. Replacing 50 selected IDs each call
produced 5,000 new outer entities. Mutable nested properties still received fresh
values. These are observed object identities, not total allocated bytes or GC pauses.

On the same host, comparison against the allocating API in the same source showed:

| Workload | p50, allocate → reuse | p95, allocate → reuse |
| --- | ---: | ---: |
| Node 22, 500 selected scalar entities, stable | 0.097 → 0.094 ms | 0.183 → 0.158 ms |
| Node 22, 500 selected scalar entities, rotating | 0.097 → 0.101 ms | 0.192 → 0.269 ms |
| Node 22, 5,000 full scalar entities | 1.080 → 0.895 ms | 1.855 → 1.293 ms |
| Node 22, 5,000 full entities with vector/array values | 1.995 → 1.773 ms | 4.770 → 2.455 ms |
| Chrome 151, 5,000 full scalar entities | 0.800 → 0.800 ms | 1.300 → 1.000 ms |
| Chrome 151, 5,000 full entities with vector/array values | 1.300 → 1.500 ms | 1.800 → 1.900 ms |

These are medians of three per-run percentiles, with 150 warmup and 600 measured
samples and 120 retained history frames. Selection bookkeeping can cost more than
allocation in some workloads; reducing outer-object churn does not guarantee a
faster sample. The earlier allocating implementation was also measured as a control
and remained broadly comparable. No renderer, live transport or game GC profile
is included. Development services were running and processes were not pinned.

The [saved evidence](./records/2026-09-18-reusable-sampling.json) preserves all
variants, repeats, source fingerprints, probe counts and measurement limits.
The useful capability is optional reuse with explicit ownership and bounded
retention, leaving each game able to measure whether the tradeoff helps it.

## Demonstrated: server snapshot allocation cleanup, 2026-09-18

On the same machine and Node 22.17.1, avoiding repeated empty/intermediate results
preserved the existing channel APIs while reducing temporary work. The comparison
starts with the pending Next RC source containing the earlier membership and
sampling changes. Both variants use the same snapshot harness and official
nengi-buffers writer, with a counting transport and controlled protocol clock.

| Workload | Mean step, before → after | p95, before → after |
| --- | ---: | ---: |
| Plain ECS, 100 subscribers / 10,000 roots, idle, direct | 0.386 → 0.349 ms | 0.712 → 0.647 ms |
| Plain ECS, same population, 1% changing, direct | 3.601 → 3.311 ms | 4.803 → 4.005 ms |
| Automatic Channel, 20 subscribers / 10,000 entities, 1% changing, shared | 3.328 → 2.730 ms | 4.377 → 3.338 ms |
| ManualChannel2D, 50 subscribers / 2,000 entities, idle, shared | 2.001 → 0.373 ms | 2.816 → 0.773 ms |
| ManualChannel2D, same population, all moving, shared | 3.171 → 2.241 ms | 4.777 → 4.219 ms |
| ManualChannel3D, 50 subscribers / 2,000 entities, idle, shared | 1.983 → 0.401 ms | 2.629 → 0.774 ms |

These are medians of three per-run statistics, with 50 warmup and 150 measured
ticks in fresh sequential processes, alternating variant order. ECS roots have
three components each. Spatial rows have broadly overlapping views. Step time
excludes application mutation and separate index updates, sockets and clients.
Snapshot metrics are disabled in these rows; separate enabled controls are saved.

The idle ManualChannel2D case recorded 39 → 4 GC events per 150 measured ticks
and 17.710 → 1.396 ms summed event duration. Node's PerformanceObserver measured
the mutation/index/step loop, excluding forced warmup GC and result summarization.
This is evidence of reduced GC work in that workload, not a measure of all allocated
bytes or end-to-end game pauses. Retained heap after explicit GC was broadly unchanged.

The [saved evidence](./records/2026-09-18-server-allocation.json) includes all
20 workloads and repeats, GC observations, construction probes and source hashes.
In an eight-subscriber probe, idle spatial groups merged once instead of eight
times; plain ECS plan-array constructions fell from 272 to 136; 100 unchanged
automatic entities produced no fresh empty diff containers after warmup; and
eight unchanged remembered-cell Maps were retained instead of rebuilt.

Moving-cell and dense/churn controls were broadly comparable, with small timing
differences in both directions. Idle spatial ECS measured 0.265 → 0.286 ms, while
shared sparse plain ECS measured 0.513 → 0.500 ms; GC counts and durations also do
not improve in every case. Other development workloads could run on the host,
so small differences are uncertain. All 26 wire probes remained byte-identical;
a separate hierarchy regression fixed missed child changes in manual spatial
visibility. The useful capability here is particularly cheap stable spatial
replication without rebuilding each subscriber's remembered IDs every tick.

## Demonstrated: automatic spatial preparation, 2026-09-18

A follow-up on the same machine and Node 22.17.1 used Channel2D/3D's existing
stable-cell check to skip repeated visibility and update-plan construction.
Property checking still runs: unchanged membership does not imply unchanged
values. Idle manual spatial groups also defer their membership Set and merged
log until they encounter updates. This comparison starts after the preceding
server allocation cleanup, with both variants retaining those pending changes.

| Workload | Mean step, before → after | p95, before → after |
| --- | ---: | ---: |
| Automatic 2D, 50 subscribers / 2,000 roots, idle | 15.815 → 0.914 ms | 17.693 → 1.547 ms |
| Automatic 2D, same population, 1% moving | 16.536 → 1.839 ms | 18.412 → 2.458 ms |
| Automatic 2D, same population, all moving | 23.384 → 12.164 ms | 27.672 → 29.525 ms |
| Automatic 3D, 50 subscribers / 2,000 roots, idle | 15.803 → 0.947 ms | 17.133 → 1.752 ms |
| Automatic 3D, same population, all moving | 34.681 → 34.392 ms | 41.176 → 41.768 ms |
| Automatic 2D, 20 subscribers / 2,000 roots, multiple cells, all moving | 4.013 → 3.941 ms | 5.598 → 5.283 ms |
| Automatic 2D, 20 subscribers / 1,000 roots + two children each, 1% moving | 11.076 → 1.204 ms | 12.495 → 2.066 ms |
| Manual 2D, 50 subscribers / 2,000 roots, idle | 0.444 → 0.409 ms | 0.850 → 0.863 ms |

These are medians of three per-run statistics, with 50 warmup and 150 measured
ticks in fresh sequential processes, alternating variant order. Step time covers
`Instance.step()` with the official writer, controlled clock and counting
transport, excluding application mutation and separate index updates. Broad-view
rows have overlapping views and 512-unit cells; multi-cell rows use 32-unit cells
and a 512-unit world. Metrics are disabled in these rows. The host was not isolated
or pinned, and no sockets, clients or renderer are timed.

In an eight-subscriber, 100-entity stable-cell probe, visibility comparisons fell
from eight to zero, and diff-cache lookups fell from 900 to 100. Actual property
diff computations remained 100. All 16 probes retained identical packets and
decoded state. Idle automatic 2D recorded 122 → 5 GC events over 150 measured
ticks, with 54.166 → 2.209 ms summed event duration. These are Node GC observations
over the mutation/index/step loop, not cumulative allocated bytes or complete game
pauses. Idle manual groups avoid one membership Set and seven merged-log arrays;
their smaller timing differences should be read cautiously.

At that point, membership invalidation remained conservative: cell crossings and
unrelated hierarchy changes could cause the ordinary lifecycle path to run. The
2026-09-24 locality follow-up below narrows invalidation for crossings. Dense 3D was
broadly unchanged, and dense 2D's p95 increased despite its lower mean. Sparse 3D
also improved its mean (17.504 → 4.479 ms) while increasing p95 (22.151 → 24.178 ms).
The useful capability is much cheaper automatic replication in stable scenes,
with property changes still detected; there is no promise that busy-frame tails
improve alongside the average.

The [saved evidence](./records/2026-09-18-spatial-preparation.json) retains all
20 cases, individual repeats, GC observations, counters and source fingerprints.
The workspace archive is `nengi-rc-notes/spatial-preparation-performance/`.

## Demonstrated: snapshot housekeeping and manual cell reuse, 2026-09-18

The next pass on the same host and Node 22.17.1 skips disabled reporting work,
reuses immutable empty envelope/ECS sections and moves manual spatial cell
fragments into the existing prepared plan's lifetime. Reuse now precedes repeated
membership filtering while still invalidating after writes, lifecycle changes,
cleanup and protocol-width changes. It also fixes stale same-tick group/cell
payload reuse. This baseline includes the preceding spatial-preparation pass.

| Workload | Mean step, before → after | p95, before → after |
| --- | ---: | ---: |
| Manual 2D, 50 subscribers / 2,000 roots, all moving, per-cell | 9.885 → 2.574 ms | 12.782 → 5.259 ms |
| Manual 3D, same population, all moving, per-cell | 12.520 → 4.234 ms | 15.196 → 7.407 ms |
| Manual 2D, same population, moving + ten root replacements per tick | 31.188 → 24.913 ms | 33.861 → 28.850 ms |
| Spatial ECS 2D, 50 subscribers / 2,000 roots, idle, shared | 0.293 → 0.241 ms | 0.743 → 0.533 ms |
| Plain ECS, 100 subscribers / 10,000 roots, 1% moving, direct | 3.678 → 3.428 ms | 4.451 → 4.364 ms |
| Manual 2D, 50 subscribers / 2,000 roots, all moving, combined shared group | 2.319 → 2.717 ms | 4.675 → 5.117 ms |

Each cell is the median of three per-run statistics, with 50 warmup and 150
measured ticks, fresh sequential processes and alternating variant order. The
official writer, controlled clock and counting transport isolate snapshot steps;
mutation/index work, sockets, clients and rendering are outside step time. ECS
roots have three components. Broad spatial views use 512-unit cells; ordinary
3D placement spans a 128-unit world. All settings and 26 cases are preserved in
the [saved evidence](./records/2026-09-18-snapshot-housekeeping.json).

The active manual per-cell 2D case recorded 130 → 35 GC events over 150 measured
ticks and 74.059 → 21.069 ms summed event duration. The 3D case recorded
149 → 50 events and 94.674 → 30.576 ms. These are Node observations during the
mutation/index/step loop, excluding forced warmup GC and summarization, not total
allocated bytes or full-game pauses. Eight-subscriber probes show manual cell
membership Sets falling from eight to one, plain ECS envelope arrays from
136 to 32, and reporting-only grouped-stat visits from 2,400 to zero when disabled.
All 80 ordinary wire/decoded-state probes match, and enabled metrics remain intact.

The useful capability is especially cheap manual per-cell fanout with correct
cache lifetime. Fewer allocations do not guarantee faster frames everywhere:
the already-shared manual group case above is slower, dense plain ECS measured
6.650 → 6.981 ms, and some p95s increased. Isolated follow-up comparisons and CPU
profiles did not establish a safe way to eliminate the shared-path difference;
the workspace archive `nengi-rc-notes/snapshot-housekeeping-performance/` retains
those experiments separately. Host load was not isolated. No new Jigsaw or
end-to-end capacity measurement is implied.

## Demonstrated: shared cell membership and binding writes, 2026-09-18

On the same machine and Node 22.17.1, sharing remembered cell ID lists and
deferring unused spatial preparation further reduced busy manual snapshot work.
The baseline already contains the preceding passes. Each spatial row below has
50 subscribers and 2,000 roots; tables show medians of three per-run statistics
with 50 warmup and 150 measured ticks in alternating fresh sequential processes.

| Workload | Mean step, before → after | p95, before → after |
| --- | ---: | ---: |
| Manual 2D, all moving, per-cell output | 3.042 → 2.391 ms | 5.898 → 3.855 ms |
| Manual 3D, all moving, per-cell output | 3.856 → 2.321 ms | 7.385 → 5.333 ms |
| Manual 2D, cell crossings | 4.093 → 1.997 ms | 5.836 → 3.333 ms |
| Manual 3D, cell crossings | 5.120 → 2.316 ms | 7.335 → 3.995 ms |
| Manual 2D, combined shared group | 2.682 → 2.238 ms | 5.347 → 3.987 ms |

The 2D crossing workload recorded 47 → 20 GC events per 150 ticks and
34.454 → 12.552 ms summed event duration. A separate one-root-crossing probe
observed 100 → 2 fresh remembered-cell arrays and 100,000 → 2,000 appended IDs
across 50 subscribers, while preserving each subscriber's older baseline. This
sharing uses existing membership/hierarchy versions and cell identity, without
new per-write tracking. Old arrays remain valid until their subscribers advance.

A separate binding workload, with 10,000 roots and one component each, measured
single-property mutation time at 2.305 → 1.498 ms for plain ECS, 3.068 → 1.965 ms
for 2D and 3.171 → 1.899 ms for 3D. Direct property mutation avoids generic patch
temporaries while retaining validation and value restoration on emission failure.
Group mutation saves fewer objects: 2D total mutation/flush/cleanup time stayed
7.546 → 7.559 ms, while GC count fell 97 → 76. The binding workload has no
subscribers or serialization and keeps spatial components within one cell.

The [saved evidence](./records/2026-09-18-cell-membership-binding.json) includes
26 snapshot workloads, 15 binding workloads, individual repeats, source hashes
and 103 matching packet/state probes. Snapshot step uses the official binary
writer and counting transport; application mutation/index updates, live sockets
and clients are excluded. GC observations cover the measured loops, excluding
forced warmup GC; binding observations also include result summarization.

Small controls and tails are mixed. Narrow manual 3D mean time was 5.019 → 5.072 ms;
automatic 3D dense p95 was 39.674 → 41.454 ms. The unchanged plain patch binding
control was 6.643 → 7.124 ms total, while its 3D counterpart improved. The host
was not isolated. These measurements establish useful reductions in repeated
membership and binding work, not a universal speedup or a complete game result.

## Demonstrated: wide child trees and incremental game reconstruction, 2026-09-20

The Loam collection experiment exposed repeated traversal of all existing
children during attachment. Starting cache invalidation at the new child keeps
the ancestor updates and preserves unchanged sibling caches. On the same Ryzen
7 7800X3D / Node 22.17.1 host, the pending source measured:

| Attachment workload | Median time, before → after | Invalidation visits, before → after |
| --- | ---: | ---: |
| 64 children on a fresh root | 0.271 → 0.077 ms | 2,144 → 64 |
| 512 children on a fresh root | 2.590 → 0.476 ms | 131,840 → 512 |
| 4,096 children on a fresh root | 155.356 → 1.668 ms | 8,394,752 → 4,096 |
| Add 64 to a cached 4,096-child root | 5.222 → 0.364 ms | 264,288 → 64 |

These are medians of three process medians, each with two warmups and seven
trials. Preallocated attachment is timed separately from setup, cache queries,
and validation. Counts use separate untimed instances. Root removal is unchanged:
4,096 children measured 1.241 → 1.250 ms with identical traversal counts.

In the snapshot harness, four roots with 512 children each, 20 subscribers and
one root replacement per tick measured 4.059 → 1.747 ms total mean, with p95
5.256 → 2.800 ms. Pre-step mean fell 2.735 → 0.456 ms; snapshot step mean was
1.325 → 1.279 ms. Both sent 339,240 bytes per tick. This uses the official
nengi-buffers writer, shared fragments, controlled clock, 30 warmups and 120
measured ticks, with three alternating source comparisons. Mutation and snapshot
statistics are summarized independently from matching per-tick totals.

Controls were mixed: two-child churn measured 1.097 → 1.178 ms total mean,
steady spatial parents 0.890 → 0.862 ms, and steady manual parents 0.232 →
0.238 ms. No new work was added to those snapshot paths; the host was not
isolated. Ten multi-subscriber hierarchy probes preserved complete wire bytes
and decoded state, including nested additions, removals and root churn.

A separate Loam change uses existing frame facts to patch decoded block arrays,
preserving unchanged parts and old replay states. With its existing pinned
nengi package unchanged, 4,096 parts with four scattered edits measured
0.396 → 0.032 ms client decode/apply/reconstruction; 64 adjacent edits measured
0.461 → 0.100 ms. These are medians of eight trial means, 180 updates per trial,
two binary clients, and no simulation/rendering. The collection prototype's
sparse client result was 0.228 ms in the after comparison. This revises the
earlier apparent client advantage of collections; it does not establish a GC
benefit or choose a collection API. The game still copies the changed array's
references to preserve replay history.

The [saved evidence](./records/2026-09-20-child-trees.json) records source hashes,
all core repeats, probes and Loam summaries. Full sources/runners and game trials
are in `nengi-rc-notes/child-tree-entity-reader-performance/`. The useful capability
is inexpensive construction of wide hierarchies and sparse reconstruction using
existing entities, without introducing collection semantics or changing the wire.

## Carrying this forward

Before accepting substantially lower performance in a comparable workload,
investigate the difference. It may be new functionality, stronger guarantees,
different hardware or runtimes, a measurement problem, or a lost optimization.
Explain which. The purpose is to carry forward informed ambition while leaving
the implementation open to improvement.

Add dated results when they demonstrate a useful capability or revise our
understanding. Keep the workload, measurement boundary, source revision (including
uncommitted changes), environment and evidence attached. Retain useful earlier
landmarks; mark misleading results as corrected, and revise obsolete guidance
instead of accumulating contradictory instructions.

Use the [harness guide](./README.md) to choose workloads and compare revisions
on the same machine. The original September workspace archive is
`nengi-rc-notes/plain-channel-performance/`, beside the core repository. It contains
the full results, captured sources, and exact runners, including the official
binary backend and controlled protocol clock used here. The record in this
repository preserves the selected evidence without requiring that local archive.

## Demonstrated: reusing stable manual visibility, 2026-09-20

The indexed/keyed collection investigation found a cost in the ordinary entity
baseline: a manual spatial snapshot could rebuild a membership Set even though
visibility preparation already retained a valid one. Lending that read-only Set
to update filtering preserves packet output and avoids work proportional to all
visible IDs in this stable case. The change applies to ManualChannel2D and 3D.

On the same Ryzen 7 7800X3D/Node 22.17.1 host, 4,096 roots and 20 subscribers with
four roots moving per tick measured **0.437 → 0.359 ms (2D)** and
**0.455 → 0.376 ms (3D)**. Two roots with 2,048 children each and four writes per
tick measured **0.599 → 0.278 ms**. These are medians of three process means,
40 warmup/180 measured ticks, including mutation plus snapshot production, with
shared fragments and the official buffer writer. The host was not isolated.

Dense mutation, root replacement and shared-fragments-off controls did not show
comparable gains. This is a capability of stable grouped visibility, not a general
speedup for every manual channel. The [record](./records/2026-09-20-manual-visibility.json)
includes all mean repeats, workload settings, source hashes and packet parity:
1,800 decoded lifecycle/visibility snapshots were byte-identical before/after.
The before source includes the preceding unreleased performance work.

## Demonstrated: automatic spatial visibility locality, 2026-09-24

Channel2D/3D now reuse an unchanged subscriber's visibility when roots cross cells
or are added elsewhere in the channel. Grid-wide membership revisions distinguish
a recreated cell from the old cell at the same key. Automatic property checking
continues, and the hierarchy revision still invalidates views for root removals
and child attachment/removal. Other spatial caches retain their existing global
invalidation; this is a narrower improvement than making all changes local.

Fresh copies of the dirty Next RC tree, including the recent connection and
prediction work, were compared on the same Ryzen 7 7800X3D/WSL2/Node 22.17.1 host.
The selected change is CH-1 alone. Each number is the median of three per-run
statistics, with 50 warmup and 150 measured ticks. Runs used sequential fresh
processes, rotated variant order, the official buffer writer, a controlled clock,
shared update fragments and disabled snapshot metrics/diagnostics. The host was
not isolated or pinned; sockets, client processing and rendering are excluded.

| Workload | Mean step, before → after | p95 step, before → after |
| --- | ---: | ---: |
| Distributed 2D, 100 users / 20,000 roots, 1% moving | 15.220 → 13.239 ms | 32.583 → 16.711 ms |
| Distributed 3D, same population, 1% moving | 27.353 → 24.509 ms | 32.455 → 28.944 ms |
| Distributed 2D, idle | 11.356 → 10.786 ms | 13.849 → 13.235 ms |
| Broad 2D, 50 users / 2,000 roots, all moving | 11.895 → 11.938 ms | 29.423 → 29.296 ms |
| Broad 3D, same population, all moving | 33.102 → 33.799 ms | 40.544 → 40.968 ms |
| Manual 3D, 50 users / 2,000 roots, dense updates + 20 root replacements/tick | 25.691 → 25.495 ms | 30.143 → 29.547 ms |

Distributed worlds use 8192-unit extents, 512-unit cells and 640-unit view
half-size. Broad worlds use 128-unit extents, 512-unit cells and 1024-unit views.
Step time excludes mutation and separate index updates. Including both, the
distributed sparse means were 15.349 → 13.354 ms (2D) and 27.497 → 24.639 ms (3D).
Bytes per tick matched in every measured workload. GC observations in those
sparse rows fell from 68 → 54 events and 132 → 102 events over 150 ticks. Those
are Node GC observations, not cumulative allocated bytes or full-game pauses.

The capability to preserve is that distant crossings need not rebuild every
subscriber's entity sets. It helps sparse distributed worlds; dense, idle,
hierarchy and manual/ECS controls do not establish a universal speedup. Several
small differences, including dense 3D's increase, remain within the variability
of this session. The [record](./records/2026-09-24-spatial-locality.json) includes
all 13 workloads, source fingerprints, individual repeats and index/total costs.

A separate third variant checked the manual marker before the full structural
channel guard. It reduced the sparse means further but had mixed controls,
including a slower manual-2D median than CH-1 alone; it was not retained. Keep
its results as evidence rather than treating this session as a universal verdict
on guard order.

Correctness checks compare actual packet and decoded-state hashes across 80
snapshot cases, plus 2D/3D visibility traces with explicit expected membership,
child edits, cell recreation and subscription changes. New regression tests
also fail in a deliberate negative control that removes global invalidation
without making recreated-cell revisions distinct. Full source/evidence copies
are archived in `nengi-rc-notes/stable-release-review/scratch/channel-locality-implementation/`.

## Measured: snapshot size guards and terminal failures, 2026-09-25

On the same Ryzen 7 7800X3D / WSL2 host with Node 22.17.1, compare the pending
Next RC immediately before and after allocation-boundary size checks and terminal
`Instance.step()` failure handling. The successful path adds completed-writer
offset/payload-length comparisons and a failed-instance check. It does not add
per-property validation, rollback logs or another traversal of the world.

| Workload | Mean step, before → after | p95 step, before → after |
| --- | ---: | ---: |
| Plain ECS, 100 subscribers / 10,000 roots, idle, direct | 0.267 → 0.273 ms | 0.448 → 0.432 ms |
| Plain ECS, same population, 1% changing, direct | 3.155 → 3.267 ms | 3.825 → 4.007 ms |
| Plain ECS, same population, 1% changing, shared | 0.422 → 0.424 ms | 0.691 → 0.692 ms |
| Automatic Channel, 20 subscribers / 10,000 entities, 1% changing, shared | 3.081 → 3.086 ms | 3.845 → 3.811 ms |
| Plain ECS, 20 subscribers / 1,000 roots, all changing, direct | 5.684 → 5.864 ms | 6.739 → 6.857 ms |
| Spatial ECS clump, 350 subscribers / 350 roots, all changing, shared | 2.321 → 2.290 ms | 4.788 → 4.594 ms |
| Channel2D, 20 subscribers / 4,000 entities, many visible cells, 5% changing | 3.905 → 3.912 ms | 5.619 → 5.633 ms |

Cells are medians of three fresh sequential runs, alternating source order, with
200 warmup and 600 measured ticks. ECS roots have three components. The official
nengi-buffers writer and counting transport are identical in both variants;
network time is controlled and snapshot metrics are disabled. Step time excludes
application mutation, index maintenance, sockets and clients. Development services
were running; these initial runs were not pinned to a CPU. Wire sizes and send
counts match in all workloads.

The direct ECS differences prompted longer runs with 600 warmup / 1,500 measured
ticks. Sparse direct changed 3.201 → 3.144 ms; dense direct changed
5.879 → 6.346 ms (+7.94%). A further three-repeat dense comparison pinned to one
logical CPU isolated the two changes: original 5.977 ms, guards alone 5.896 ms,
failure handling alone 5.993 ms, both 6.008 ms (+0.52%). These results support
retaining the small checks, but do not establish an exact zero cost or explain
away every slower run. Keep the unpinned results when evaluating future workloads.

A separate metrics-enabled Channel2D probe built 512 fragments plus 20 final
packets per tick on average. It exercises hundreds of allocation checks, not just
one per user. Cached fragments are checked when built, not rescanned on each copy.

The capability preserved here is sparse replication of 40,000 network IDs to 100
subscribers with roughly 0.4 ms average shared snapshot steps under this workload,
while detecting size disagreements and refusing silent continuation after failure.
The [record](./records/2026-09-25-snapshot-size-guards.json) keeps all ten workloads,
individual repeats, longer runs, isolated variants and source provenance.

## Measured: bounded historian indexing, 2026-09-25

An optional history index should make ordinary queries cheaper without allowing
one large query or hitbox to monopolize a server tick. Historian2D/3D now scan
the retained sample list when query cell count exceeds sample count. Recording
falls back to an unindexed frame when cumulative sample-to-cell insertions would
exceed 16 times its sample count. Unrepresentable cell coordinates also select
the scan path. These thresholds are measured implementation choices, not API
promises; the exact geometry tests and retained samples stay the same.

The pending Next RC before these guards was compared with the final guards on
the Ryzen 7 7800X3D / WSL2 / Node 22.17.1 host. The full suite uses three fresh
alternating runs per source and 28 cases, including unindexed controls. Each
cell below is the median of three process medians. Recording includes sample
copying, indexing and pruning with 200 ms retention and 50 ms frame spacing.
Query measurements use already-recorded frames; short-query values are averages
within batches of 128 queries. Setup and hit-set checks are outside timing.

| Indexed workload | Before → after |
| --- | ---: |
| 2D recording, 3,000 spread samples | 1.481 → 1.688 ms |
| 2D recording, 3,000 dense samples | 0.696 → 0.847 ms |
| 3D recording, 3,000 spread samples | 2.103 → 2.287 ms |
| 3D recording, 3,000 dense samples | 1.104 → 1.218 ms |
| 2D recording, 300 samples including one oversized hitbox | 29.616 → 0.026 ms |
| 3D recording, 300 samples including one oversized hitbox | 15.027 → 0.028 ms |
| 2D local ray, 3,000 spread samples | 0.00056 → 0.00083 ms |
| 3D local ray, 3,000 spread samples | 0.00264 → 0.00225 ms |
| 2D long diagonal ray, 300 samples | 1,401.926 → 0.0075 ms |
| 3D long diagonal ray, 300 samples | 321.359 → 0.0063 ms |

Cell size is 64. Ordinary sample radius is 10, with spread extents of 20,000
units or dense extents of 128. Oversized radii are 8,192 (2D) and 1,024 (3D).
Long rays extend 300,000 units on each axis in 2D or 10,000 in 3D. Ordinary
recording uses 20 warmup / 60 measured trials; short queries use 5 / 15 batches.
The expensive oversized and long-ray cases use 2 / 7 and 1 / 3 trials respectively.
These are synthetic historian workloads, excluding replication, sockets, physics
and rendering. The host was not isolated or pinned. No allocation-rate or GC
improvement is established by these timings.

Initial mixed-suite results included increases of about 49% for dense 3D
recording and 55% for its spread local query. Longer, isolated comparisons used
150 warmup / 300 measured trials and three fresh runs per case and source. The
final guards measured 1.036 → 1.061 ms for dense 3D recording (+2.4%),
0.00191 → 0.00200 ms for the 3D local query (+4.6%), and 1.446 → 1.555 ms
for spread 2D recording (+7.6%). The final guard avoids redundant integer tests
on already-floored bounds. The evidence does not isolate that small change's
benefit from workload/JIT/host variation, and the slower mixed results remain
part of the record.

This is a deliberate cost for bounded work: ordinary indexed recording was
roughly 0.1–0.2 ms slower per 3,000 samples in the final mixed suite, while
extreme cases stopped expanding into millions of empty cells or index entries.
Do not describe it as a universal speedup or a free guard. New 2D and 3D tests
compare indexed and scanning queries with independent geometry/existence
oracles, and check bounded work for giant extents, unsafe cell coordinates and
cumulative overlapping insertions. Query order and equal-distance ray ties are
not an API guarantee.

The [record](./records/2026-09-25-historian-index-bounds.json) preserves initial,
isolated and final results, all repeats, source hashes and workload assumptions.
The harness and isolation commands are in [the performance guide](./README.md).

## Measured: plain ECS removal containment, 2026-09-25

Plain ECS now compacts pending writes after component removal, once per channel
before snapshot fanout. Ordinary writes gain no liveness lookup. This prevents
orphan updates both after a cancelled create and when a new subscriber joins
a channel after an older component was removed. The documented fast lifetime
model still asks new roots/components to survive their first snapshot.

On the same Ryzen 7 7800X3D / WSL2 / Node 22.17.1 host, with the official Buffer
writer and counting transport, the cleanup stayed in the same performance range:

| Workload | Mean step, before → after | p95 step, before → after |
| --- | ---: | ---: |
| Plain ECS, 100 subscribers / 10,000 roots, idle, direct | 0.357 → 0.394 ms | 0.757 → 0.874 ms |
| Same population, 1% changing, direct | 3.955 → 4.047 ms | 5.434 → 5.611 ms |
| Same population, 1% changing, shared | 0.592 → 0.595 ms | 1.260 → 1.250 ms |
| Plain ECS, 20 subscribers / 1,000 roots, all changing, shared | 0.758 → 0.807 ms | 1.435 → 1.681 ms |
| Same smaller population, all written then 100 older roots replaced, direct | 24.609 → 23.670 ms | 29.449 → 27.462 ms |
| Same replacement workload, shared | 23.754 → 23.411 ms | 28.831 → 27.648 ms |

Each root has three components. These are medians of three per-process statistics
with 200 warmup and 600 measured ticks. An earlier repetition overlapped a heavy
unrelated workload; it is preserved but excluded from the table. The later runs
still used an unpinned development host. Individual repetitions and the unchanged
spatial control varied, so this is not evidence of a precise zero-cost change.
The measured idle/dense-shared increases are about 0.04–0.05 ms, while shared
sparse output remains around 0.6 ms for the larger population.

[The record](./records/2026-09-25-ecs-removal.json) retains every repetition,
source hashes, configuration, mutation/total timings and the shared harness
addition for writing live components before churn. Byte counts and sends match
across variants. Separate decode/apply probes checked all 60 live components for
three subscribers over 30 ticks in both output modes (10,800 component-state
checks per variant). Dedicated lifecycle regressions cover the actual orphan
cases; normal-workload byte equality alone does not prove their repair.

## Measured: public API and server transport boundary, 2026-09-25

Hiding engine bookkeeping from declarations should not add replication work.
This pass uses a typed view of the existing network object for server adapters,
creates the same User once per connection, and makes selected observations
read-only through accessors. It adds no per-packet wrapper, freeze or deep copy.

On the same Ryzen 7 7800X3D / WSL2 / Node 22.17.1 machine, three fresh-process
repetitions with rotated before/after order produced these median p50 / p95
values (milliseconds):

| Workload | Before p50 / p95 | After p50 / p95 |
| --- | ---: | ---: |
| Spatial ECS clump, 350 users / 350 roots, shared fragments | 2.764 / 7.153 | 2.765 / 6.197 |
| Plain ECS, 100 users / 10,000 roots, 1% changing, shared fragments | 0.499 / 1.275 | 0.522 / 1.258 |
| Automatic channel, 20 users / 1,000 moving entities, direct output | 5.711 / 8.824 | 5.380 / 8.674 |
| Client processing/pruning, 50,000 entities, 1% changing | 0.422 / 0.977 | 0.409 / 1.034 |
| Client reusable sampling, 50,000 entities | 21.398 / 27.221 | 19.337 / 24.652 |

Snapshot rows measure `Instance.step`; client rows measure the whole processing
or sampling phase. Snapshot measurements use 200 warmup / 600 measured ticks;
client measurements retain 240 frames with 60 warmup / 180 measured iterations.
Sampling this entire population is deliberately expensive and does not model a
renderer. These results show the same performance range, not a claimed speedup:
small slower results and run-to-run variation are retained. Snapshot bytes and
update counts match; client checksums and retained-history counts also match.
Socket I/O and browser scheduling are outside these harnesses.

[Saved evidence](./records/2026-09-25-public-contract.json) includes all repetitions,
settings, source hashes and comparison scope.

## Measured: optional client entity history, 2026-09-27

Games maintaining their own checkpoints can now skip nengi's entity-history
recording with `ClientOptions.entityHistory: false`. Raw state, frame facts,
recent-frame retention, requests and prediction remain available. Default
recording stays enabled. Grouped entity/header updates also decode directly
into their destination list, avoiding one temporary array per group without
changing public frame ownership or the wire format.

On the Ryzen 7 7800X3D / WSL2 / Node 22.17.1 host, three fresh-process runs per
variant with rotated order produced these medians of per-run p50 durations:

| Client workload | Before, default | After, default | After, history off |
| --- | ---: | ---: | ---: |
| Decode/apply, 65 bodies, 59 moving, two Float64 groups per body | 0.0470 ms | 0.0460 ms | 0.0294 ms |
| Decode/apply, 1,000 bodies, all moving, same groups | 0.9532 ms | 0.9068 ms | 0.6627 ms |
| Apply only, 1,000 scalar entities, all changing | 0.3475 ms | 0.3477 ms | 0.1113 ms |
| Apply only, 1,000 entities with vector/array values, all changing | 0.6395 ms | 0.6188 ms | 0.2479 ms |
| Apply only, 50,000 scalar entities, 1% changing | 0.3109 ms | 0.3222 ms | 0.0919 ms |
| Apply only, 10,000 ECS roots with three components each, 1% changing | 0.1780 ms | 0.1910 ms | 0.0503 ms |

The before source is the dirty pending rc.128 tree immediately preceding this
change. Both variants use identical measurement harnesses. Processes, including
runtime helper threads, were pinned to logical CPU 2; the host continued running
development services. The small decode workload uses 1,500 warmup / 6,000 measured
publications; the larger one uses 600 / 1,800. Encoding uses the official Buffer
backend outside timing. Measurements replay two alternating update packets and
exclude transport, physics, rendering and game checkpoint reconstruction.
Apply-only settings and the channel-close/ID-reuse workload are in the record.

In the smaller decode workload, the destination-list change removes 118 temporary
group arrays per publication (one per encoded group). Median observed GC event
counts over 6,000 publications were 68 before, 60 after with default history,
and 44 with history off. This is not a measurement of total allocated bytes or
complete game pauses. The opt-out reports zero history records and expiration
entries; ordinary retained frames still consume memory.

Default behavior stayed in the same overall range, with mixed small differences
and some slower tails. Dense decode p95 was 9.86 → 10.49 ms with history enabled;
history-off p95 had two runs around 1.8 ms and one around 8.7 ms. The initial ECS
p50 increase above prompted longer controls (1,500 warmup / 3,000 measured
iterations), which measured 0.1883 → 0.1816 ms p50 and 0.2998 → 0.2922 ms p95.
Both sets remain in the evidence; these controls do not establish a precise
zero cost or a universal speedup for normal history-enabled clients.

The useful capability is lower receive-side work for games that already own
their history, without making all clients borrow reusable frames or weakening
received-state ownership. Decode probes check all final motion fields and
applied-change counts. Packet sizes, checksums and default history counts match.
Lifecycle, prediction and request tests cover the option separately. No new
full-game Loam result is claimed.

[Saved evidence](./records/2026-09-27-client-history.json) includes every repeat,
longer controls, configuration and source/backend hashes. Reproduction commands
are in [the harness guide](./README.md#client-grouped-update-decoding).
