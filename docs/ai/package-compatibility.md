# Package compatibility

nengi core, each official transport adapter, and each binary backend have their
own package version. Release an adapter when its implementation, public API or
compatibility declaration changes. A compatible core fix or feature does not
require an adapter release.

## Installing and upgrading

An adapter's `peerDependencies.nengi` declares its supported core range. Its
normal dependencies declare the supported binary-backend range. npm checks the
combination during installation; commit the application lockfile to retain an
exact reproducible installation. Install only the transports the application
uses. The [adapter guide](./adapters.md) provides pinned installation recipes.

The rc.128 baseline uses `>=2.0.0-rc.128 <2.0.0` for official core and
binary dependencies. That range accepts later compatible `2.0.0-rc` releases,
but not rc.127, a different prerelease train, or a stable release. npm treats
prereleases specially; a stable range such as `^2.0.0` does not opt into them.
Do not bypass a peer conflict with `--force` or `--legacy-peer-deps`.

The final stable major is still undecided. At that transition, packages will
declare a stable core range with an explicit minimum. Subsequent compatible
minor and patch core releases can use the same adapter. Supporting another core
major requires an explicit compatibility assessment and peer-range update.

## Three different compatibility checks

| Check | What it describes |
| --- | --- |
| Package dependency ranges | Which installed releases the package supports |
| `clientAdapterVersion: 2` / `serverAdapterVersion: 1` | The local contract between core and a socket adapter |
| `WIRE_PROTOCOL_VERSION` and schema fingerprints | The protocol and registered data exchanged between client and server |

Core checks the client contract during construction. Server adapters check the
host contract during construction, and core checks it when creating a transport
connection. An unsupported contract fails clearly, before gameplay traffic.
These markers do not change for ordinary compatible package releases.

Preserve the documented transport behavior as well as its method signatures:
callback ownership, close/shutdown behavior, byte ownership and admission rules
are part of the contract. Binary reader/writer behavior is also an integration
contract, checked through types and Buffer/DataView conformance tests. It has no
separate numeric runtime marker at present.

Breaking an established adapter contract requires an intentional migration. For
stable releases that means a breaking core release; a compatible optional
addition does not require changing the contract marker. During this RC series,
we intend to preserve the adapter boundary even while other game-facing APIs
are still being refined.

A transport contract match does not establish client/server wire compatibility,
and a wire match does not establish application compatibility. During RC
development, deploy the same tested core release at both ends. Client and server
can use different transport packages, such as browser WebSocket and server ws.

## Verification

The release checks compile and exercise installed packages. They also test new
core with retained adapter tarballs, and current adapters with their minimum
core. Retained adapters are not rebuilt against new declarations during that
check. Runtime connections, binary round trips, native adapter smoke checks and
strict TypeScript consumers exercise the integration boundary.

Installation recipes record a tested combination. Compatibility ranges describe
the supported relationship; package numbers coinciding is not a requirement.
