# Working on nengi

In a source checkout, start performance-sensitive engine work with the
[performance ambition and demonstrated results](./src/performance/PERFORMANCE.md)
and the [benchmark harness guide](./src/performance/README.md). They preserve
what nengi has achieved, the conditions behind the measurements, and the evidence
for future comparisons.

With all nine official package repositories checked out as siblings and their
development dependencies installed, `npm run build:family` builds the current
family together before replacing local build outputs. `npm run test:family`
builds and packs the current sources into a temporary workspace, installs those
tarballs in a fresh consumer, checks their contents and dependency resolutions,
then runs every package's tests, ws/uWS connection checks and binary-backend
compatibility checks. It also copies the starter from the installed package,
builds it against packed declarations and exercises its actual server and client
presentation code over WebSockets. It also checks current core against frozen adapter
artifacts and current adapters against their minimum core. Version equality is
not required; installed bytes and declared compatibility are verified. The full test run requires
Node, npm, Bun, Deno, and access to install npm dependencies. It does not publish
or replace the checkout's installed dependencies or lockfiles.

Set `NENGI_FAMILY_KEEP=1` to retain the printed temporary workspace, including its
tarballs, `verification.json` and `compatibility.json`. Failed runs always
retain their workspace. See [release workflow](./scripts/RELEASING.md) for
independent package versions, staged lockfiles and selected-package publishing.

