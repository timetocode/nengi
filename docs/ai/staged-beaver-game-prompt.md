# Prompt: Staged Beaver Game Prototype

Use this prompt in a fresh VS Code Codex session rooted at
`/home/neuron/nengi-all`.

```text
You are working in `/home/neuron/nengi-all` in the local nengi R&D workspace.

Build a small multiplayer browser game under `examples/<short-game-name>`.
Use TypeScript, Vite, PIXI.js, a Node server run with `tsx`, and the local nengi
workspace packages. Do not install nengi from npm.

Game premise: make a tiny top-down multiplayer game about beavers trying to
block a river. Players should be able to move around, interact with the world,
and gradually create or affect something river/dam related. Keep the game small
but playable.

Before coding, read:

1. `nengi/docs/ai/README.md`
2. `nengi/docs/ai/local-prototype.md`

Then read only the topic docs you actually need. Let the game design determine
whether the world should use `Channel` or `Channel2D`.

Create `AI_NOTES.md` early and update it as you work.

Important: build the game in staged passes. Do not try to implement the whole
idea at once. Before coding, write a short staged plan in `AI_NOTES.md`. Each
stage should leave the game runnable and more complete than before.

Use this staged structure unless the game clearly demands something else:

Stage 1: World foundation
- Create the server/client loop, networking primitives, player movement, camera,
  and main visibility model.
- Pick the channel type based on the game world.
- Make two browser tabs able to connect and see shared state.

Stage 2: Durable world interaction
- Add one persistent world object or resource that players can see and interact
  with.
- Use entities for durable shared state.

Stage 3: Private or scoped state
- Add one piece of private, scoped, or contextual state if the game needs it:
  carried wood, score, inventory count, dam progress, tool state, or a small
  channel-scoped surface.

Stage 4: Reactive actor or system
- Add one non-player actor, hazard, timer, environmental force, or simulation
  rule that reacts to prior state.
- For this game, river flow, drifting logs, fish, flood pressure, or dam pieces
  reacting to water would all be reasonable choices.

Stage 5: Conflict, failure, or edge case
- Add one rule where an action can fail or have a consequence: too far away,
  no materials, blocked placement, current too strong, depleted resource,
  damaged dam, full carry limit, or another small constraint.

After each stage:
- Keep the game runnable.
- Run `npm run typecheck` if possible.
- Update `AI_NOTES.md` with what changed, what nengi primitives were used, and
  any friction or uncertainty.

Use the local prototype package/import shape from `local-prototype.md`. Run:

- `npm install`
- `npm run rebuild:local`
- `npm run typecheck`
- `npm run dev`

If a command fails, investigate and record the exact issue in `AI_NOTES.md`.
Do not copy `examples/player-arena`; it is a stress/demo lab, not the template
for a fresh game.
```
