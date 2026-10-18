## About

The **Knee Down** was developed to make managing and launching **GP Bikes** easier.

The goal is to provide a more practical and organized interface for launching the game and managing resources related to the mod system.

## Download (Windows x64, first install)

New users install from the public distribution repo (the source repo stays private):

1. Open **https://github.com/gsv-r/knee-down/releases/latest**
2. Download the installer **`KneeDown-<version>-Setup.exe`**
3. Run the installer and follow the screens.

> `latest.yml` and `.blockmap` in the release are auto-update internals — ignore them.

Installed users update automatically (detect → download → install → restart) from the same releases.

## Development

### Prerequisites

- Windows 10/11 x64 (primary build target is Windows x64 NSIS, see `electron-builder.yml`).
- [Bun](https://bun.sh) (runtime and scripts; repo pins dependencies with `bun.lock`, run everything with `bun run ...`).
- For runtime validation and launch: Steam installed, GP Bikes installed via Steam (App ID `848050`, `gpbikes.exe`), and a Mods folder at `Documents/PiBoSo/GP Bikes/mods` with `bikes`, `misc`, `rider`, `tracks` plus `tires`/`tyres`.

### Stack

Electron + electron-vite + TypeScript + React 19 + Tailwind 4. Key runtime libraries: `electron-store` (persistent state), `electron-updater` (auto-update). See `package.json` for the full list.

### Project structure

- `src/main/` — main process (Node). Entry `index.ts` (window + IPC registration). `functions/` holds one concern per file (`paths.ts`, `scan.ts`, `launch.ts`, `practice*.ts`, `validate.ts`, `updater.ts`, `prepare.ts`, `mods.ts`, `modsWatcher.ts`, `profiles.ts`, `setups.ts`, `reset.ts`, `localFile.ts`). `store.ts` (electron-store) and `constants/` (IDs, extensions, process names).
- `src/preload/index.ts` (+ `index.d.ts`) — the only main ↔ renderer bridge via `contextBridge`. Exposes `window.api`, `window.store`, `window.practice`, `window.paths`, `window.validation`, `window.updater`, `window.appInfo`, `window.electron`, `window.mods`, `window.profiles`, `window.setups`, `window.launcher`.
- `src/renderer/src/` — UI. `App.tsx` (hash router: `/`, `/bikes`, `/tracks`, `/profile`, `/settings`). `screens/`, `components/{frame,practice,settings,shared,ui}/`, `hooks/`, `lib/`, `assets/`. Alias `@renderer/*` → `src/renderer/src/*`.
- `src/types/mods.ts` — shared types (Bike, Track, Rider, Helmet, RidingStyle).
- Config: `electron.vite.config.ts`, `tsconfig.{node,web}.json`, `eslint.config.js`, `.prettierrc` (singleQuote, semi, 2 spaces, printWidth 100), `electron-builder.yml` (primary target: Windows x64 NSIS).

### Installation

```bash
bun install
```

CI uses `bun install --frozen-lockfile` for reproducible installs.

### Environment configuration

No `.env` file is required for local development. Path detection never runs implicitly at boot; the app reads persisted `electron-store` values (manual `paths.*` ?? last detection `pathsAuto.*`), and detection only runs on demand via `paths:detect` (Detect Again in Settings).

Release publishing uses CI secrets only (never embedded in the app):

- `UPDATE_REPO_TOKEN` — PAT with `contents:write` on the public distribution repo `gsv-r/knee-down`.
- `GH_TOKEN` — set from `UPDATE_REPO_TOKEN` when running the build/publish steps.

### Run locally

```bash
bun run dev
```

Starts `electron-vite dev` with hot reload (renderer URL loaded by the main window in dev, static `out/` files in production).

```bash
bun run start
```

Runs `electron-vite preview` against the last `bun run build` output.

### Available commands

| Command                  | What it runs                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `bun run dev`            | `electron-vite dev`                                                                                   |
| `bun run start`          | `electron-vite preview`                                                                               |
| `bun run build`          | `bun run typecheck && electron-vite build` (output to `out/`)                                         |
| `bun run build:unpack`   | `bun run build && electron-builder --dir`                                                             |
| `bun run build:win`      | `bun run build && electron-builder --win` (installer to `dist/`, e.g. `KneeDown-<version>-Setup.exe`) |
| `bun run build:mac`      | `bun run build && electron-builder --mac`                                                             |
| `bun run build:linux`    | `bun run build && electron-builder --linux`                                                           |
| `bun run typecheck`      | `typecheck:node` + `typecheck:web` (`tsc --noEmit`)                                                   |
| `bun run typecheck:node` | `tsc --noEmit -p tsconfig.node.json`                                                                  |
| `bun run typecheck:web`  | `tsc --noEmit -p tsconfig.web.json`                                                                   |
| `bun run lint`           | `eslint .`                                                                                            |
| `bun run lint:fix`       | `eslint . --fix`                                                                                      |
| `bun run format`         | `prettier --write .`                                                                                  |
| `bun run test`           | `vitest run` (colocated `*.test.ts`)                                                                  |

Quality gate before finishing work:

```bash
bun run typecheck
bun run lint
bun run test
```

`bun run build` already runs `typecheck`; do not treat work as done with broken typecheck/lint/test.

### Build and release

Local Windows installer (no publishing):

```bash
bun run build:win
```

Output goes to `dist/` (`KneeDown-<version>-Setup.exe`, `.blockmap`, `latest.yml`, `win-unpacked/`), as configured in `electron-builder.yml` (`output: dist`, NSIS x64, `artifactName: KneeDown-${version}-Setup.${ext}`).

Published release (public repo `gsv-r/knee-down`):

1. Bump `version` in `package.json`.
2. Push a tag matching that version: `v<version>` (e.g. version `0.1.3` → tag `v0.1.3`). The workflow fails if tag and `package.json` diverge.
3. `.github/workflows/release.yml` (trigger `push` on `v*`, runner `windows-latest`) runs: `bun install --frozen-lockfile` → verify `UPDATE_REPO_TOKEN` → `bun run test` → `bun run build` (with `GH_TOKEN`) → ensure a single public release for the tag → `bunx electron-builder --win --publish always` → update release notes with the `.exe` download link and refresh the public repo README.

Only `out/`, `resources/`, and `package.json` are packaged (see `files` in `electron-builder.yml`); no source or token is shipped in the app.

### Testing

Test rules live in AGENTS.md ("Quality and security").
