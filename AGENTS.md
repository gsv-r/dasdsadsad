# AGENTS.md — Knee Down

Philosophy: **simplicity, clarity, ease of maintenance.** The best code is the simplest possible without compromising clarity, correctness, security, and maintenance. Prefer direct and obvious solutions. No overengineering, no new dependencies for hypothetical problems.

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

1. Reuse existing `functions/`, `hooks/`, `lib/`, `components/shared/` before creating new files.
2. IPC: handler in `src/main/index.ts` (`ipcMain.handle('domain:action')`) → preload exposure → `window.*` in renderer. Mods reads via `mods:getAll` + `mods:changed` (`useMods`); never import main code in renderer, no `nodeIntegration`. Details: `docs/architecture.md`.
3. Persistent state only via electron-store (`paths`, `pathsAuto`, `practice`, `setup`, `profile`, versioned `modsCache`). Effective path = manual `paths.*` ?? auto `pathsAuto.*`; auto-detection only on user click. Watcher resyncs only on real folder change. Details: `docs/architecture.md`.
4. Launch/validation: `validateApp()` in main is authoritative; renderer pre-checks for UX, main revalidates in `handleLaunchRequest`; never launch when invalid. Go Ride resets `modsCache` only when resolved mods path is null. `launcher:reset` restores defaults without file deletion. Details: `docs/validation.md`.
5. UI work: read `docs/ui-quality.md` first. Inputs render immediately, no visual flicker, modals close only via their buttons.
6. Profiles (`profile.ini`, `global.ini`, `[view]`): `docs/profiles.md`.
7. Windows paths, setups, validation schemas, `local-file://`: `docs/architecture.md` and `docs/validation.md`.

## Quality and security

Before finishing, run what applies and fix it:

```bash
bun run typecheck   # node + web
bun run lint
bun run test        # vitest run, colocated *.test.ts tests
bunx madge --circular src/main/index.ts src/preload/index.ts
```

- `bun run build` already runs `typecheck`; do not mark work as done with broken typecheck/lint/test.
- Validate IPC changes on both ends (handler + preload + caller). Launch/validation errors surface the first issue.
- `shell.openExternal` only via `setWindowOpenHandler`; never open URLs inside the window. `local-file` serves only decoded local files.
- When you find dead code or unneeded structure, assess impact before removing; prefer a small verified removal over broad refactoring.
- Existing tests may only be extended, never replaced; every delivery compares the test count to the previous run and explains any drop.

## Audit and PR verification (read-only by default)

State `audit (read-only)` or `implement (may edit)` at start. In audit mode, use `read`, `grep`, `glob`, `shell` read-only; never `edit`, `write`, `commit`, `push`, `add`. Stop if tree is dirty or HEAD moves mid-audit. Report `expected / found / passed / failed / skipped` test counts. Reports include the command and its raw output. Procedure: `docs/pr-audit-checklist.md`.

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
