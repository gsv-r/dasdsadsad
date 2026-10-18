import type { StoreReadKey, StoreSetResult } from '../../../types/store'

export type StoreSetRejection = Extract<StoreSetResult, { ok: false }>['reason']

export type PathKey = 'steam' | 'game' | 'mods' | 'profile'

export interface DetectedPaths {
  steamPath: string | null
  gamePath: string | null
  modsPath: string | null
  profilePath: string | null
}

export type Overrides = Record<PathKey, string | null>

export const EMPTY_OVERRIDES: Overrides = { steam: null, game: null, mods: null, profile: null }
export const EMPTY_DETECTED: DetectedPaths = {
  steamPath: null,
  gamePath: null,
  modsPath: null,
  profilePath: null
}

export const STORE_KEYS: Record<PathKey, StoreReadKey> = {
  steam: 'paths.steam',
  game: 'paths.game',
  mods: 'paths.mods',
  profile: 'paths.profile'
}

export const AUTO_STORE_KEYS: Record<PathKey, StoreReadKey> = {
  steam: 'pathsAuto.steam',
  game: 'pathsAuto.game',
  mods: 'pathsAuto.mods',
  profile: 'pathsAuto.profile'
}

export const PATH_KEYS: PathKey[] = ['steam', 'game', 'mods', 'profile']

export type FieldErrors = Record<PathKey, string | null>

const EMPTY_ERRORS: FieldErrors = { steam: null, game: null, mods: null, profile: null }

export type InvalidFlags = Record<PathKey, boolean>

// Flags the field behind the FIRST launch-validation issue only. Later
// issues stay silent here (they surface at Launch), so the hint never claims
// the other fields are correct. Only path-level codes flag a field: deeper
// launch requirements (executable, writability, installed mods) never mark
// the saved path itself invalid, except the mods folder which is always
// path-level (missing, not found, or invalid structure).
export function invalidFlagsForFirstIssue(issues: { code: string }[] | undefined): InvalidFlags {
  const code = issues?.[0]?.code
  return {
    steam: code === 'STEAM_PATH_MISSING' || code === 'STEAM_EXE_MISSING',
    game: code === 'GAME_PATH_MISSING' || code === 'GAME_FOLDER_MISSING',
    mods:
      code === 'MODS_FOLDER_INVALID' ||
      code === 'MODS_PATH_MISSING' ||
      code === 'MODS_FOLDER_MISSING',
    profile: false
  }
}

// Fixed user-facing messages. The IPC rejection reason is diagnostics only
// (logged to the console) and is never shown in the UI.
export const INVALID_MODS_MESSAGE =
  'Invalid Mods folder. It must contain bikes, misc, rider, tracks and tires/tyres.'
export const INVALID_PROFILE_MESSAGE =
  'Invalid Profile folder. It must contain at least one profile with a profile.ini.'
export const SAVE_FAILED_MESSAGE = 'Could not save the path. Check the value and try again.'
export const INVALID_PATH_MESSAGE = 'Enter a valid path.'

// Normalizes a committed draft: surrounding whitespace never persists, and
// an empty draft clears the manual value (null) to fall back to auto.
export function normalizeCommitDraft(draft: string): string | null {
  const trimmed = draft.trim()
  return trimmed === '' ? null : trimmed
}

// Pure field-error transitions, so the error state machine is unit-testable
// without a renderer harness.
export function clearedErrorForKey(errors: FieldErrors, key: PathKey): FieldErrors {
  if (errors[key] === null) return errors
  return { ...errors, [key]: null }
}

export function commitErrorForKey(errors: FieldErrors, key: PathKey): FieldErrors {
  if (key === 'mods') return { ...errors, [key]: INVALID_MODS_MESSAGE }
  if (key === 'profile') return { ...errors, [key]: INVALID_PROFILE_MESSAGE }
  return { ...errors, [key]: SAVE_FAILED_MESSAGE }
}

// Maps a store:set rejection to the field error state. `invalid-value` is a
// user-fixable value: fixed inline message in the same slot. `unknown-key`
// is a programmer error (fixed call sites): no inline error, the caller logs
// it instead. Pure so the mapping stays unit-testable without a harness.
export function commitRejectionForKey(
  errors: FieldErrors,
  key: PathKey,
  reason: StoreSetRejection
): FieldErrors {
  if (reason === 'invalid-value') return { ...errors, [key]: INVALID_PATH_MESSAGE }
  if (reason === 'unknown-key') return errors
  return commitErrorForKey(errors, key)
}

