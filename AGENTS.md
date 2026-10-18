# AGENTS.md — Knee Down

Philosophy: **simplicity, clarity, and ease of maintenance.**

The best code is the simplest possible without compromising clarity, correctness, security, and maintenance. Prefer direct and obvious solutions. Do not create layers, patterns, interfaces, classes, or functions without a concrete reason. Change only what is necessary, respecting the existing architecture. No overengineering, no new dependencies for hypothetical problems.

## Language

English is the project standard. All code, variable names, comments, documentation, tests, and user-facing text must use natural, clear, and idiomatic English. Do not use other languages in new code; when touching existing text in another language, convert it to English.

## Project map

Electron + electron-vite + TypeScript + React 19 + Tailwind 4. Runtime and scripts with `bun` (`bun.lock`, `bun run ...`).

- `src/main/` — main process (Node): window + IPC + mods watcher boot. One concern per file in `functions/`.
- `src/preload/index.ts` — the only main ↔ renderer bridge (`contextBridge`, `window.*`, `contextIsolation: true`); `index.d.ts` types it, `index.test.ts` pins it.
- `src/renderer/src/` — UI (`App.tsx` hash router, `screens/`, `components/`, `hooks/`, `lib/`). Alias `@renderer/*`.
- `src/types/` — shared contracts + Zod schemas (no renderer runtime import except constants).
- Config: `electron.vite.config.ts`, `tsconfig.{node,web}.json`, `eslint.config.js`, `.prettierrc` (effective config), `electron-builder.yml` (Windows x64 NSIS).

Details: `docs/architecture.md`.

## Required change flow

1. Find where the responsibility already lives before creating a new file. Reuse existing `functions/`, `hooks/`, `lib/`, and `components/shared/`.
2. IPC: handler in `src/main/index.ts` (`ipcMain.handle('domain:action')`) → preload exposure → `window.*` in renderer. Mods reads via `mods:getAll` + `mods:changed` (`useMods`); never import main code in renderer, no `nodeIntegration`. See `docs/architecture.md`.
3. Persistent state only via electron-store (`paths`, `pathsAuto`, `practice`, `setup`, `profile`, versioned `modsCache`). Effective path = manual `paths.*` ?? auto `pathsAuto.*`; auto-detection only on user click. Watcher resyncs only on real folder change. Details: `docs/architecture.md`.
4. Launch/validation: `validateApp()` in main is authoritative; renderer pre-checks for UX, main revalidates in `handleLaunchRequest`; never launch when invalid. Go Ride resets `modsCache` only when resolved mods path is null. `launcher:reset` restores defaults without file deletion. Details: `docs/validation.md`.
5. Windows paths: compare only with `sameModsPath`/`normalizeModsPath`; distinguish "not configured" via `getStoredModsPath`; keep `local-file://` drive-letter handling. Details: `docs/architecture.md`.
6. Setups: `setups: PlayerSetup[]` + `practice.setup_id`. Tolerant reads, lossless rewrites. The 7 `practice:*` mutators use `withSetupGuard()` (`setup-locked` when active setup valid). Details: `docs/architecture.md`.
7. Validation schemas in `src/types/*.ts` (Zod) only, enforced in `src/main/index.ts` handlers. `local-file://` only via `resolveLocalFilePath()`. Details: `docs/validation.md`.

## Validation rules

- `validateApp()` (`src/main/functions/validate.ts`, read-only) is authoritative. Go Ride is the exclusive display point (first issue + count + Resolve link); no modal on navigation. Main revalidates before launch.
- Commit-time: manual `paths.mods`/`paths.profile` persist only after `isValidModsPath`/`isValidProfilePath`; `steam`/`game` accept trimmed text and fail at the launch gate.
- `invalidFlagsForFirstIssue` flags only the field behind the first issue; `profile` never blocks launch. `toLaunchErrorPayload` maps codes to Resolve routes.

Details: `docs/validation.md`.

## Profile handling

- Profile Path resolves as manual `paths.profile` ?? auto `pathsAuto.profile`; valid when it contains a subfolder with `profile.ini`.
- Active profile resolved in main via `resolveActiveProfile` (renamed folder preferred, else "Unnamed Profile").
- `profiles:save` preserves all other lines/sections; renames folder to stay in sync with `name`; updates `global.ini`; applies canonical `[view]` to all profiles; transactional rollback on `global.ini` failure.
- `updateActiveProfileView` runs before every launch.

Details: `docs/profiles.md`.

## Code standards

- Strict TypeScript in both projects (`tsconfig.node` and `tsconfig.web`). No implicit `any`; prefer types from `src/types/` and preload interfaces.
- **Inputs must render immediately**: present in DOM from first render, update values in place; never unmount/remount or swap trees on load. **No visual flickering**: stable layout during loading; validations only when state is confirmed. Applies project-wide.
- Small functions, explicit names, predictable returns (`string | null`, `Promise<T>`, full scan `T[] | false`, `scanOne` `AnyMod | null`). Missing folder/file is empty, not an exception, except for launch. Watcher resyncs single-flight; `scanOne` never creates folders or metadata.
- React: function components, hooks (module-level snapshot stores, revalidate on focus). Follow `react-hooks/rules-of-hooks` and `exhaustive-deps`. `only-export-components` with `allowConstantExport`.
- Style: Prettier + ESLint convention (`no-unused-vars` off, `@typescript-eslint/no-unused-vars` warn with `_` ignored). Do not reformat whole files.
- Naming: `kebab-case.tsx` for components/screens, `camelCase.ts` for functions/hooks/lib. IPC `domain:action`. Store `section.key`.
- UI rendering detail: `docs/ui-quality.md`; `AGENTS.md` prevails on conflict.

