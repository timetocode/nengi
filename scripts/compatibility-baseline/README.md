# rc.128 compatibility baseline

These artifacts are the final `2.0.0-rc.128` package set, frozen on 2026-10-05
for its first npm publication. The manifest records the exact package contents
and SHA-512 integrities. Tests install these bytes without rebuilding adapters.
This directory is a source-only fixture and is excluded from the npm package.

The initial, unpublished bootstrap preceded the WebSocket close/send correction,
the entity-history option and the completed starter/documentation. Before the
first publication it was archived separately, including its original manifest
and tarballs, and replaced with this release set. This establishes the actual
minimum published core and adapters; it does not change an already published
compatibility floor. The release record retains both sets of artifact identities.

After publication, preserve these files unchanged. Future compatible releases
must pass against them. Add a separately identified baseline when deliberately
changing the supported minimum; do not rewrite this one to make tests pass.
