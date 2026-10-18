// Sync paint cache for the Settings paths form (see lib/cache-utils.ts).
// electron-store stays the source of truth; this mirror only seeds the first
// paint so inputs open directly on the saved values instead of flashing
// empty and filling in after the async store read (same rationale as the
// practice field caches and the useSetups module snapshot).
// Cache keys reuse the store key names, like the practice caches do.

import { readCachedString, removeCachedKey, writeCachedString } from './cache-utils'
import { AUTO_STORE_KEYS, PATH_KEYS, STORE_KEYS } from './path-utils'
import type { DetectedPaths, Overrides, PathKey } from './path-utils'

function normalizeCachedPath(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function readCachedOverrides(): Overrides {
  return {
    steam: normalizeCachedPath(readCachedString(STORE_KEYS.steam)),
    game: normalizeCachedPath(readCachedString(STORE_KEYS.game)),
    mods: normalizeCachedPath(readCachedString(STORE_KEYS.mods)),
    profile: normalizeCachedPath(readCachedString(STORE_KEYS.profile))
  }
}

export function readCachedDetected(): DetectedPaths {
  return {
    steamPath: normalizeCachedPath(readCachedString(AUTO_STORE_KEYS.steam)),
    gamePath: normalizeCachedPath(readCachedString(AUTO_STORE_KEYS.game)),
    modsPath: normalizeCachedPath(readCachedString(AUTO_STORE_KEYS.mods)),
    profilePath: normalizeCachedPath(readCachedString(AUTO_STORE_KEYS.profile))
  }
}

function detectedFieldForKey(key: PathKey): keyof DetectedPaths {
  if (key === 'steam') return 'steamPath'
  if (key === 'game') return 'gamePath'
  if (key === 'profile') return 'profilePath'
  return 'modsPath'
}

export function writeCachedOverride(key: PathKey, value: string | null): void {
  if (value === null) {
    removeCachedKey(STORE_KEYS[key])
  } else {
    writeCachedString(STORE_KEYS[key], value)
  }
}

export function writeCachedDetected(detected: DetectedPaths): void {
  for (const key of PATH_KEYS) {
    const value = detected[detectedFieldForKey(key)]
    if (value === null) {
      removeCachedKey(AUTO_STORE_KEYS[key])
    } else {
      writeCachedString(AUTO_STORE_KEYS[key], value)
    }
  }
}

export function writeCachedPaths(manual: Overrides, auto: DetectedPaths): void {
  for (const key of PATH_KEYS) {
    writeCachedOverride(key, manual[key])
  }
  writeCachedDetected(auto)
}

// Drops the paint cache (e.g. after launcher:reset clears the store), so the
// next mount loads from the reset store instead of showing stale paths.
export function clearCachedPaths(): void {
  for (const key of PATH_KEYS) {
    removeCachedKey(STORE_KEYS[key])
    removeCachedKey(AUTO_STORE_KEYS[key])
  }
}
