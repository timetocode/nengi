You are working in the local nengi R&D workspace.

Before creating files, verify that you are operating from a shell that can run
the local toolchain. Run:

pwd
node -v
npm -v

If `node` or `npm` is missing and you are in Windows PowerShell targeting a WSL2
folder such as `\\wsl$\Ubuntu\home\neuron\nengi-all`, retry through an
interactive WSL shell because nvm may only load Node/npm for interactive bash.
Do not switch the whole Codex environment to WSL2 just to access Node/npm; that
can make replies extremely slow. Prefer explicit WSL commands from the default
shell:

wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all && pwd && node -v && npm -v && which node && which npm"

Use `bash -ic` exactly. Do not use `bash -lc`, `bash -c`, PowerShell `npm`, or
the UNC path as the command working directory for Node/npm commands. Project
commands should `cd` to Linux paths under `/home/neuron/nengi-all`.

For later commands from PowerShell, use the same pattern, replacing the command
inside the quotes:

wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/prototypes/<game-name> && npm install"
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/prototypes/<game-name> && npm run typecheck"
wsl -d Ubuntu -- bash -ic "cd /home/neuron/nengi-all/prototypes/<game-name> && npm run dev"

If commands fail with a sandbox/tool setup error such as
`windows sandbox: helper_unknown_error: setup refresh had errors`, treat that as
a Codex tool-execution problem, not as proof that Node/npm or the project are
missing. If the Codex UI supports escalation/approval for shell commands,
request escalation and rerun the same explicit `wsl -d Ubuntu -- bash -ic "..."`
command. If escalation is unavailable or still fails, continue by reading the
docs and creating the game if file editing still works. Create `AI_NOTES.md`
early and record the exact sandbox error under environment notes. Skip runtime
verification until command execution works.

Only stop before implementation if both command execution and file editing are
unavailable. If shell commands are unavailable but files can be edited, proceed
with implementation and clearly mark install/typecheck/dev verification as
blocked in `AI_NOTES.md`.

Build a minimal multiplayer browser game prototype under:

prototypes/<choose-a-short-game-name>

Use TypeScript, Vite for the browser client, and a Node server run with tsx.
Do not install nengi from npm. Use the local workspace packages and the local
prototype pattern documented in nengi/docs/ai/local-prototype.md.
When using the official adapter packages, keep all nengi imports in one package
universe: use the `shared/nengi.ts` shim from local-prototype.md, which
re-exports from package `nengi`. Do not mix `../../../nengi/src` imports with
adapter packages.

Start by reading:

1. nengi/docs/ai/README.md
2. nengi/docs/ai/local-prototype.md
3. nengi/docs/ai/networking-primitives.md
4. nengi/docs/ai/channel-selection.md
5. nengi/docs/ai/client-router.md
6. nengi/docs/ai/minimal-spatial-game.md

Treat those docs as the source of truth. Do not copy an unrelated project as
your implementation model.

Basic requirements:

- Use PIXI.js v8 and make minimalistic art out of shapes
- Use a server-authoritative model.
- Use a nengi channel choice that matches the game's visibility model.
- Include at least one persistent entity type.
- Include one repeated client command for movement or control.
- Render players or objects in the browser.
- Support two browser tabs connecting at the same time and seeing each other.

Implementation requirements:

- Create a package.json, tsconfig.json, vite.config.ts, client files, server
  files, and shared schema/context files.

- Add an AI_NOTES.md file in the game directory before or near the beginning
  of implementation.
- Update AI_NOTES.md as you work, not only at the end.
- In AI_NOTES.md, record:
  - the environment preflight output or failure
  - what docs you read
  - why you chose the channel type
  - why each nengi primitive was used
  - any API or documentation friction
  - anything that was pleasant or clear
  - anything you guessed or had to infer
  - any TypeScript/build/import problems
  - what you would change in the docs or API

Game specification
- You have a fair amount of freedom as the game you are making is a test of the nengi engine and its accompanying ai documentation not an actual game intended for release
- The game should be space-themed. Each player who connects is represented by a small ship, with a camera following it
- Brainstorm and decide what else goes into this game demo. There should be at least something to gather or accumulate, and a threat. Be creative. Write what you intend for the game into the notes before you make it, and add notes if you elect to change the design for some reason.

Verification requirements:

- Run npm install in the new game directory if needed.
- If local package builds may be stale, run npm run rebuild:local.
- Run npm run typecheck.
- Run or start the dev server/client if feasible. Prefer npm run dev:fresh when
  the local package build state is unknown.
- If a command fails, fix it if reasonable. If not, write the failure and likely
  cause in AI_NOTES.md.
