import { store, DEFAULT_PRACTICE_STATE } from '../store'
import * as z from 'zod'
import { setupNameSchema } from '../../types/setups'
import { persistPracticeIni } from './practice'
import { BASE_SELECTION_VALUES } from '../constants'
import type {
  PlayerSetup,
  PracticeGuardResult,
  SetupSaveResult,
  SetupDeleteResult,
  SetupSelectResult
} from '../../types/setups'

// Shape of one stored setup. Extra keys are valid (preserved untouched);
// every known field must be a string so reads never throw and rewrites
// never spread garbage. Business rules (name length, uniqueness) stay at
// the create/update entry points.
const setupEntrySchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  bike_id: z.string(),
  bike_paint: z.string(),
  rider: z.string(),
  helmet: z.string(),
  helmet_paint: z.string(),
  suit_paint: z.string(),
  riding_style: z.string()
})

function isSetupEntry(value: unknown): value is PlayerSetup {
  return setupEntrySchema.safeParse(value).success
}

// Reasons already reported in this process. Invalid entries are ignored on
// read without logging each one; only root-level problems log, once.
const reportedStoreProblems = new Set<string>()

function warnStoreProblem(reason: 'unreadable-store' | 'setups-not-a-list'): void {
  if (reportedStoreProblems.has(reason)) return
  reportedStoreProblems.add(reason)
  if (reason === 'unreadable-store') {
    console.error('Setups store is unreadable; treating it as empty.')
  } else {
    console.error('Setups store is not a list; treating it as empty.')
  }
}

// Raw persisted array, or undefined when missing, unreadable or not a list.
// One read per operation; callers filter with isSetupEntry for reads and
// keep every other element untouched on rewrites, so invalid entries are
// never silently lost.
function readSetupsRaw(): unknown[] | undefined {
  let raw: unknown
  try {
    raw = store.get('setups')
  } catch {
    warnStoreProblem('unreadable-store')
    return undefined
  }
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnStoreProblem('setups-not-a-list')
    return undefined
  }
  return raw
}

// Validate setup name: 1-32 chars, no control chars, not just whitespace.
// Allows Unicode letters (accents, etc.), rejects only control characters (Unicode Cc category).
// Schema-backed; trimming stays here so direct callers keep the old semantics.
export function validateSetupName(name: string): boolean {
  return setupNameSchema.safeParse(name.trim()).success
}

// Check if a name is already taken (case-insensitive), optionally excluding an id.
// Only valid entries participate; invalid ones have no comparable name.
function isNameTaken(name: string, excludeId?: string): boolean {
  const setups = readSetupsRaw() ?? []
  const lower = name.trim().toLowerCase()
  return setups.some((s) => isSetupEntry(s) && s.id !== excludeId && s.name.trim().toLowerCase() === lower)
}

export function listSetups(): PlayerSetup[] {
  return (readSetupsRaw() ?? []).filter(isSetupEntry)
}

export function getSetup(id: string): PlayerSetup | null {
  const setups = listSetups()
  return setups.find((s) => s.id === id) ?? null
}

// Returns the active setup ONLY if its id exists in the setups list.
// If the stored setup_id is orphan (not in list), clears practice.setup_id and returns null.
export function getValidActiveSetup(): PlayerSetup | null {
  const setupId = store.store.practice?.setup_id ?? null
  if (!setupId) return null
  const setup = getSetup(setupId)
  if (!setup) {
    store.set('practice.setup_id', null)
    return null
  }
  return setup
}

// Guard helper: returns the active setup_id if a valid setup is active, otherwise null.
// Use this to gate the 7 practice handlers.
export function getSetupLock(): string | null {
  return getValidActiveSetup()?.id ?? null
}

// Single guard helper for the 7 practice handlers. Returns setup-locked
// when a valid setup is active, otherwise runs fn and returns ok.
export function checkPracticeGuard(): PracticeGuardResult {
  return getSetupLock() ? { ok: false, reason: 'setup-locked' } : { ok: true }
}

export function withSetupGuard<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void
): (...args: TArgs) => PracticeGuardResult {
  return (...args: TArgs): PracticeGuardResult => {
    const guard = checkPracticeGuard()
    if (!guard.ok) return guard
    fn(...args)
    return { ok: true }
  }
}

