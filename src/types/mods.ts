interface WithPreview {
  preview: string | null
}

interface WithPaints {
  paints: string[]
}

export interface BikeMetadata {
  id: string
  name: string
  brand: string
  class: string
  year: number
  version: string
  author: string
}

export interface Bike extends BikeMetadata, WithPreview, WithPaints {}

export interface TrackMetadata {
  id: string
  name: string
  country: string
  length: number
  version: string
  author: string
}

export interface Track extends TrackMetadata, WithPreview {
  layouts: string[]
}

export interface RiderMetadata {
  id: string
  name: string
  version: string
  author: string
}

export interface Rider extends RiderMetadata, WithPreview, WithPaints {}

export interface HelmetMetadata {
  id: string
  name: string
  version: string
  author: string
}

export interface Helmet extends HelmetMetadata, WithPreview, WithPaints {}

export interface RidingStyleMetadata {
  id: string
  name: string
}

export interface RidingStyle extends RidingStyleMetadata, WithPreview {}

export type ModType = 'bikes' | 'tracks' | 'riders' | 'helmets' | 'ridingStyles'

export type AnyMod = Bike | Track | Rider | Helmet | RidingStyle

export interface ModsLists {
  bikes: Bike[]
  tracks: Track[]
  riders: Rider[]
  helmets: Helmet[]
  ridingStyles: RidingStyle[]
}

export interface ModsSnapshot {
  valid: boolean
  ready: boolean
  mods: Partial<ModsLists>
}

export interface ModDiff {
  type: ModType
  upserted: AnyMod[]
  removed: string[]
}

export type ModChangedMessage = ModDiff | ModsSnapshot

export function isModDiff(message: ModChangedMessage): message is ModDiff {
  return typeof (message as ModDiff).type === 'string'
}

// Runtime allowlist of diff targets. The ModType union only exists at
// compile time, so the guard below needs this list to reject unknown types
// instead of planting them as phantom keys on the snapshot.
const KNOWN_MOD_TYPES: readonly ModType[] = ['bikes', 'tracks', 'riders', 'helmets', 'ridingStyles']

// Invalid diffs already reported in this process. A bad message logs once
// and is then dropped silently, never once per message.
let reportedInvalidDiff = false

function reportInvalidDiff(): void {
  if (reportedInvalidDiff) return
  reportedInvalidDiff = true
  console.error('Ignored an invalid mod diff.')
}

// Pure incremental merge shared by the live cache and hydration settle.
// A diff never changes validity: diffs only arrive for a valid folder.
// A malformed diff (unknown type or non-array lists) is ignored: the
// received snapshot is returned unchanged, so a bad message can neither
// throw nor plant a phantom key on the snapshot.
export function applyDiffToSnapshot(snapshot: ModsSnapshot, diff: ModDiff): ModsSnapshot {
  if (
    !(KNOWN_MOD_TYPES as readonly string[]).includes(diff.type) ||
    !Array.isArray(diff.upserted) ||
    !Array.isArray(diff.removed)
  ) {
    reportInvalidDiff()
    return snapshot
  }
  const list = [...((snapshot.mods[diff.type] as AnyMod[] | undefined) ?? [])]
  const removed = new Set(diff.removed)
  const next = list.filter((mod) => !removed.has(mod.id))
  const indexById = new Map(next.map((mod, index) => [mod.id, index] as const))
  for (const mod of diff.upserted) {
    const index = indexById.get(mod.id)
    if (index === undefined) {
      indexById.set(mod.id, next.length)
      next.push(mod)
    } else {
      next[index] = mod
    }
  }
  return { valid: true, ready: snapshot.ready, mods: { ...snapshot.mods, [diff.type]: next } }
}

// Pure hydration settle: events buffered while the initial fetch was in
// flight apply on top of the fetched snapshot in order, so a newer message
// always wins over a stale fetch result. A full snapshot replaces the state.
export function settleHydration(
  fetched: ModsSnapshot,
  buffered: ModChangedMessage[]
): ModsSnapshot {
  let current = fetched
  for (const message of buffered) {
    current = isModDiff(message) ? applyDiffToSnapshot(current, message) : message
  }
  return current
}

export const MODS_CACHE_VERSION = 3 as const

export interface ModsCachePersisted {
  version: typeof MODS_CACHE_VERSION
  valid: boolean
  ready: boolean
  modsPath: string | null
  mods: Partial<ModsLists>
}
