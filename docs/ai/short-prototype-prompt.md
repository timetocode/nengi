# Prompt: Short Local Prototype

Use this prompt in a fresh VS Code Codex session rooted at
`/home/neuron/nengi-all`.

```text
You are working in `/home/neuron/nengi-all` in the local nengi R&D workspace.

Build a small multiplayer browser game under `examples/<short-game-name>`.
Use TypeScript, Vite, PIXI.js, a Node server run with `tsx`, and the local nengi
workspace packages. Do not install nengi from npm.

Game flavor: make a tiny top-down multiplayer "lantern garden" prototype.
Players move through a dark garden, collect drifting lights, and interact with
one simple shared hazard or object of your choice.

Before coding, read:

1. `nengi/docs/ai/README.md`
2. `nengi/docs/ai/local-prototype.md`

Then read only the topic docs you actually need. Let the game design determine
whether the world should use `Channel` or `SpatialChannel2D`.

Create `AI_NOTES.md` early and update it as you work. Record what docs you read,
why you chose each nengi primitive, what was confusing, what worked well, and
how you verified the game.

Keep the prototype small. It should support two browser tabs connecting at the
same time, moving around, and seeing shared state.

Use the local prototype package/import shape from `local-prototype.md`. Run:

- `npm install`
- `npm run rebuild:local`
- `npm run typecheck`
- `npm run dev`

If a command fails, investigate and record the exact issue in `AI_NOTES.md`.
Do not copy `examples/player-arena`; it is a stress/demo lab, not the template
for a fresh game.
```
