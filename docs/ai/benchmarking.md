# Benchmarking and bot workloads

This is an application-facing guide for measuring a game's network behavior.
Do not guess performance from channel names. Benchmark the game shape.

Nengi has performance tests for snapshot construction and bot/end-to-end load.
A game can also add its own local benchmark that creates the same kinds of
entities, users, visibility views, mutation rates, and churn patterns as the
real game.

Bots are a maintained part of that workload. A bot should exercise the same
client protocol as a player: connect, receive frames, observe state, send
commands, perform requests, and disconnect. This tests more of the real game
than a server loop that only teleports entities or calls simulation functions.

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
- Use maintained bot scenarios for both correctness smoke tests and load tests.
- Separate client/adapter transport load from server-only simulation load when
  interpreting results.

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

## Maintain bots with the game

Keep at least one bot client in sync with the game while the game is developed.
The bot should import the same shared context, schemas, commands, requests, and
messages as the real client. When a protocol or gameplay action changes, update
the bot in the same change. A stale bot can produce misleading failures and a
false sense of coverage.

Use the Node client adapter for live bot processes:

```ts
import { Client } from 'nengi'
import { WsClientAdapter } from 'nengi-ws-client-adapter'

const bot = new Client(context, WsClientAdapter, serverTickRate)
const result = await bot.connect(target, { role: 'bot', seed })

if (!result.accepted) {
    throw result.reason
}

function botStep() {
    for (const frame of bot.network.drainFrames()) {
        observeFrame(frame)
    }

    bot.addCommand(readBotInput())
    bot.flush()
}
```

The live bot must use the exact Nengi and adapter versions used by the server,
and a Node binary backend such as `nengi-buffers`. See [adapters.md](./adapters.md)
for the pinned installation shape. Use `LocalClientAdapter` and
`LocalInstanceAdapter` when a deterministic in-memory workload is more useful
than socket and transport pressure.

Bots do not need a renderer. They do need enough client state to classify
channels, drain frames, track the controlled entity, confirm important actions,
and notice protocol failures. A bot that only emits commands without reading
frames does not exercise the client receive path or reveal visibility and
lifecycle errors.

## Bot scenarios

Maintain short scenarios that model valid player behavior:

- connect, authenticate, receive the player assignment, and enter the world
- move and aim at a fixed command cadence
- fire, interact, use abilities, or send requests at deliberate rates
- observe nearby entity creates, updates, deletes, and transient messages
- join and leave scoped channels such as rooms, inventories, or parties
- disconnect cleanly after an active session

Use deterministic seeds and record the scenario name, seed, duration, command
rate, request rate, bot count, and server version. A scenario should fail on a
connection denial, unexpected disconnect, malformed response, missing expected
state transition, or unbounded frame backlog.

## Stress shapes

Run more than one workload shape:

- steady state: a fixed population performs ordinary actions for a long period
- ramp: bots connect in waves until the target population is reached
- burst: many bots connect, subscribe, or act in a short interval
- mixed: some bots move, some fire, some request, and some remain idle
- churn: bots repeatedly connect, enter the game, act, disconnect, and repeat

Churn is particularly valuable for finding lifecycle bugs and memory leaks.
After each churn window, inspect active users, subscriptions, authoritative
entities, pending queues, timers, room indexes, and application-owned maps. The
counts that should return to zero should return to zero. For a long run, compare
process memory and heap snapshots after equivalent windows rather than judging
one instantaneous sample.

Keep churn actions valid and wait for disconnect completion before starting the
next session. Otherwise the workload can measure the test harness's overlap
rather than the game's lifecycle behavior.

## Interpreting results

Spatial channels win when they let nengi skip most entities for most users.

Manual channels win when game code knows what changed and many entities/properties do not need scanning.

Regular `Channel` can be best when everyone sees everything and most properties mutate anyway.

End-to-end bot tests can be limited by bot/client performance. If bots cannot keep up, make the server simulate movement so snapshots still reflect the intended stress.

## Recommended workflow

1. Pick the channel that matches the game model.
2. Add a maintained bot that can connect, observe frames, perform one ordinary
   action, and disconnect.
3. Run the bot as a correctness smoke test while the game changes.
4. Add a deterministic in-memory scenario for domain and snapshot behavior.
5. Add live bot workloads for steady state, ramp, and churn.
6. Add a synthetic benchmark that resembles the game.
7. Measure the baseline.
8. Try a competing valid model or mutation path, such as automatic versus
   manual spatial.
9. Measure again.
10. Keep the implementation that gives the right semantics with acceptable
   performance and complexity.

## Where to look in nengi

Start with `src/performance/README.md` and the performance files in `src/performance`. They are research-oriented and may change, but they show the kinds of dimensions worth testing.

Use bot/end-to-end tests throughout development for gameplay smoke coverage,
connection behavior, lifecycle churn, and realistic load. Use synthetic tests
when you need to isolate a snapshot or channel cost from transport and client
work.
