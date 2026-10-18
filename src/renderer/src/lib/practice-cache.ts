import {
  clearCachedKeyIf,
  readCachedString,
  readJsonSnapshot,
  removeCachedKey,
  writeCachedString,
  writeJsonSnapshot
} from './cache-utils'

export type CachedBikeSnapshot = {
  id: string
  name: string
  preview: string | null
  paints: string[]
}

export type CachedTrackSnapshot = {
  id: string
  name: string
  preview: string | null
  layouts: string[]
}

type CachedGearItem = {
  id: string
  paints: string[]
}

export type CachedGearSnapshot = {
  helmets: CachedGearItem[]
  suits: CachedGearItem[]
  styles: string[]
}

const GEAR_SNAPSHOT_KEY = 'practice.rider.snapshot'

function isGearItem(value: unknown): value is CachedGearItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as { id?: unknown; paints?: unknown }
  return (
    typeof item.id === 'string' &&
    item.id !== '' &&
    (item.paints === undefined ||
      (Array.isArray(item.paints) && item.paints.every((p) => typeof p === 'string')))
  )
}

export function readGearSnapshot(): CachedGearSnapshot | null {
  // Read the existing localStorage state directly on mount.
  const parsed = readJsonSnapshot<Partial<CachedGearSnapshot>>(GEAR_SNAPSHOT_KEY)
  if (!parsed || !Array.isArray(parsed.helmets) || !Array.isArray(parsed.suits)) return null
  if (parsed.styles !== undefined && !Array.isArray(parsed.styles)) return null
  if (!parsed.helmets.every(isGearItem) || !parsed.suits.every(isGearItem)) return null
  if (
    parsed.styles !== undefined &&
    !parsed.styles.every((s) => typeof s === 'string' && s !== '')
  ) {
    return null
  }
  return {
    helmets: parsed.helmets.map((h) => ({ id: h.id, paints: h.paints ?? [] })),
    suits: parsed.suits.map((s) => ({ id: s.id, paints: s.paints ?? [] })),
    styles: parsed.styles ?? []
  }
}

export function writeGearSnapshot(snapshot: CachedGearSnapshot): void {
  writeJsonSnapshot(GEAR_SNAPSHOT_KEY, snapshot)
}

function readSnapshot<T extends { id: string; name: string; preview: string | null }>(
  key: string,
  parseExtras: (parsed: Record<string, unknown>) => Partial<T>
): T | null {
  const parsed = readJsonSnapshot<Record<string, unknown>>(key)
  if (!parsed) return null
  if (typeof parsed?.id !== 'string' || parsed.id === '') return null
  return {
    id: parsed.id,
    name: typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : parsed.id,
    preview: typeof parsed.preview === 'string' ? parsed.preview : null,
    ...parseExtras(parsed)
  } as T
}

export function readBikeSnapshot(): CachedBikeSnapshot | null {
  return readSnapshot<CachedBikeSnapshot>('practice.bike.snapshot', (parsed) => ({
    paints: Array.isArray(parsed.paints) ? parsed.paints.filter((p) => typeof p === 'string') : []
  }))
}

export function readTrackSnapshot(): CachedTrackSnapshot | null {
  return readSnapshot<CachedTrackSnapshot>('practice.track.snapshot', (parsed) => ({
    layouts: Array.isArray(parsed.layouts)
      ? parsed.layouts.filter((l) => typeof l === 'string')
      : []
  }))
}

// Sync cache write when picking a bike/track from the lists.
// Reset paint/layout when the previous pick is missing on the new bike/track,
// keep config that is still valid.
export function cacheBikeSelection(bike: {
  id: string
  name?: string
  preview?: string | null
  paints?: string[]
}): void {
  writeCachedString('practice.bike.bike_id', bike.id)
  writeJsonSnapshot('practice.bike.snapshot', {
    id: bike.id,
    name: bike.name ?? bike.id,
    preview: bike.preview ?? null,
    paints: bike.paints ?? []
  })
  const currentPaint = readCachedString('practice.bike.paint')
  if (currentPaint !== null && currentPaint !== '' && !(bike.paints ?? []).includes(currentPaint)) {
    writeCachedString('practice.bike.paint', '')
  }
}

