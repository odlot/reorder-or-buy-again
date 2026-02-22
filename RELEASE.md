# Release Guide

This project uses SemVer with:
- automatic `PATCH` releases on successful merges to `main`,
- manual `MINOR`/`MAJOR` releases when explicitly needed.

## Versioning Policy

- `MAJOR`: breaking behavior or data compatibility changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes/docs/chore updates.

## Pre-Release Checklist

1. Sync branch and ensure `main` is green.
2. Run local CI flow:

```bash
npm run ci:local
```

3. If needed for Linux parity:

```bash
CI_LOCAL_WITH_DEPS=1 npm run ci:local
```

4. Confirm README `Changelog` has a clear `Unreleased` section.
5. Verify important PRs are merged and release scope is frozen.

## Automatic Patch Pipeline

- Trigger: push to `main` (for example after a merged PR).
- Order: validate -> e2e -> GitHub Pages deploy -> patch release.
- Release behavior:
  - find latest `vMAJOR.MINOR.PATCH` tag,
  - increment patch by 1,
  - tag the deployed `main` commit,
  - publish a GitHub Release with generated notes.
- Idempotency: if the `main` commit is already tagged, release creation is skipped.

## Manual Mobile Smoke (Required)

### iOS Safari

- Launch app and verify existing local state loads.
- Add item via quick-add and confirm quantity defaults to `1`.
- Verify `+`, `-`, inline quantity edit, and delete + undo.
- Open `Shopping` and verify low-stock grouping/filtering logic.
- Open `Settings` and verify:
  - sync status chip updates correctly,
  - `Sync Now` works,
  - `Clear Sync Link` works as expected.

### Android Chrome

- Repeat all iOS checks.
- Verify offline sync specifics:
  - link sync file,
  - close/reopen app and confirm sync link restore behavior,
  - force a sync conflict and resolve it.

## Manual Minor/Major Release Steps

1. Pick next target `MINOR` or `MAJOR` version.
2. Run release preparation from `main`:

```bash
git checkout main
git pull --ff-only origin main
./scripts/release.sh X.Y.Z
```

This script:
- runs local CI (`npm run ci:local`) unless `--skip-ci` is used,
- verifies changelog/release metadata in `README.md`,
- rolls `Unreleased` entries into `vX.Y.Z - YYYY-MM-DD`,
- creates a fresh `Unreleased` placeholder,
- updates `Current release channel`,
- creates a release commit and annotated tag.

3. Push commit and tag:

```bash
git push origin main
git push origin vX.Y.Z
```

You can also use `./scripts/release.sh X.Y.Z --push` to push both automatically.

4. Publish GitHub Release notes from tag `vX.Y.Z`.

## Post-Release

- Monitor GitHub Actions on `main`.
- Verify GitHub Pages is serving the expected commit.
- If issues are found, patch via `PATCH` release process.
