# Release Process

Clawback releases are tag-driven.

## Versioning

Use semantic versioning:

- `MAJOR` for breaking CLI, report schema, or workflow changes.
- `MINOR` for new checks, report features, workflows, or guarded update behavior.
- `PATCH` for bug fixes, docs, and regression coverage.

Examples:

- `v0.1.0`: first public release
- `v0.1.1`: bug fix
- `v0.2.0`: new validation capability

## Pre-Release Checklist

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Update `RELEASE_NOTES.md`.
4. Run:

```sh
npm run ci
npm pack --dry-run
```

5. If the release changes upgrade decisions, run a real local baseline and at least one container comparison.

## Create a Release

Create and push an annotated tag:

```sh
git tag -a v0.1.0 -m "Clawback v0.1.0"
git push origin v0.1.0
```

The `Release` GitHub Actions workflow will:

- install dependencies
- run `npm run ci`
- pack the npm tarball
- upload the tarball as a workflow artifact
- create a GitHub Release for the tag
- attach the tarball to the GitHub Release

## After Release

- Confirm the GitHub Release exists.
- Confirm the attached `clawback-<version>.tgz` artifact is present.
- Confirm CI passed on the tag.
- Open a follow-up issue for any release notes or docs cleanup.
