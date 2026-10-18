# AGENTS.md — Knee Down

Electron + electron-vite + TypeScript + React 19 + Tailwind 4 launcher for GP Bikes. Runtime and scripts use Bun (`bun run ...`).

## Structure

- `src/main/` — main process (Node): window, IPC, mods watcher. One concern per file in `functions/`.
- `src/preload/index.ts` — only main ↔ renderer bridge (`contextBridge`, `contextIsolation: true`); typed by `index.d.ts`, pinned by `index.test.ts`.
- `src/renderer/src/` — UI (`App.tsx` hash router, `screens/`, `components/`, `hooks/`, `lib/`). Alias `@renderer/*`.
- `src/types/` — shared contracts and Zod schemas.
- Config: `electron.vite.config.ts`, `tsconfig.{node,web}.json`, `eslint.config.js`, `.prettierrc`, `electron-builder.yml`.

## Required change flow

1. Reuse existing `functions/`, `hooks/`, `lib/`, `components/shared/` before creating new files.
2. IPC: handler in `src/main/index.ts` (`ipcMain.handle('domain:action')`) → preload exposure → `window.*` in renderer. Mods use `mods:getAll` + `mods:changed` (`useMods`). Never import main code in renderer; no `nodeIntegration`.
3. Persistent state only via electron-store (`paths`, `pathsAuto`, `practice`, `setup`, `profile`, versioned `modsCache`). Effective path = manual `paths.*` ?? auto `pathsAuto.*`; auto-detection only on user click. Watcher resyncs only on real folder change.
4. Launch/validation: `validateApp()` in main is authoritative; renderer pre-checks for UX, main revalidates in `handleLaunchRequest`; never launch when invalid. Go Ride resets `modsCache` only when the resolved mods path is null. `launcher:reset` restores defaults without deleting files.
5. UI work: inputs render immediately, no visual flicker, modals close only via their buttons.
6. Profiles (`profile.ini`, `global.ini`, `[view]`) and Windows paths/setups/schemas/`local-file://`: see `docs/architecture.md` and `docs/validation.md`.

## Quality and security

Before finishing, run what applies and fix it:

```bash
bun run typecheck
bun run lint
bun run test
bunx madge --circular src/main/index.ts src/preload/index.ts
```

- `bun run build` already runs `typecheck`; do not finish with broken typecheck/lint/tests.
- Validate IPC changes on both ends (handler + preload + caller). Launch/validation errors surface the first issue.
- `shell.openExternal` only via `setWindowOpenHandler`; never open URLs inside the window. `local-file` serves only decoded local files.
- Prefer small verified removals over broad refactoring. Existing tests may only be extended, never replaced.

## Do not

- Add abstractions, wrappers, factories, or layers "for the future".
- Add dependencies without concrete need.
- Duplicate constants/types already in `constants/`, `types/`, or `lib/utils.ts` (`cn`, `isBaseSelection`, `BASE_SELECTION_VALUES`).
- Put main business logic in the renderer or access `store`/FS directly outside main.
- Change paths, `practice.ini`, updater, mods cache/watcher, `profile.ini`, or protocol behavior without running typecheck and related tests.
- Use `npm`/`npx` for project commands; always use Bun.

## Shelved work

The 3D preview pipeline is shelved on `feature/3d-preview-assembly` (tag `archive/3d-preview-shelved`). See `docs/shelved-features.md`. Do not reintroduce on `main` without a leadership decision.

## Release

Publishing is CI-only (`.github/workflows/release.yml`, tag `v*`). Version source of truth is `package.json`. Local checks `bun run typecheck && bun run lint && bun run test` must pass. Never commit tokens. See `docs/release-format.md` and `docs/release-process.md`.