export function createSetup(data: Omit<PlayerSetup, 'id'>): SetupSaveResult {
  const name = data.name.trim()
  if (!validateSetupName(name)) {
    return { ok: false, reason: 'invalid-name' }
  }
  if (isNameTaken(name)) {
    return { ok: false, reason: 'name-taken' }
  }
  const setup: PlayerSetup = { ...data, name, id: crypto.randomUUID() }
  // Rebuilt from the raw array so invalid entries survive byte for byte, in
  // order. A non-array root becomes a fresh list on first create.
  const setups = [...(readSetupsRaw() ?? []), setup]
  try {
    store.set('setups', setups)
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
  return { ok: true }
}

export function updateSetup(id: string, data: Partial<Omit<PlayerSetup, 'id'>>): SetupSaveResult {
  // The target is located in the raw array, among the valid entries only:
  // an invalid or missing target is not addressable.
  const raw = readSetupsRaw() ?? []
  const index = raw.findIndex((entry) => isSetupEntry(entry) && entry.id === id)
  if (index === -1) {
    return { ok: false, reason: 'setup-not-found' }
  }
  const target = raw[index]
  if (!isSetupEntry(target)) {
    return { ok: false, reason: 'setup-not-found' }
  }
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (!validateSetupName(name)) {
      return { ok: false, reason: 'invalid-name' }
    }
    if (isNameTaken(name, id)) {
      return { ok: false, reason: 'name-taken' }
    }
  }
  const updated = { ...target, ...data }
  const nextSetups = [...raw]
  nextSetups[index] = updated
  try {
    store.set('setups', nextSetups)
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
  // If the updated setup is the active one, reapply it immediately and
  // return the applied values so the renderer can refresh its caches.
  // A reapply failure propagates instead of reporting a false success.
  const activeId = store.store.practice?.setup_id ?? null
  if (activeId === id) {
    const reapplied = applySetup(id)
    if (!reapplied.ok) return reapplied
    return { ok: true, applied: reapplied.applied }
  }
  return { ok: true }
}

export function deleteSetup(id: string): SetupDeleteResult {
  const raw = readSetupsRaw() ?? []
  if (!raw.some((entry) => isSetupEntry(entry) && entry.id === id)) {
    return { ok: false, reason: 'setup-not-found' }
  }
  const nextSetups = raw.filter((entry) => !(isSetupEntry(entry) && entry.id === id))
  try {
    store.set('setups', nextSetups)
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
  // If the deleted setup was active, clear setup_id (values remain in practice)
  const activeId = store.store.practice?.setup_id ?? null
  if (activeId === id) {
    store.set('practice.setup_id', null)
  }
  return { ok: true }
}

function normalizeId(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined || BASE_SELECTION_VALUES.has(value)) return fallback
  return value
}

// Apply a setup to practice state: writes all 7 fields + setup_id, then persists practice.ini once.
// If setupId is null, clears setup_id only (keeps current practice values).
// On success returns the exact values written, so the renderer can refresh
// its caches synchronously (no second store round-trip, no stale flash).
export function applySetup(setupId: string | null): SetupSelectResult {
  if (setupId === null) {
    store.set('practice.setup_id', null)
    return { ok: true }
  }
  const setup = getSetup(setupId)
  if (!setup) {
    return { ok: false, reason: 'setup-not-found' }
  }
  const defaults = DEFAULT_PRACTICE_STATE.bike
  const applied = {
    bike_id: setup.bike_id,
    bike_paint: normalizeId(setup.bike_paint, defaults.paint),
    rider: normalizeId(setup.rider, defaults.rider),
    helmet: normalizeId(setup.helmet, defaults.helmet),
    helmet_paint: normalizeId(setup.helmet_paint, defaults.helmet_paint),
    suit_paint: normalizeId(setup.suit_paint, defaults.suit_paint),
    riding_style: normalizeId(setup.riding_style, defaults.riding_style)
  }
  store.set('practice.bike.bike_id', applied.bike_id)
  store.set('practice.bike.paint', applied.bike_paint)
  store.set('practice.bike.rider', applied.rider)
  store.set('practice.bike.helmet', applied.helmet)
  store.set('practice.bike.helmet_paint', applied.helmet_paint)
  store.set('practice.bike.suit_paint', applied.suit_paint)
  store.set('practice.bike.riding_style', applied.riding_style)
  store.set('practice.setup_id', setupId)
  persistPracticeIni()
  return { ok: true, applied }
}
