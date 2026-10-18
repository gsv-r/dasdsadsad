# Validation

Reference for the `Validation rules` section of `AGENTS.md`. `AGENTS.md` is normative; this file is the detail.

## Authority

Central validation lives in `validateApp()` (`src/main/functions/validate.ts`, read-only). The renderer pre-checks via `validateAppOrNotify` (`lib/app-validation.ts`) and `ensureValid` (`hooks/useAppValidation.ts`); main revalidates in `handleLaunchRequest`; never launch when invalid.

## Go Ride display

Go Ride is the exclusive display point: any required empty/invalid blocks launch and shows an error modal (first issue + "(n more issue(s) to fix.)" + Resolve link). No modal on navigation or section access. Main launch failures re-map via `toLaunchErrorPayload` (`go-ride.tsx`).

## Required Go Ride gate (in order)

1. Steam executable exists (`STEAM_PATH_MISSING`/`STEAM_EXE_MISSING`).
2. Game folder exists, contains `gpbikes.exe` and is writable (`GAME_PATH_MISSING`/`GAME_FOLDER_MISSING`/`GAME_EXE_MISSING`/`GAME_FOLDER_NOT_WRITABLE`).
3. Mods folder exists with `bikes`, `misc`, `rider`, `tracks` + `tires`/`tyres` (`MODS_PATH_MISSING`/`MODS_FOLDER_INVALID`/`MODS_FOLDER_MISSING`).
4. Profile folder exists with at least one profile subfolder containing `profile.ini` (`PROFILE_PATH_MISSING`/`PROFILE_FOLDER_INVALID`/`PROFILE_FOLDER_MISSING`/`PROFILE_INI_MISSING`).
5. Practice `bike_id`/`track_id` non-empty (`PRACTICE_BIKE_MISSING`/`PRACTICE_TRACK_MISSING`).
6. Practice weather ranges (`PRACTICE_SETTINGS_INVALID`: conditions 0-2, temperature 10-38, wind_direction 0-7, wind_speed 0-11, track_conditions 0-100).
7. Active profile `profile.ini` exists (`PROFILE_INI_MISSING`).
8. Active profile has non-empty `name` (`PROFILE_NAME_MISSING`), `race_number` 0-99 (`PROFILE_RACE_NUMBER_MISSING`), `nationality` selected (`PROFILE_NATIONALITY_MISSING`).
9. Referenced mods exist on disk (`MOD_*_MISSING`, base/`default`/stock fallbacks skip disk check).

The main process revalidates before launch and throws the exact validation message; `toLaunchErrorPayload` parses it and surfaces the matching modal.

## Commit-time

Manual `paths.mods` persists only after `isValidModsPath` (`store:set` returns `{ok:false,reason:'invalid-mods-folder'}`); manual `paths.profile` persists only after `isValidProfilePath` (`store:set` returns `{ok:false,reason:'invalid-profile-folder'}`); profile path pre-validates via `profiles:list` in the renderer before `store:set`; `steam`/`game` accept any trimmed text and surface later via launch validation. Profile `name` non-empty and `raceNumber` 0-99 validated before `profiles:save` (main revalidates).

Go Ride resets the mods cache only when the resolved mods path is null, never on other failures.

## Error priority and Resolve behavior

`invalidFlagsForFirstIssue` (`usePaths.ts`) marks **only the field behind the first launch-validation issue** (codes: `STEAM_PATH_MISSING`/`STEAM_EXE_MISSING` → `steam`; `GAME_PATH_MISSING`/`GAME_FOLDER_MISSING` → `game`; `MODS_FOLDER_INVALID`/`MODS_PATH_MISSING`/`MODS_FOLDER_MISSING` → `mods`; `profile` is never flagged). Later issues stay silent in the path fields; they surface at Launch.

`toLaunchErrorPayload` (`go-ride.tsx`) maps every validation code to a modal with `title`, `message`, and `action: { label: 'Resolve', to: '<route>' }`. Routes: `/settings` for path issues, `/bikes` for bike/track mods, `/tracks` for track/layout mods, `/profile` for profile name/race/nationality, `/` (home/Practice) for rider/helmet/style/paint issues.
