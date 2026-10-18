// Sync paint cache for the Profile screen inputs (see lib/cache-utils.ts).
// electron-store and profile.ini stay the source of truth; this mirror only
// seeds the first paint so the active profile, its name/race number and the
// nationality open directly on the saved values instead of flashing empty
// until the async IPC read resolves (same rationale as the paths paint
// cache and the practice field caches). The nationality key reuses the
// store key name, like the practice caches do; the active snapshot is
// renderer-only (no store counterpart).

import {
  readCachedString,
  readJsonSnapshot,
  removeCachedKey,
  writeCachedString,
  writeJsonSnapshot
} from './cache-utils'
import { normalizeNationality } from './countries'
import type { PlayerProfile } from '../../../types/profiles'

const ACTIVE_SNAPSHOT_KEY = 'profile.active.snapshot'
const NATIONALITY_CACHE_KEY = 'profile.nationality'

export function readCachedActiveProfile(): PlayerProfile | null {
  const parsed = readJsonSnapshot<Record<string, unknown>>(ACTIVE_SNAPSHOT_KEY)
  if (!parsed) return null
  if (typeof parsed.id !== 'string' || parsed.id === '') return null
  return {
    id: parsed.id,
    // Tolerate a missing name like the main fallback to the folder name.
    name: typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : parsed.id,
    raceNumber: typeof parsed.raceNumber === 'string' ? parsed.raceNumber : null
  }
}

export function writeCachedActiveProfile(profile: PlayerProfile | null): void {
  if (profile === null) {
    removeCachedKey(ACTIVE_SNAPSHOT_KEY)
  } else {
    writeJsonSnapshot(ACTIVE_SNAPSHOT_KEY, {
      id: profile.id,
      name: profile.name,
      raceNumber: profile.raceNumber
    })
  }
}

export function readCachedNationality(): string | null {
  return normalizeNationality(readCachedString(NATIONALITY_CACHE_KEY))
}

export function writeCachedNationality(value: string | null): void {
  const valid = normalizeNationality(value)
  if (valid === null) {
    removeCachedKey(NATIONALITY_CACHE_KEY)
  } else {
    writeCachedString(NATIONALITY_CACHE_KEY, valid)
  }
}

// Drops the paint cache (e.g. after launcher:reset clears the store), so the
// next mount loads from the reset store instead of showing stale profile data.
export function clearCachedProfile(): void {
  removeCachedKey(ACTIVE_SNAPSHOT_KEY)
  removeCachedKey(NATIONALITY_CACHE_KEY)
}

// Module snapshot of the last confirmed Profile-screen loader result (null
// means confirmed empty). The paint cache above is cleared on null, so it
// cannot distinguish a cache miss from confirmed empty: without this the
// screen would blank and then pop the not-found message on every re-entry
// when no profile exists. Memory survives navigation (like useMods/useSetups);
// a cold boot still shows a blank slot once, never a guessed final.
let profileScreenSnapshot: PlayerProfile | null | undefined = undefined

export function readProfileScreenSnapshot(): PlayerProfile | null | undefined {
  return profileScreenSnapshot
}

export function writeProfileScreenSnapshot(profile: PlayerProfile | null): void {
  profileScreenSnapshot = profile
}

// Drops the snapshot (e.g. after launcher:reset clears the store), so the
// next mount fetches from the store instead of showing stale profile data.
export function invalidateProfileScreenSnapshot(): void {
  profileScreenSnapshot = undefined
}

// Drops both the screen snapshot and the paint cache (active profile + nationality)
// so the next mount loads from the current store/profile path instead of
// showing stale data from a previous Profile Path. Follows the pattern of
// invalidateModsHydration but clears both snapshot and cache since the profile
// path itself changed.
export function invalidateProfileCache(): void {
  profileScreenSnapshot = undefined
  removeCachedKey(ACTIVE_SNAPSHOT_KEY)
  removeCachedKey(NATIONALITY_CACHE_KEY)
}
