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
- Fast quantity controls (`-`, `+`, tap quantity to set)
- Quick add from main view (no Settings navigation required)
- Remove items directly from main list (with confirmation)
- Bottom navigation (`All`, `Restock`, `Settings`) with low-stock badge
- Dedicated Restock view (low-stock items only)
- Settings: default threshold, add/edit/delete items, reset local data
- Import/export JSON backups
- Local persistence via `localStorage` with schema migration support
- Unit/persistence tests via Node test runner
