# Architecture

Reference for the `Project map` and `Required change flow` sections of `AGENTS.md`. `AGENTS.md` is normative; this file is the detail.

## Stack

Electron + electron-vite + TypeScript + React 19 + Tailwind 4. Runtime and scripts with `bun` (`bun.lock`, `bun run ...`).

## Main process (`src/main/`)

Entry `index.ts` (window + IPC registration + mods watcher boot).

`functions/` has one concern per file:

- `paths.ts`, `scan.ts`, `launch.ts`, `practice.ts`, `practiceIni.ts`, `practiceValidate.ts`, `validate.ts`, `updater.ts`, `prepare.ts`, `mods.ts`, `modsWatcher.ts`, `reset.ts`, `profiles.ts`, `setups.ts`, `localFile.ts`.

`store.ts` (electron-store) and `constants/` (IDs, extensions, process names).

## Preload (`src/preload/index.ts` + `index.d.ts`)

The only main ↔ renderer bridge via `contextBridge`. Exposes `window.api`, `window.store`, `window.practice`, `window.paths`, `window.validation`, `window.updater`, `window.appInfo`, `window.electron`, `window.mods`, `window.launcher`, `window.profiles`, `window.setups`. `window.electron.ipcRenderer.send` allows only `isSendChannel` (`minimize`/`close`).

The window uses `contextIsolation: true`. Do not import main code in the renderer or use `nodeIntegration`.

## Renderer (`src/renderer/src/`)

`App.tsx` (hash router: `/`, `/bikes`, `/tracks`, `/settings`, `/profile`). `screens/`, `components/{frame,practice,settings,profile,setups,shared,ui}/`, `hooks/` (`useMods`, `usePaths`, `useRiderGear`, `useAppValidation`, `useSetups` + `useActiveSetup` module snapshots, `useAppVersion`, `useAppUpdate`), `lib/` (`app-validation`, `practice-cache/save/validate`, `profile-errors`, `setup-active`, `option-sync`, `countries`, `popover`, `utils`, `mods-errors`, `paths-cache`), `assets/`. Alias `@renderer/*` → `src/renderer/src/*`.

## Shared contracts (`src/types/`)

No runtime import in renderer except constants.

- `mods.ts`: Bike, Track, Rider, Helmet, RidingStyle, `ModsSnapshot`, `ModDiff`, `ModChangedMessage`, `MODS_CACHE_VERSION`.
- `profiles.ts`: PlayerProfile, ProfileSaveResult.
- `store.ts`: StoreSetResult (`STORE_READ_KEYS`/`STORE_WRITE_KEYS`/`STORE_WRITE_SCHEMAS`).
- `practice.ts` (`WEATHER_RANGES` single source).
- `weather.ts` (`weatherSettingsSchema`).
- `practiceArgs.ts` (`practice:*` arg schemas).
- `setups.ts` (`setupNameSchema`, `PracticeGuardResult`).
- `ipc.ts` (`SEND_CHANNELS`).

## Config

`electron.vite.config.ts`, `tsconfig.{node,web}.json`, `eslint.config.js`, `.prettierrc` (singleQuote, semi, 2 spaces, printWidth 100), `electron-builder.yml` (primary target: Windows x64 NSIS). Runtime deps include `chokidar`, `electron-store`, `zod` (validation only in main/types). `vitest.config.ts` aliases `@renderer/*` and inlines `electron-store` for `vi.mock('electron')`.

## IPC

Handler in `src/main/index.ts` (`ipcMain.handle('domain:action')`) → typed exposure in preload → consumption in the renderer via `window.*`.

Mods reads go through `mods:getAll` (`getModsSnapshotFresh`) and live updates arrive as `mods:changed` (`window.mods.getAll` / `window.mods.onChanged`); the renderer reads via `useMods`. An explicit user refresh goes through `mods:refresh` (`window.mods.refresh`).

### Mods refresh and what focus cannot see

Window focus runs in main only (`refreshModsWatcher` + `refreshByFocus`); the renderer never issues a second IPC per focus. `refreshByFocus` compares the **ids** on disk against the ids recorded by the last reconcile (`recordDiskIds`) and does nothing when they match, so a focus never rescans an unchanged folder.

Known limitation: if the watcher misses an event and only the **content** of an already known folder changes — `metadata.json` edited in place, a new preview or paint, without the folder name changing — the id set is identical, so **focus does not detect it** and the list keeps the old entry until something else reports the change. This is deliberate: adding a `stat` per folder would turn every focus into a linear-cost synchronous sweep (measured ~22x the current `readdir` cost at 2000 folders) to cover a case the watcher already handles while the app is running.

The **Refresh** button in the bikes/tracks list header (`mods:refresh` → `refreshModsNow`) covers that gap: it rescans ignoring the gate, re-records the disk ids so a later focus stays closed, emits `mods:changed` only when the result differs, persists only on change, and is single-flight so a double click never runs two scans.

## Persistent state

Only via electron-store (`paths`, `pathsAuto`, `practice`, `setup`, `profile`, versioned `modsCache`).

- Effective value = manual `paths.*` ?? last detection `pathsAuto.*`.
- Auto-detection never runs at boot, only when the user clicks Auto Detect (`paths:detect` → `redetect`).
- Each field shows `auto`/`manual` (`isManual` = manual `paths.*` present; typing commits manual, Reset/Auto Detect returns to `auto`).
- A `modsCache` belongs to one folder (version + `sameModsPath`); validity comes only from path validation, never scan results.
- `store:set` on `paths[.mods]` / `pathsAuto[.mods]` resyncs the watcher only on a real folder change.
- A manual mods path persists only after `isValidModsPath` validation.
- A manual profile path persists only after `isValidProfilePath` validation.
- Boot awaits `initModsWatcher` before the window, flushes/stops on `before-quit`, refreshes on focus.
- `launcher:reset` restores `practice`/`setup`/`paths`/`pathsAuto`/`profile` to defaults (no file deletion) and resyncs the watcher.

## Windows paths

Steam via registry, game via `libraryfolders.vdf` + `appmanifest_<appId>.acf`, mods under `Documents/PiBoSo/GP Bikes/mods`, profiles under `Documents/PiBoSo/GP Bikes/profiles`. Compare mods folders only with `sameModsPath`/`normalizeModsPath`; use `getStoredModsPath` to distinguish "not configured" from "configured but invalid". For `local-file://`, keep the drive-letter handling.

## Setups

Persisted as `setups: PlayerSetup[]` + `practice.setup_id`. Reads are tolerant and rewrites lossless (invalid entries preserved). Name 1-32 chars, unique case-insensitive. The 7 `practice:*` mutators go through `withSetupGuard()` and return `setup-locked` when `getValidActiveSetup()` is non-null; `applySetup(null)` clears only `setup_id`. Orphan `setup_id` self-clears.

## Validation schemas

Define shapes only in `src/types/*.ts` with Zod, enforce in `src/main/index.ts` handlers (`store:set` → `invalid-value`/`unknown-key`/`invalid-mods-folder`/`invalid-profile-folder`; `practice:*` → throw on invalid args; `setups:*`/`profiles:save` → typed `{ok:false,reason}` never throwing for expected failures). `local-file://` serves only via `resolveLocalFilePath()` (lexical containment, `403`/`404`, preview filenames only, drive-slash stripped).
