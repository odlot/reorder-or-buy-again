# reorder-buy-again

An application to keep track of what to reorder or buy again.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Validation

Run the same validation locally that CI runs:

```bash
./scripts/validate.sh
```

This runs:

- JavaScript syntax checks for `src/*.js` and `tests/*.test.js`
- Node test suite via `node --test`

Run end-to-end tests locally:

```bash
npm install
npx playwright install chromium
./scripts/test-e2e.sh
```

Run the full CI validation flow locally (validate + e2e):

```bash
npm run ci:local
```

Notes:
- This keeps `validate` and `e2e` as separate scripts and executes them sequentially.
- For Linux dependency parity with CI, run:

```bash
CI_LOCAL_WITH_DEPS=1 npm run ci:local
```

Prepare a release (from `main`) with automated changelog + tag creation:

```bash
npm run release -- 0.1.0
```

In GitHub Actions CI, Playwright debug artifacts (`playwright-report/`, `test-results/`) are uploaded automatically when e2e fails.

## Versioning and Changelog

- Versioning model: SemVer (`MAJOR.MINOR.PATCH`).
- Current release channel: v0.1.0.
- Release process and checklist: see `RELEASE.md`.

### Changelog

#### Unreleased

- _No changes yet._

#### v0.1.0 - 2026-02-18

- Mobile-first inventory management with fast quantity controls.
- Shopping-focused low-stock workflow with planned buy quantities.
- Local persistence via `localStorage`.
- Offline file sync mode with status chip, conflict handling, and clear link action.
- CI pipeline with validate + Playwright e2e + GitHub Pages deployment.

## Deployment (GitHub Pages)

The app is deployed as a static site from the `main` branch via GitHub Actions.

One-time setup in GitHub:

1. Open repository `Settings`.
2. Go to `Pages`.
3. Set source to `GitHub Actions`.

After that, every push to `main` runs validation, e2e, and then deploys the static site automatically.

## Persistence and Offline Sync

- The app always persists immediately to browser `localStorage`.
- `localStorage` is isolated per device/browser/profile, so desktop and mobile can diverge.
- Optional offline file sync is available in `Settings`:
  - `Link Sync File` selects a JSON file on disk.
  - linked handle is persisted locally and restored on reload where supported.
  - local changes auto-sync to that file (debounced).
  - `Sync Now` forces sync and resolves full-snapshot conflicts.
  - `Clear Sync Link` removes the linked file handle from this device/browser.
- Sync status chip meanings:
  - `Synced`: local snapshot and linked file match.
  - `Syncing`: file sync in progress.
  - `Offline`: local-only mode (no file linked / unsupported browser).
  - `Conflict`: same-timestamp mismatch detected; resolve via `Sync Now`.
- Settings also shows a tiny `Last synced` timestamp (`never` until first successful sync).

### Sync E2E Coverage

- Offline sync behavior is tested end-to-end in `tests/e2e/offline-sync.spec.js`.
- The e2e test uses a deterministic mock for the file picker API so CI can validate sync logic consistently.
- This verifies:
  - writing local changes to the linked sync file
  - pulling newer snapshots from the linked sync file
  - same-timestamp conflict detection + resolve flow
  - clear-sync-link behavior

### Browser Support (Transparent Expectations)

- Core app features (`localStorage`, inventory editing): broadly supported on modern browsers.
- Offline sync file mode requires `window.showSaveFilePicker` (File System Access API).
- As of February 17, 2026:
  - Supported (offline sync mode): Chromium-based desktop browsers (for example Chrome, Edge, Opera).
  - Not supported (offline sync mode): Firefox and Safari (including iOS Safari).
  - Mobile browser support for this API is inconsistent; treat offline sync mode as unsupported unless verified on the specific device/browser.
- If unsupported, the app explicitly stays in `Offline` state and continues to persist locally.
- Sources:
  - MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
  - Can I Use: https://caniuse.com/native-filesystem-api

## Mobile Smoke Checklist

Run this before each release on real devices:

- iOS Safari:
  - Open app and confirm existing local state loads.
  - Quick-add item defaults to quantity `1`.
  - `+`, `-`, inline quantity edit, and delete + undo all work.
  - Shopping tab shows only low-stock items.
  - Settings sync status chip updates and `Sync Now`/`Clear Sync Link` behave correctly.
- Android Chrome:
  - Repeat all checks above.
  - Verify offline sync link/restore and conflict resolution flow.

Detailed release checklist lives in `RELEASE.md`.

## Git Hooks

Enable repo-managed hooks once per clone:

```bash
./scripts/setup-git-hooks.sh
```

After setup, every `git commit` runs `./scripts/validate.sh` via pre-commit.

## Current status

Milestones A, B, and C are implemented:

- Foundation inventory model with starter household items
- All-items view with search and urgency sorting
- Fast quantity controls (`-`, `+`, inline quantity edit)
- Quick add from main view (no Settings navigation required)
- Remove items directly from main list (with undo)
- Bottom navigation (`All`, `Shopping`, `Settings`) with low-stock badge
- Dedicated Shopping view (low-stock items only)
- Shopping planning actions (`+/-`, quantity input, `Max`, `Apply purchases`, `Copy list`, `Share list`)
- In-app quantity check reminders with one-tap `Check`, dedicated `Due checks` filter, and bulk `Confirm all due` action
- Per-item source categories (multi-select) and room assignment, with source/room filtering
- Shopping grouped by source category, including `Unassigned` fallback and per-row source tags
- Settings: default threshold, backup import/export, reset local data
- Import/export JSON backups
- Local persistence via `localStorage`
- Unit/persistence tests via Node test runner
- Mobile-focused Playwright e2e coverage for core inventory flows
