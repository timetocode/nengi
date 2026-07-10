# Releasing the Nengi package family

The package family is published together under the npm `rc` dist-tag. The
publisher runs packages in dependency order and refuses a real publish unless
all seven repositories are clean and use the same RC version.

## Before publishing

1. Set the same version in every package and align all exact Nengi-family
   dependencies, peer dependencies, lockfiles, package READMEs, and canonical
   documentation.
2. Commit the release in every package repository.
3. Authenticate once with npm from any directory:

   ```sh
   npm login
   ```

4. Preview the full release without writing to the registry:

   ```sh
   cd /path/to/nengi-all/nengi
   npm run release:publish:dry-run
   ```

## Publish

```sh
npm run release:publish
```

The command:

- runs the complete family release check
- verifies one npm authentication session
- publishes all seven packages with `npm publish --tag rc`
- skips packages already published at the family version
- repairs a missing `rc` tag when resuming a partial release

Publishing multiple npm packages is not atomic. If a network or registry error
stops the command partway through, correct the problem and run the same command
again. Already-published packages are verified and skipped.

## Authentication without repeated prompts

`npm login` stores one user-level authentication session; it is not scoped to
the current package directory. Accounts configured to challenge every write
may still request a second factor for each publish.

For local non-interactive publishing, npm supports a short-lived granular
access token with read/write access limited to these seven packages and the
`bypass 2FA` option enabled. Keep that credential in the user environment or
user-level npm configuration, never in this repository.

For long-term automation, prefer npm trusted publishing from a cloud-hosted CI
workflow. One workflow can check out the seven repositories and publish the
family; each npm package must be configured once to trust that workflow.

The npm dist-tag and Git tags are separate concepts. This script manages the
npm `rc` dist-tag. Create and push Git tags from each package repository after
the release commits are finalized according to the repository's release
policy.