## UI component rules

Details: docs/ui-quality.md; this file prevails.
Inputs: fixed placeholder independent of state; Zod schema from src/types/_.ts shared with main when both validate; errors after commit in a reserved slot with aria-invalid and aria-live; never validate pending data; search/filter inputs exempt; fields stay mounted.
Selects: fixed semantic placeholder; explicit "None" for optional values (always-valued numeric selects exempt); disabled while pending; setup editor renders "(missing)" for absent mods; selecting never changes surrounding labels.
Modals: shared message-modal for messages and confirmations; form modals may be custom but reuse the overlay + Card shell; modals close only via their buttons (close/cancel/confirm) — Esc never closes a modal; overlay click never closes form or destructive modals; irreversible actions need cancel/confirm; inline validation never uses a modal; alertdialog for confirmations, dialog for forms.
Buttons: fixed label; only in-progress text varies; disabled while running.
Error copy: new or touched strings go in lib/_-errors.ts.
Icons: `@tabler/icons-react` is the only icon library; all icons go through the shared `Icon` wrapper (`components/ui/icon.tsx`) with `strokeWidth={1.5}`, `currentColor`, `aria-hidden="true"` when decorative.

## Quality and security

Before finishing, run what applies and fix it:

```bash
bun run typecheck   # node + web
bun run lint
bun run test        # vitest run, colocated *.test.ts tests
bunx madge --circular src/main/index.ts   # optional, main process only (bare 'src' matches 0 files)
```

- `bun run build` already runs `typecheck`; do not mark work as done with broken typecheck/lint/test.
- Validate IPC changes on both ends (handler + preload + caller). Launch/validation errors surface the first issue.
- `shell.openExternal` only via `setWindowOpenHandler`; never open URLs inside the window. `local-file` serves only decoded local files.
- When you find dead code or unneeded structure, assess impact before removing; prefer a small verified removal over broad refactoring.
- Existing tests may only be extended, never replaced; every delivery compares the test count to the previous run and explains any drop.

## Audit and PR verification (read-only by default)

Applies to any PR review, audit, or task-orchestration check. Keeps implementation work separate from verification.

- **Mode declaration:** state `audit (read-only)` or `implement (may edit)` at start. In audit mode, use `read`, `grep`, `glob`, `shell` read-only; never `edit`, `write`, mutating `shell`, `commit`, `push`, `add`, or `checkout -- .` / `reset --hard`.
- **Strict HEAD check:** record `git rev-parse HEAD`, `git status --porcelain`, base branch. Stop if tree is dirty or HEAD moves mid-audit unless explicitly allowed.
- **Full diffs, no summaries:** inspect `git diff <base>...HEAD` in full. Quote `file:line` for every claim.
- **Reconciled test count:** report `expected / found / passed / failed / skipped`. Count expanded parameterized cases individually; treat `skipped`/`todo` as failure unless allowed. Run `bun run typecheck`, `bun run lint`, `bun run test`.
- **Semantics without modification:** verify by reading current code and existing `*.test.ts` only. File follow-ups as separate tasks.
- **Isolation:** prefer separate worktree/branch for implementation; never mix audit output with uncommitted implementation changes.
- **Command + raw output:** reports must include the command and the raw output.
- **Measure before reverting:** before reverting, measure scope and mixed commits.
- **Procedure:** for the step-by-step checklist see `docs/pr-audit-checklist.md`.

## Do not

- Add a new abstraction, wrapper, factory, or layer "for the future".
- Add a new dependency without a concrete need (check `package.json` first).
- Duplicate a constant/type that already exists in `constants/`, `types/`, or `lib/utils.ts` (`cn`, `isBaseSelection`, `BASE_SELECTION_VALUES`).
- Put main business logic in the renderer or access `store`/FS directly outside main.
- Change paths, practice.ini, updater, mods cache/watcher, profile.ini, or protocol behavior without running typecheck + related tests.
- Use `npm` or `npx` for any project command. **Always use Bun** (`bun install`, `bun run`, `bun test`, `bunx`, etc.). The project uses `bun.lock` and `bun` as the runtime.

## Shelved work

The 3D preview pipeline is shelved on `feature/3d-preview-assembly` (tag `archive/3d-preview-shelved`).
Index: `docs/shelved-features.md` on main, full resume in `docs/3d-preview/RESUME.md` on that branch.
Do not reintroduce it on `main` without a leadership decision.

## Release process

Publishing is CI-only (`.github/workflows/release.yml`, tag `v*` → Windows build → GitHub Release on `gsv-r/knee-down`). Version source of truth is `package.json`. Local checks `bun run typecheck && bun run lint && bun run test` must pass. Never commit tokens.

Details: `docs/release-process.md`.

## Release format and Dev Blog

Mandatory structure: title `vX.X.X` only; description starts with `Hey riders,` + intro + version + one paragraph per change (each starting with an action label: Added/Fixed/Updated/...) + `releases/latest` link + `latest.yml`/`.blockmap` notice. No lists for changes.

Details: `docs/release-format.md`.
