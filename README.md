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

## Deployment (GitHub Pages)

The app is deployed as a static site from the `main` branch via GitHub Actions.

One-time setup in GitHub:

1. Open repository `Settings`.
2. Go to `Pages`.
3. Set source to `GitHub Actions`.

After that, every push to `main` runs validation, e2e, and then deploys the static site automatically.

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
- Bottom navigation (`All`, `Restock`, `Settings`) with low-stock badge
- Dedicated Restock view (low-stock items only)
- Settings: default threshold, backup import/export, reset local data
- Import/export JSON backups
- Local persistence via `localStorage`
- Unit/persistence tests via Node test runner
- Mobile-focused Playwright e2e coverage for core inventory flows
