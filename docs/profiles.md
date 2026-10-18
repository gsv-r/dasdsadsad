# Profiles

Reference for the `Profile handling` section of `AGENTS.md`. `AGENTS.md` is normative; this file is the detail.

## Profile Path

Resolves like other paths: manual `paths.profile` ?? auto `pathsAuto.profile`. Validity = folder exists + contains at least one direct subfolder with `profile.ini` (`isValidProfilePath`).

## Active profile

The renamed one (folder name ≠ "Unnamed Profile") when it exists, otherwise "Unnamed Profile" (resolved in main via `resolveActiveProfile`).

## `profiles:list`

Reads every valid profile (subfolder with `profile.ini`) from a given directory or the resolved Profile Path. Returns `PlayerProfile[]` with `id` (folder name), `name` (from `[info] name` or folder), `raceNumber` (from `[info] race_number` or null).

## `profiles:save`

Writes `name` and `race_number` to the `[info]` section of the active profile's `profile.ini`, preserving every other line (comments, other sections, key order). If the new name differs from the folder, renames the folder first (id and ini `name` stay in sync). Then updates `global.ini` (`[profile] lastprofile` and `nickname`) to point at the same name, preserving all other settings. On save, applies the fixed `[view]` section to **all** profiles in the path.

The operation is transactional: if `global.ini` write fails, the `profile.ini` write and folder rename are rolled back.

## Pure helpers

- `updateProfileIniContent` — rewrites `[info]` `name`/`race_number`, preserving everything else. Handles missing section, missing keys, inverted order (swaps so `name` comes before `race_number`).
- `updateProfileViewContent` — ensures exactly **one** `[view]` section with fixed values (`curview=0`, `fov=90`, `tilt=0.13`, etc.). Removes any existing `[view]` section(s) and inserts a single new one at the position of the last one (or appends if none). Idempotent: running multiple times never creates duplicates.
- `updateGlobalIniContent` — rewrites `[profile] lastprofile`/`nickname`, preserving everything else.
- `syncGlobalProfile` — writes the updated `global.ini` to `Documents/PiBoSo/GP Bikes/global.ini`, creating parent folder as needed.
- `resetActiveProfileInfo` — clears `[info] name` and `race_number` of the active profile (folder stays, file rewritten with empty values).
- `updateActiveProfileView` — called before every launch to ensure the active profile's `[view]` section is current.

## Update behavior summary

- On every `profiles:save`, the fixed `[view]` section is applied to **all** profiles in the Profile Path via `updateProfileViewContent`. This guarantees exactly one `[view]` section per `profile.ini` with the canonical values.
- The `[info]` section (`name`, `race_number`) is updated only for the active profile (the one being saved), preserving all other sections and lines exactly as-is (comments, key order, other sections).
- `global.ini` (`[profile] lastprofile` + `nickname`) is updated to match the saved profile name, preserving all other settings.
