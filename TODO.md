# TODO - Mobile-First Household Inventory App

## Product Goal

- Build a simple, minimal web app to track household consumables.
- Make it obvious at a glance what is running low.
- Make quantity updates very fast on mobile.

## Guiding Principles

- Mobile-first layout (one-hand use, large tap targets).
- Minimal UI (no clutter, fast load, fast interactions).
- Local-first data persistence (works without backend initially).

## Feature Breakdown

### 1. Inventory Data Model (Foundation)

- [x] Define item shape: `id`, `name`, `quantity`, `lowThreshold`, `category` (optional), `updatedAt`.
- [x] Seed starter household items (dish soap, toothpaste, etc.).
- [x] Add validation rules (no negative quantity, required name).

### 2. Core Inventory View (All Items)

- [x] Build main list showing all items and current quantity.
- [x] Add quick search/filter by name.
- [x] Sort by "needs restock first" then alphabetical.

### 3. Fast Quantity Controls

- [x] Add large `-` and `+` controls for each item row.
- [x] Support direct quantity edit (tap value).
- [x] Add ultra-fast actions (e.g., decrement by 1, increment by 1).

### 4. Low-Stock Logic + Restock View

- [x] Mark item as low when `quantity <= lowThreshold`.
- [x] Create dedicated "Restock" view with only low items.
- [x] Show low-stock count badge in navigation.

### 5. Multi-View Navigation

- [x] Add bottom nav tabs: `All`, `Restock`, `Settings`.
- [x] Preserve filters/state when switching tabs.
- [x] Ensure smooth switching with no full page reload.

### 6. Settings (Minimal)

- [ ] Manage low-stock threshold defaults.
- [ ] Add item creation/edit/delete flow.
- [ ] Add reset/clear local data action with confirmation.

### 7. Persistence + Reliability

- [x] Persist data in `localStorage` (or IndexedDB if needed later).
- [x] Autosave after each quantity change.
- [ ] Add basic import/export JSON backup.

### 8. UX Quality (Mobile-First)

- [x] Ensure touch targets are comfortable (>= 44px height).
- [ ] Keep key actions visible without scrolling where possible.
- [x] Add simple visual cues for low stock (color + icon/text).

### 9. Testing

- [ ] Unit tests for low-stock calculation and sorting.
- [ ] UI tests for quick increment/decrement interactions.
- [ ] Test multi-view behavior and persisted state.

## Suggested Implementation Order

- [x] Milestone A: Foundation + All Items + Fast Quantity Controls.
- [x] Milestone B: Low-stock logic + Restock view + nav badge.
- [ ] Milestone C: Settings + persistence hardening + tests.

## MVP Definition

- [ ] User can add household items.
- [x] User can quickly adjust quantities from the main list.
- [x] User can open a dedicated Restock view to see low items only.
- [x] Data persists across page reloads on mobile.
