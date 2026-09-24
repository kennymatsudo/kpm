# Changelog

KPM ships continuously — releases are version tags on `main`, and updating an install is `git pull && make app`.

## Format

- **Releases** are tagged from `main` via `make release:patch|minor|major`.
- **Release notes** are generated from the commits since the last tag by `make release-notes`, which writes `release-notes.md`; the release targets run it and commit the result.
- **Versioning** follows [SemVer](https://semver.org/): patch = fixes only, minor = additive features, major = breaking changes to data formats or user-facing flows.

## Categories

Each release groups changes into:

- **New** — net-new user-facing features
- **Improved** — enhancements to existing features
- **Fixed** — bug fixes
- **Removed** — features taken out

Internal-only changes (refactors, dependency bumps, CI, docs) are intentionally excluded from release notes — see the [git log](https://github.com/kennymatsudo/kpm/commits/main) for the full history.

## Unreleased

No release has been tagged yet. Until one is, the [git log](https://github.com/kennymatsudo/kpm/commits/main) is the change history.
