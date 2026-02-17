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

## Git Hooks

Enable repo-managed hooks once per clone:

```bash
./scripts/setup-git-hooks.sh
```

After setup, every `git commit` runs `./scripts/validate.sh` via pre-commit.

## Current status

Milestone A and B are implemented:

- Foundation inventory model with starter household items
- All-items view with search and urgency sorting
- Fast quantity controls (`-`, `+`, tap quantity to set)
- Bottom navigation (`All`, `Restock`, `Settings`) with low-stock badge
- Dedicated Restock view (low-stock items only)
- Local persistence via `localStorage`
