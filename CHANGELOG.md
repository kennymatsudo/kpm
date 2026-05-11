# Changelog

KPM ships continuously — releases are version tags on `main`, and updating an install is `git pull && make app`.

## Format

- **Releases** are tagged from `main` via `make release:patch|minor|major`.
- **Release notes** for the most recent (unpublished) cut live in [`release-notes.md`](release-notes.md). They're regenerated from commits with `make release-notes`.
- **Versioning** follows [SemVer](https://semver.org/): patch = fixes only, minor = additive features, major = breaking changes to data formats or user-facing flows.

## Categories

Each release groups changes into:

- **New** — net-new user-facing features
- **Improved** — enhancements to existing features
- **Fixed** — bug fixes


## Unreleased

See [`release-notes.md`](release-notes.md) for changes staged for the next release.
