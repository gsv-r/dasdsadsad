// Player profiles live under the Profile Path. Each profile is a subfolder
// whose name is the profile name; inside it a `profile.ini` holds the
// `[info]` section with `name` and `race_number`.
import * as z from 'zod'

export interface PlayerProfile {
  /** Folder name inside the Profile Path. */
  id: string
  /** Display name from profile.ini, falling back to the folder name. */
  name: string
  /** Race number from profile.ini, or null when absent. */
  raceNumber: string | null
}

// Result of saving a profile through the profiles:save IPC channel.
// Rejections return instead of throwing, so an expected validation failure
// never prints a handler error. `name-taken` means the new name is already
// used by another profile folder, so the rename cannot proceed.
export type ProfileSaveResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid-id'
        | 'invalid-name'
        | 'invalid-race-number'
        | 'profile-not-found'
        | 'name-taken'
        | 'write-failed'
    }

// Control characters (including newlines) can never appear in a folder
// name. Checked by code point instead of a regex so the control-character
// lint rule stays satisfied.
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) return true
  }
  return false
}

// Device names reserved by Windows, matched against the folder base name
// (before any dot) case-insensitively.
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

// A profile name doubles as the profile folder name after a rename, so it
// must survive as a directory on Windows: no separators, control characters
// or reserved symbols, no trailing dot, never a dot segment or a reserved
// device name. Pure: no disk access.
export function isValidProfileFolderName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false
  if (/[/\\]/.test(name)) return false
  if (/[<>:"|?*]/.test(name)) return false
  if (hasControlChar(name)) return false
  if (name.endsWith('.')) return false
  if (WINDOWS_RESERVED_NAMES.has(name.split('.')[0].toUpperCase())) return false
  return true
}

// Race numbers are integers from 0 to 99: at most 2 digits. Applied to an
// already-trimmed value, without trimming or transforming it.
export const raceNumberSchema = z.string().regex(/^\d{1,2}$/)

// Profile names: at least 1 character after trimming. Trimming stays at the
// call sites (renderer trims before validating, main trims before its folder
// rules), so the schema never transforms — it only rejects empty names.
export const profileNameSchema = z.string().min(1)

// Shape of the profiles:save arguments. Semantic checks (folder rule, race
// format, active profile) stay in saveProfileInfo with their typed reasons.
export const profileSaveArgsSchema = z.object({
  id: z.string(),
  name: z.string(),
  raceNumber: z.string()
})