// Auto Detect error transition: a valid detection clears the mods commit
// error, a missing detection keeps it. The invalid flag is never cleared
// here; it only changes through refreshValidity, which the caller runs
// exclusively on a valid detection, so both disappear solely when the
// resolved state is really valid.
export function redetectModsError(
  errors: FieldErrors,
  detectedModsPath: string | null
): FieldErrors {
  if (detectedModsPath === null) return errors
  return clearedErrorForKey(errors, 'mods')
}

// Same transition for the Profile Path. Kept separate so the mods logic
// above stays untouched.
export function redetectProfileError(
  errors: FieldErrors,
  detectedProfilePath: string | null
): FieldErrors {
  if (detectedProfilePath === null) return errors
  return clearedErrorForKey(errors, 'profile')
}

// Explicit-discard transition (Auto Detect): every draft is replaced by the
// detected value, so no commit error may survive the action.
export function clearedAllErrors(errors: FieldErrors): FieldErrors {
  if (
    errors.steam === null &&
    errors.game === null &&
    errors.mods === null &&
    errors.profile === null
  )
    return errors
  return { ...EMPTY_ERRORS }
}

// A confirmation collapses into the commit already in flight when it targets
// the same key with the same payload. Anything else always starts a new
// commit; entries are removed on settle, so retrying after a failure works.
export function isDuplicateCommit(
  pending: { key: PathKey; payload: string | null } | null,
  key: PathKey,
  payload: string | null
): boolean {
  return pending !== null && pending.key === key && pending.payload === payload
}

export type PathBlurOutcome = 'discard' | 'commit'

// Blur resolution for a path field: an Escape-cancelled draft and a focus
// move into Reset/Redetect discard the draft; every other blur commits it.
export function pathBlurOutcome(cancelPending: boolean, actionFocused: boolean): PathBlurOutcome {
  return cancelPending || actionFocused ? 'discard' : 'commit'
}

// Draft resync decision: a prop value replaces the draft only when the user
// is not typing and no rejection is displayed. While a commit error is
// active the draft is the rejected text; only an explicit action (valid
// commit, Reset, Auto Detect) clears the error first, letting the new value
// flow in.
export function shouldResyncDraft(focused: boolean, hasCommitError: boolean): boolean {
  return !focused && !hasCommitError
}

export type CommitSettleOutcome = 'accepted' | 'rejected' | 'stale'

// Settles an async commit for the visible draft: a settlement for text the
// user already edited past is stale and must be ignored, so a late rejection
// can never stick its error onto the new text. A fresh rejection keeps the
// draft; acceptance flows back in through the value prop.
export function commitSettleOutcome(
  ok: boolean,
  committed: string,
  currentDraft: string
): CommitSettleOutcome {
  if (committed !== currentDraft) return 'stale'
  return ok ? 'accepted' : 'rejected'
}

export function normalizeStored(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function valueForKey(key: PathKey, overrides: Overrides, detected: DetectedPaths): string {
  const manual = overrides[key]
  if (manual !== null) return manual
  if (key === 'steam') return detected.steamPath ?? ''
  if (key === 'game') return detected.gamePath ?? ''
  if (key === 'profile') return detected.profilePath ?? ''
  return detected.modsPath ?? ''
}

export function missingLabels(values: Record<PathKey, string>): string[] {
  const labels: Record<PathKey, string> = {
    steam: 'Steam Path',
    game: 'Game Path',
    mods: 'Mods Path',
    profile: 'Profile Path'
  }
  return PATH_KEYS.filter((key) => !values[key]).map((key) => labels[key])
}

export function overridesEqual(a: Overrides, b: Overrides): boolean {
  return PATH_KEYS.every((key) => a[key] === b[key])
}

export function detectedEqual(a: DetectedPaths, b: DetectedPaths): boolean {
  return PATH_KEYS.every(
    (key) => a[`${key}Path` as keyof DetectedPaths] === b[`${key}Path` as keyof DetectedPaths]
  )
}

export function toDetected(raw: DetectedPaths | null | undefined): DetectedPaths {
  return {
    steamPath: raw?.steamPath ?? null,
    gamePath: raw?.gamePath ?? null,
    modsPath: raw?.modsPath ?? null,
    profilePath: raw?.profilePath ?? null
  }
}

export async function persistAuto(detected: DetectedPaths): Promise<void> {
  await Promise.all(
    PATH_KEYS.map((key) =>
      window.store.set(AUTO_STORE_KEYS[key], detected[`${key}Path` as keyof DetectedPaths])
    )
  )
}

export async function clearManual(): Promise<void> {
  await Promise.all(PATH_KEYS.map((key) => window.store.set(STORE_KEYS[key], null)))
}
