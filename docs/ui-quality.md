# UI Quality

Reference for UI rendering under `AGENTS.md`. `AGENTS.md` is normative; this file is the detail. On conflict, `AGENTS.md` prevails.

Applies to every change that renders UI.

## 1. First frame

- The first render shows the final state or a stable slot, never a default that gets swapped after async load.
- A "pending" state must never look like a valid state (e.g. `0`, "No X found", "Editing").
- Seed the first render from already-known data (cache/snapshot).
- Never mask flicker with delay, timeout, or CSS hiding. Scope is covering loading/flicker only; timers for other purposes are out of scope.
- Functional timer exceptions (not loading masks; do not remove): `src/renderer/src/components/frame/go-ride.tsx` (launch/running/stopping state machine and polling), `src/renderer/src/lib/practice-validate.ts` (shared-validation promise release), and `src/renderer/src/App.tsx` (1.5s reload indicator auto-dismiss after sessionStorage flag).
- Base rules live in `AGENTS.md` (Code standards: inputs render immediately, no visual flickering).

## 2. UI text: fixed or absent

- Guidance text is fixed and independent of state (loading, selection, empty, cache).
- Do not add status/count/indicator text that varies with data or selection.
- Allowed exceptions: confirmed error, in-progress action feedback (`saving`, `launching`, `downloading`), the reload indicator ("Reloading", ~1.5s after sessionStorage flag), functional content (select value, data name), and the setup editor "(missing)" marker for absent mods.
- **Exception — Bikes/Tracks fixed hint**: the fixed guidance in the empty card (`BIKES_FIXED_MESSAGE`, `TRACKS_FIXED_MESSAGE`) is part of the empty state only. It is replaced by the grid when mods are present, and replaced by the confirmed invalid error when `valid:false && ready:true`. It never appears alongside the grid or the error.
- **Exception — Bikes/Tracks item count**: the count `Badge` in `mod-list-header.tsx` is functional data showing the displayed items. It shows the number (including `0`) whenever a response exists: a received mods snapshot (any `valid`/`ready`) or an empty/unconfigured effective Mods Path (post-reset). It does not depend on `ready:true`. It renders an empty fixed-size slot (no layout shift) only on the first real load (no snapshot and Mods Path not yet known). Zero filtered results show `0` above an empty grid with no new message.
- Base rules: `AGENTS.md` (Language: English; Validation rules: Go Ride is the exclusive launch-validation display point).

## 3. Inputs and fields

- Every text input has a `placeholder`; every select has a `placeholder` (or fixed trigger text when empty). Labels alone do not satisfy this rule.
- Fields stay mounted; disable instead of unmounting.
- Placeholders carry no load or validation state.
- Structural exceptions (component has no placeholder surface; the adjacent label/value is the fixed text):
  - Weather sliders (`src/renderer/src/components/practice/weather/weather.tsx`, `RowSlider`: Temperature, Wind speed, Track conditions) — the value shown next to the label is the fixed text.
  - Weather `Ideal conditions` checkbox (`src/renderer/src/components/practice/weather/weather.tsx`) — the label is the fixed text.

## 4. Stable layout

- Conditional elements (errors, action messages) must not shift layout when they appear: reserve space or place them out of flow.
- **Exception — user-action errors**: errors that only appear after user interaction (save, create, delete confirm) do NOT reserve height. They render inline with `empty:hidden` so the slot collapses when empty and expands only when the error appears. Applies to: Profile save error, SetupsCard name validation error, PathField commit/validation error/hint.
- Nothing mounts/unmounts on data load.
- Base rule: `AGENTS.md` (Code standards: stable layout during loading).

## 5. State

- Distinguish "not loaded" from "loaded and empty" with explicit state, never an ambiguous `null`/`[]`.
- Reconciliation with the real source is silent (no visible `loading` when a seed exists).
- Every module cache/snapshot is invalidated on reset and in any flow that changes its source.
- Base rules: `AGENTS.md` (Required change flow: persistent state, watcher, `launcher:reset`; Code standards: module-level snapshot stores).

## 6. Tests

- First-frame mount test: cache miss, confirmed empty, data present.
- Fixed text renders identically across all states.
- Confirmed errors have conditional tests.
- Base rule: `AGENTS.md` (Quality and security: colocated `*.test.ts`, `bun run typecheck` / `lint` / `test`).

## 7. Modals

- Modals close only via their buttons (close/cancel/confirm); Esc never closes a modal.
- Base rule: `AGENTS.md` (UI component rules: Modals).

## Icons

`@tabler/icons-react` is the only icon library. All icons use the shared `Icon` wrapper (`src/renderer/src/components/ui/icon.tsx`): `stroke={1.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `currentColor`, `aria-hidden="true"` when decorative. Default size 16; 14 for dense buttons; 18 for sidebar. No hardcoded icon colors.

## 8. Definition of Done (check before finishing)

- [ ] `typecheck`, `lint`, `test` pass (`bunx madge --circular src/main/index.ts` stays optional per `AGENTS.md`)
- [ ] No UI text varies by data/selection except section 2 exceptions
- [ ] Every new input has a placeholder (or is listed in the section 3 exceptions)
- [ ] First frame verified in the three states (miss, empty, present)
- [ ] Layout does not jump on load
- [ ] New snapshots invalidated on reset
- [ ] No delay/timeout/CSS-hiding to mask loading
- [ ] No whole-file reformatting
- [ ] Delivery lists changed files (`file:line`) and command results