export function cacheTrackSelection(track: {
  id: string
  name?: string
  preview?: string | null
  layouts?: string[]
}): void {
  writeCachedString('practice.track.track_id', track.id)
  writeJsonSnapshot('practice.track.snapshot', {
    id: track.id,
    name: track.name ?? track.id,
    preview: track.preview ?? null,
    layouts: track.layouts ?? []
  })
  const currentLayout = readCachedString('practice.track.track_layout')
  if (
    currentLayout !== null &&
    currentLayout !== '' &&
    !(track.layouts ?? []).includes(currentLayout)
  ) {
    writeCachedString('practice.track.track_layout', '')
  }
}

// Sync localStorage caches for the 7 setup-controlled practice fields.
// Called synchronously with the `applied` values returned by setups:select,
// so the next render already reads the new values (no stale flash) before
// the async store re-read confirms them.
export function writeSetupFieldCaches(applied: {
  bike_id: string
  bike_paint: string
  rider: string
  helmet: string
  helmet_paint: string
  suit_paint: string
  riding_style: string
}): void {
  writeCachedString('practice.bike.bike_id', applied.bike_id)
  writeCachedString('practice.bike.paint', applied.bike_paint)
  writeCachedString('practice.bike.rider', applied.rider)
  writeCachedString('practice.bike.helmet', applied.helmet)
  writeCachedString('practice.bike.helmet_paint', applied.helmet_paint)
  writeCachedString('practice.bike.suit_paint', applied.suit_paint)
  writeCachedString('practice.bike.riding_style', applied.riding_style)
}

const SETUP_ID_CACHE_KEY = 'practice.setup_id'

// Single helper for every setup_id cache write. electron-store stays the
// source of truth; the cache only avoids a stale first paint.
export function readCachedSetupId(): string | null {
  const raw = readCachedString(SETUP_ID_CACHE_KEY)
  if (raw === null || raw === '' || raw === 'null') return null
  return raw
}

export function setCachedSetupId(id: string | null): void {
  if (id === null) {
    removeCachedKey(SETUP_ID_CACHE_KEY)
  } else {
    writeCachedString(SETUP_ID_CACHE_KEY, id)
  }
}

// Clears the setup_id cache only when it points at the given id (e.g. the
// setup just deleted was the cached active one). Never clears another id.
export function clearCachedSetupIdIf(id: string): void {
  clearCachedKeyIf(SETUP_ID_CACHE_KEY, id)
}

// Drops every Practice paint/snapshot cache (e.g. after launcher:reset
// clears the store), so the next mount loads from the reset store instead
// of seeding from stale pre-reset values. Weather keys mirror STORE_KEYS
// in components/practice/weather/weather-settings.ts.
export function clearCachedPractice(): void {
  removeCachedKey('practice.bike.bike_id')
  removeCachedKey('practice.bike.paint')
  removeCachedKey('practice.bike.rider')
  removeCachedKey('practice.bike.helmet')
  removeCachedKey('practice.bike.helmet_paint')
  removeCachedKey('practice.bike.suit_paint')
  removeCachedKey('practice.bike.riding_style')
  removeCachedKey('practice.bike.snapshot')
  removeCachedKey('practice.track.track_id')
  removeCachedKey('practice.track.track_layout')
  removeCachedKey('practice.track.snapshot')
  removeCachedKey(GEAR_SNAPSHOT_KEY)
  removeCachedKey('practice.settings.weather_conditions')
  removeCachedKey('practice.settings.track_conditions')
  removeCachedKey('practice.settings.wind_direction')
  removeCachedKey('practice.settings.wind_speed')
  removeCachedKey('practice.settings.temperature')
  removeCachedKey(SETUP_ID_CACHE_KEY)
}
