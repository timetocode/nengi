# Benchmarking game networking

Do not guess performance from channel names. Benchmark the game shape.

Nengi has performance tests for snapshot construction and examples for bot/end-to-end testing. A game can also add its own local benchmark that creates the same kinds of entities, users, visibility views, mutation rates, and churn patterns as the real game.

## Benchmark levels

Synthetic snapshot benchmarks:

- Do not need real sockets.
- Compare channel types and snapshot construction cost.
- Good for entity counts, user counts, visibility overlap, mutation fractions, schema width, update groups, and churn.

Scenario benchmarks:

- Use game-shaped entities/components.
- Use realistic movement and mutation systems.
- Good for deciding whether to switch from automatic to manual mutations.

Bot/end-to-end benchmarks:

- Run a real server and connect clients/bots.
- Include connection overhead, adapter behavior, send pressure, event loop pressure, and client/bot bottlenecks.
- Useful later, after synthetic benchmarks identify promising designs.

## What to vary

- Number of users.
- Number of entities.
- Number of visible entities per user.
- Mutation fraction per tick.
- Schema width.
- Single prop writes vs update groups.
- Shared update fragments enabled/disabled.
- Entity churn per tick.
- User clustering vs spread-out users.
- 2D rectangle vs circle, 3D box vs sphere.
- Automatic channel vs matching manual channel.

## Interpreting results

Spatial channels win when they let nengi skip most entities for most users.

Manual channels win when game code knows what changed and many entities/properties do not need scanning.

Regular `Channel` can be best when everyone sees everything and most properties mutate anyway.

End-to-end bot tests can be limited by bot/client performance. If bots cannot keep up, make the server simulate movement so snapshots still reflect the intended stress.

## Recommended workflow

1. Implement the feature with the simplest correct channel.
2. Add a synthetic benchmark that resembles the game.
3. Measure the baseline.
4. Try the likely optimization, such as spatial culling or manual mutations.
5. Measure again.
6. Only keep the added complexity if the benchmark shows a useful win.

## Where to look in nengi

Start with `src/performance/README.md` and the performance files in `src/performance`. They are research-oriented and may change, but they show the kinds of dimensions worth testing.

Use bot/end-to-end tests later when you need to measure real connections and adapter behavior.
