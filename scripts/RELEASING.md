# Independent package releases

Core, the six socket adapters, and the two binary backends use independent
versions. Only packages with changed shipped contents or compatibility metadata
need new releases. A stable package uses normal semver for its own API, including
changes that drop previously supported core versions. Keep the client/server
adapter contract stable across compatible core releases.

The transition baseline is **2.0.0-rc.128**. All nine packages change in
this transition. Their ranges are `>=2.0.0-rc.128 <2.0.0`, deliberately excluding
the published rc.127 APIs, future unrelated prerelease trains and the undecided
stable release. Once the stable major is chosen, set stable peer ranges with an
explicit minimum. Do not use `includePrerelease: true` to broaden npm semantics.

## Prepare and verify

1. Update only the changed package versions, their migration notes and pinned
   installation guidance. Public dependency and peer ranges describe supported
   releases; development pins and lockfiles record reproducible build inputs.
2. Install changed third-party dependencies with npm. With the nine repositories
   checked out as siblings and development tools installed, run
   `npm run release:locks` from core to refresh existing family lock entries from
   real, freshly built tarballs. It preserves an intentionally older development
   pin. It does not resolve new third-party dependencies.
3. Run `npm run release:check`. This includes release-policy tests, the whole
   current family, the copied starter's strict build and live connection lifecycle,
   frozen-artifact compatibility, clean builds, shipped documentation links and
   lock verification. Node, npm, Bun and Deno must be available on PATH.
4. Commit the prepared repositories before an actual publication. A dry run may
   inspect uncommitted work. Human qualification and publication are separate
   decisions; passing these checks alone does not approve a release.

Staged lockfiles contain registry URLs and measured SHA-512 integrities for
unpublished packages. Those URLs are **not downloadable until publication**.
During preparation, family builds and tests use isolated local tarballs and the
checkout's installed tools. A fresh `npm ci` with those locks needs the baseline
published first. Refresh locks after changing shipped files; never invent an
integrity or describe a staged artifact as already published.

The scripts do not require all versions to match. A development core pin can
remain on an older compatible version while the family gate tests newer core.
`npm run test:compatibility` runs the frozen-artifact checks independently.

## Frozen compatibility evidence

`scripts/compatibility-baseline` holds the initial core and adapter tarballs plus
their hashes. These are source-only test fixtures, excluded from the npm package.
The rc.128 baseline was frozen from the final initial-release artifacts on
2026-10-05. The earlier unpublished bootstrap was preserved separately before
this first publication; it preceded the close-race fix and final package docs.
See the baseline README for provenance. Tests never regenerate the fixtures.

The gate checks current core with frozen adapters, then current adapters with
minimum core. Both lanes verify installed contents and dependency resolutions,
strict declarations, ws/uWS and browser-shaped connections, Buffer/DataView
round trips, and native Bun/Deno smoke behavior. When current core still has the
baseline version, an additional temporary core manifest advances its RC number
to prove version skew installs. That probe changes no implementation and is not
evidence about future engine changes.

When adding support for another compatibility floor, deliberately retain the
relevant published tarballs and hashes and extend the matrix. Do not regenerate
old fixtures to hide a regression. `record-adapter-baseline.mjs` bootstraps an
absent baseline only and refuses to overwrite an existing manifest. Before the
first publication, verify the frozen bootstrap against the final release bytes
and retain any difference explicitly as local-build provenance.

## Publish a selected set

For the initial transition, preview all nine packages:

```sh
npm run release:publish:dry-run -- --all --tag rc
```

Afterward, a core-only release can use:

```sh
npm run release:publish:dry-run -- --packages nengi --tag rc
npm run release:publish -- --packages nengi --tag rc
```

For several changed packages, provide comma-separated names. The script orders
them by dependency, runs the full gate, and prepares exact tarballs. It refuses
changed contents under an already-published version, unpublished unselected
packages, or moving a selected package's tag backward. Unselected packages are
neither published nor retagged. A partial release can resume when previously
published artifacts match byte-for-byte.

The script explicitly targets npmjs.org, authenticates only for a real publish,
and publishes the inspected tarballs without rebuilding them. Use `--tag latest`
for stable versions; prereleases cannot go through that path. A release set that
mixes stable and RC packages must be published in separate tagged steps.
