import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { store } from '../store'
import { getResolvedModsPath, sameModsPath } from './paths'
import { subdirForType } from './mods'
import {
  prepareBikes,
  prepareHelmets,
  prepareRiders,
  prepareRidingStyles,
  prepareTracks
} from './prepare'
import {
  isSameMod,
  scanBikes,
  scanHelmets,
  scanRiders,
  scanRidingStyles,
  scanTracks,
  scanOne
} from './scan'
import { MOD_FILE_EXTENSION } from '../constants'
import { MODS_CACHE_VERSION } from '../../types/mods'
import type {
  AnyMod,
  ModChangedMessage,
  ModDiff,
  ModsCachePersisted,
  ModsLists,
  ModsSnapshot,
  ModType
} from '../../types/mods'

const MOD_TYPES: ModType[] = ['bikes', 'tracks', 'riders', 'helmets', 'ridingStyles']
const EVENT_DEBOUNCE_MS = 300
const PERSIST_DEBOUNCE_MS = 1500
const WATCH_DEPTH = 2
// Máximo de tentativas de scan para um mod que ainda não existe no disco.
// Intervalo crescente: 200, 400, 800, 1600, 3200 ms (~6,2 s no total).
const MAX_SCAN_RETRIES = 5
const RETRY_BASE_MS = 200

const cache = new Map<ModType, Map<string, AnyMod>>()
let modsValid = false
let cacheReady = false
let activeModsPath: string | null = null
let watcher: FSWatcher | null = null
let diffListener: ((message: ModChangedMessage) => void) | null = null
let persistTimer: NodeJS.Timeout | null = null
let persistDirty = false
let lastPersisted: string | null = null
// Invalidates in-flight scans when a resync clears the cache: only the
// latest generation may apply results, so a stale reconcile can never
// repopulate cleared entries.
let resyncGeneration = 0
const pendingKeys = new Set<string>()
const eventTimers = new Map<string, NodeJS.Timeout>()
// Retry state for scanOne when the mod folder exists but metadata.json
// is not there yet. Keyed by `${type}:${id}`.
const retryTimers = new Map<string, NodeJS.Timeout>()
const retryCount = new Map<string, number>()
// Último conjunto de ids visto no disco por tipo (inclui pastas sem
// metadata.json). Usado pelo gate de focus para evitar scans repetidos.
const diskIdsByType = new Map<ModType, Set<string>>()

function keyFor(type: ModType, id: string): string {
  return `${type}:${id}`
}

function emptyCache(): void {
  for (const type of MOD_TYPES) cache.set(type, new Map())
}

function cacheIsEmpty(): boolean {
  return [...cache.values()].every((m) => m.size === 0)
}

// Validity comes ONLY from the pre-existing path validation: the resolved
// mods path is non-null exactly when the configured folder exists with the
// expected structure (see getResolvedModsPath/isValidModsPath in paths.ts).
// Scan results (false from prepare*, null from scanOne, empty lists) never
// decide validity.
function resolveCurrentPath(): string | null {
  return getResolvedModsPath()
}

function listsFromCache(): ModsLists {
  return {
    bikes: [...(cache.get('bikes')?.values() ?? [])] as ModsLists['bikes'],
    tracks: [...(cache.get('tracks')?.values() ?? [])] as ModsLists['tracks'],
    riders: [...(cache.get('riders')?.values() ?? [])] as ModsLists['riders'],
    helmets: [...(cache.get('helmets')?.values() ?? [])] as ModsLists['helmets'],
    ridingStyles: [...(cache.get('ridingStyles')?.values() ?? [])] as ModsLists['ridingStyles']
  }
}

function emptyLists(): ModsLists {
  return { bikes: [], tracks: [], riders: [], helmets: [], ridingStyles: [] }
}

function readPersistedCache(current: string | null): { lists: ModsLists; ready: boolean } | null {
  try {
    const raw = store.get('modsCache') as unknown
    if (!raw || typeof raw !== 'object') return null
    const persisted = raw as Partial<ModsCachePersisted> & { version?: unknown }
    if (persisted.version !== MODS_CACHE_VERSION) return null
    // A persisted cache belongs to one mods folder. Formatting differences
    // alone never invalidate it; only a really different folder discards it.
    if (!sameModsPath(persisted.modsPath ?? null, current)) return null
    if (persisted.valid !== true || !current) return null
    if (!persisted.mods || typeof persisted.mods !== 'object') return null
    for (const type of MOD_TYPES) {
      const list = persisted.mods[type]
      if (list !== undefined && !Array.isArray(list)) return null
    }
    return {
      lists: {
        bikes: (persisted.mods.bikes ?? []) as ModsLists['bikes'],
        tracks: (persisted.mods.tracks ?? []) as ModsLists['tracks'],
        riders: (persisted.mods.riders ?? []) as ModsLists['riders'],
        helmets: (persisted.mods.helmets ?? []) as ModsLists['helmets'],
        ridingStyles: (persisted.mods.ridingStyles ?? []) as ModsLists['ridingStyles']
      },
      ready: persisted.ready === true
    }
  } catch {
    return null
  }
}

function loadCacheFromStore(current: string | null): void {
  emptyCache()
  modsValid = false
  cacheReady = false
  activeModsPath = current
  const persisted = readPersistedCache(current)
  if (!persisted) return
  modsValid = true
  cacheReady = persisted.ready
  for (const type of MOD_TYPES) {
    const map = cache.get(type)
    if (!map) continue
    for (const mod of persisted.lists[type] as AnyMod[]) {
      const id = (mod as { id?: unknown }).id
      if (typeof id === 'string' && id !== '') map.set(id, mod)
    }
  }
}

export function getModsSnapshot(): ModsSnapshot {
  // Revalidate before serving: a path that changed or became invalid must
  // never serve the previous folder's mods. A valid path without a finished
  // scan reports ready:false, never an empty list and never invalid.
  const current = resolveCurrentPath()
  if (!current) {
    if (modsValid || !cacheIsEmpty()) clearCacheSync()
    return { valid: false, ready: false, mods: {} }
  }
  if (!sameModsPath(current, activeModsPath)) {
    void resyncSingleFlight()
    return { valid: true, ready: false, mods: {} }
  }
  return { valid: true, ready: cacheReady, mods: listsFromCache() }
}

// Fresh read for mods:getAll: when the served state would be invalid but the
// path already validates, resync first so a transient valid:false recovers
// instead of being served again.
export async function getModsSnapshotFresh(): Promise<ModsSnapshot> {
  const current = resolveCurrentPath()
  if (current && (!modsValid || !sameModsPath(current, activeModsPath))) {
    await resyncSingleFlight()
  }
  return getModsSnapshot()
}

function schedulePersist(): void {
  persistDirty = true
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistCacheSync()
  }, PERSIST_DEBOUNCE_MS)
}

function persistCacheSync(): void {
  persistDirty = false
  try {
    const next =
      modsValid && activeModsPath
        ? {
            version: MODS_CACHE_VERSION,
            valid: true,
            ready: cacheReady,
            modsPath: activeModsPath,
            mods: listsFromCache()
          }
        : {
            version: MODS_CACHE_VERSION,
            valid: false,
            ready: false,
            modsPath: activeModsPath,
            mods: {}
          }
    const serialized = JSON.stringify(next)
    if (serialized === lastPersisted) return
    lastPersisted = serialized
    store.set('modsCache', next)
  } catch (error) {
    console.error('Failed to persist mods cache:', error)
  }
}

export function flushModsCache(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistDirty) persistCacheSync()
}

function emitDiff(diff: ModDiff): void {
  if (diff.upserted.length === 0 && diff.removed.length === 0) return
  diffListener?.(diff)
}

function emitSnapshot(snapshot: ModsSnapshot): void {
  diffListener?.(snapshot)
}

// Clears memory and Store synchronously and replaces the renderer state,
// never leaving a stale folder's mods on screen.
function clearCacheSync(): void {
  emptyCache()
  modsValid = false
  cacheReady = false
  persistCacheSync()
  emitSnapshot({ valid: false, ready: false, mods: {} })
}

function stripPkz(name: string): string {
  return name.endsWith(MOD_FILE_EXTENSION) ? name.slice(0, -MOD_FILE_EXTENSION.length) : name
}

export function resolveEventTarget(
  modsPath: string | null,
  fullPath: string
): { type: ModType; id: string } | null {
  if (!modsPath) return null
  const rel = path.relative(modsPath, fullPath)
  if (rel === '' || rel.startsWith('..')) return null
  // Normalize path separators for cross-platform compatibility
  const normalizedRel = rel.split(path.sep).filter((p) => p !== '')

  if (normalizedRel.length === 0) return null

  // bikes/<id>/... e tracks/<id>/... (qualquer profundidade): resolve para o mod pai.
  if (normalizedRel[0] === 'bikes' || normalizedRel[0] === 'tracks') {
    if (!normalizedRel[1]) return null
    const id = stripPkz(normalizedRel[1])
    if (id === '') return null
    return { type: normalizedRel[0] as ModType, id }
  }
  if (normalizedRel[0] === 'rider' && normalizedRel.length >= 3 && normalizedRel[2]) {
    const id = stripPkz(normalizedRel[2])
    if (id === '') return null
    if (normalizedRel[1] === 'riders') return { type: 'riders', id }
    if (normalizedRel[1] === 'helmets') return { type: 'helmets', id }
    if (normalizedRel[1] === 'animations') return { type: 'ridingStyles', id }
  }
  return null
}

function applyScanResult(type: ModType, id: string, mod: AnyMod | null): void {
  const map = cache.get(type)
  if (!map || !modsValid) return
  const prev = map.get(id) ?? null
  if (mod === null) {
    // O mod já está no cache e o scan retornou null: remoção real.
    if (map.has(id)) {
      map.delete(id)
      schedulePersist()
      emitDiff({ type, upserted: [], removed: [id] })
      return
    }
    // Mod ainda não existe no disco (ex.: pasta criada antes do metadata.json).
    // Reagenda com retry limitado.
    scheduleScanRetry(type, id)
    return
  }
  if (prev && isSameMod(prev, mod)) return
  map.set(id, mod)
  schedulePersist()
  emitDiff({ type, upserted: [mod], removed: [] })
}

function scheduleScanRetry(type: ModType, id: string): void {
  const key = keyFor(type, id)
  const count = (retryCount.get(key) ?? 0) + 1
  if (count > MAX_SCAN_RETRIES) {
    retryCount.delete(key)
    return
  }
  retryCount.set(key, count)
  const prev = retryTimers.get(key)
  if (prev) clearTimeout(prev)
  // Intervalo crescente: 200, 400, 800, 1600, 3200 ms.
  retryTimers.set(
    key,
    setTimeout(
      () => {
        retryTimers.delete(key)
        // A pasta pode ter se tornado invalidada enquanto o retry esperava.
        if (!sameModsPath(resolveCurrentPath(), activeModsPath) || !activeModsPath) {
          retryCount.delete(key)
          void resyncSingleFlight()
          return
        }
        const scanGeneration = resyncGeneration
        scanOne(type, id)
          .then((mod) => {
            // Um resync pode ter limpo o cache enquanto o retry estava em voo.
            if (scanGeneration !== resyncGeneration) return
            applyScanResult(type, id, mod)
          })
          .catch((error) => console.error(`Failed to retry scan ${key}:`, error))
      },
      RETRY_BASE_MS * 2 ** (count - 1)
    )
  )
}

function queueEvent(type: ModType, id: string): void {
  const key = keyFor(type, id)
  pendingKeys.add(key)
  // Um novo evento do mesmo mod cancela o retry pendente: o debounce de
  // queueEvent dispara scanOne novamente, então não precisa de retry paralelo.
  const retryTimer = retryTimers.get(key)
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimers.delete(key)
    retryCount.delete(key)
  }
  const prev = eventTimers.get(key)
  if (prev) clearTimeout(prev)
  eventTimers.set(
    key,
    setTimeout(() => {
      eventTimers.delete(key)
      // The folder may have become invalid while the event waited.
      if (!sameModsPath(resolveCurrentPath(), activeModsPath) || !activeModsPath) {
        pendingKeys.delete(key)
        void resyncSingleFlight()
        return
      }
      const scanGeneration = resyncGeneration
      scanOne(type, id)
        .then((mod) => {
          // A resync may have cleared the cache while this scan was in
          // flight; its result must not repopulate cleared entries.
          if (scanGeneration !== resyncGeneration) return
          applyScanResult(type, id, mod)
        })
        .catch((error) => console.error(`Failed to scan ${key}:`, error))
        .finally(() => {
          pendingKeys.delete(key)
        })
    }, EVENT_DEBOUNCE_MS)
  )
}

function handleWatchEvent(fullPath: string): void {
  // Any filesystem signal revalidates first: an invalid folder clears the
  // whole cache instead of serving one stale entry at a time.
  if (!sameModsPath(resolveCurrentPath(), activeModsPath) || !activeModsPath) {
    void resyncSingleFlight()
    return
  }
  const target = resolveEventTarget(activeModsPath, fullPath)
  if (!target) return
  queueEvent(target.type, target.id)
}

// Original prepare behavior: create the watched subfolders (and seed
// metadata) before chokidar starts, so watcher setup never observes a
// half-created tree. prepare* is idempotent: existing folders and the
// wx-guarded metadata write emit no filesystem events, so this cannot
// loop even if it ever runs while the watcher is active.
async function runAllPrepares(): Promise<void> {
  await Promise.all([
    prepareBikes(),
    prepareTracks(),
    prepareRiders(),
    prepareHelmets(),
    prepareRidingStyles()
  ])
}

async function startWatcher(modsPath: string): Promise<void> {
  if (watcher && sameModsPath(activeModsPath, modsPath)) return
  const watchPaths = MOD_TYPES.map((type) => path.join(modsPath, subdirForType(type)))
  activeModsPath = modsPath
  const next = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    depth: WATCH_DEPTH,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignorePermissionErrors: true
  })
  next.on('all', (_event, fullPath) => handleWatchEvent(fullPath))
  next.on('error', (error) => {
    console.error('Mods watcher error:', error)
  })
  watcher = next
}

async function stopWatcher(): Promise<void> {
  for (const timer of eventTimers.values()) clearTimeout(timer)
  eventTimers.clear()
  pendingKeys.clear()
  const current = watcher
  watcher = null
  if (current) {
    try {
      await current.close()
    } catch (error) {
      console.error('Failed to close mods watcher:', error)
    }
  }
}

function setCachedList(type: ModType, items: AnyMod[]): void {
  const map = cache.get(type)
  if (!map) return
  const freshIds = new Set(items.map((mod) => (mod as { id: string }).id))
  for (const id of [...map.keys()]) {
    // Ids with a watcher event in flight keep the cached value; the event's
    // own scanOne applies the newer state when it lands.
    if (pendingKeys.has(keyFor(type, id))) continue
    if (!freshIds.has(id)) map.delete(id)
  }
  for (const mod of items) {
    const id = (mod as { id: string }).id
    if (pendingKeys.has(keyFor(type, id))) continue
    map.set(id, mod)
  }
}

// Serialized served state. An explicit refresh compares it before and after
// the scan so it can stay silent when nothing changed. It includes valid and
// ready, so a cache that only just became ready still counts as a change.
function servedStateKey(): string {
  return JSON.stringify({ valid: modsValid, ready: cacheReady, mods: listsFromCache() })
}

async function reconcileNow(onlyIfChanged = false): Promise<void> {
  // Validity was already decided by the path validation above. A false scan
  // (prepare* found no listable subfolder) only means an empty list here,
  // exactly like the original full scan; it never marks the path invalid.
  const epoch = resolveCurrentPath()
  if (!epoch || !sameModsPath(epoch, activeModsPath)) {
    if (modsValid || !cacheIsEmpty()) clearCacheSync()
    return
  }
  modsValid = true
  const before = onlyIfChanged ? servedStateKey() : null
  const generation = resyncGeneration
  const [bikes, tracks, riders, helmets, ridingStyles] = await Promise.all([
    scanBikes(),
    scanTracks(),
    scanRiders(),
    scanHelmets(),
    scanRidingStyles()
  ])
  // A refresh/invalidation may have cleared the cache while this reconcile
  // was scanning; its result must not repopulate cleared entries.
  if (generation !== resyncGeneration) return
  if (!sameModsPath(resolveCurrentPath(), epoch)) return
  setCachedList('bikes', bikes === false ? [] : bikes)
  setCachedList('tracks', tracks === false ? [] : tracks)
  setCachedList('riders', riders === false ? [] : riders)
  setCachedList('helmets', helmets === false ? [] : helmets)
  setCachedList('ridingStyles', ridingStyles === false ? [] : ridingStyles)
  cacheReady = true
  // Always re-record the disk ids: the focus gate compares against them, and
  // an explicit refresh must leave the gate closed for what it just scanned.
  recordDiskIds()
  // An explicit refresh that found nothing new stays completely silent: no
  // persist and no mods:changed. The boot/resync path keeps replacing the
  // renderer state unconditionally, so a valid path never leaves the UI on an
  // empty or invalid claim.
  if (before !== null && before === servedStateKey()) return
  schedulePersist()
  emitSnapshot({ valid: true, ready: true, mods: listsFromCache() })
}

function reconcileInBackground(): void {
  reconcileNow().catch((error) => console.error('Failed to reconcile mods cache:', error))
}

// Lê os ids das pastas raiz de cada tipo e guarda para comparação futura.
function recordDiskIds(): void {
  const modsPath = resolveCurrentPath()
  if (!modsPath) return
  for (const type of MOD_TYPES) {
    const ids = new Set<string>()
    try {
      const dir = path.join(modsPath, subdirForType(type))
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) ids.add(entry.name)
      }
    } catch {
      // Pasta ausente ou ilegível: sem ids.
    }
    diskIdsByType.set(type, ids)
  }
}

// Gate de focus: compara apenas a lista de ids no disco com o último
// conjunto visto (inclui pastas sem metadata.json). Se igual, não faz
// nada — sem scan, sem persist, sem emit. Se diferir, roda reconcileNow().
export async function refreshByFocus(): Promise<void> {
  const modsPath = resolveCurrentPath()
  if (!modsPath || !sameModsPath(modsPath, activeModsPath)) return
  const nextIds = new Map<ModType, Set<string>>()
  let changed = false
  for (const type of MOD_TYPES) {
    const ids = new Set<string>()
    try {
      const dir = path.join(modsPath, subdirForType(type))
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) ids.add(entry.name)
      }
    } catch {
      // Pasta ausente ou ilegível: sem ids.
    }
    nextIds.set(type, ids)
    const prev = diskIdsByType.get(type)
    if (!prev || prev.size !== ids.size || [...ids].some((id) => !prev.has(id))) {
      changed = true
    }
  }
  if (!changed) return
  for (const [type, ids] of nextIds) diskIdsByType.set(type, ids)
  void reconcileNow()
}

let refreshPromise: Promise<void> | null = null

// Explicit user refresh (the list refresh button): a full rescan that ignores
// the focus gate, so a change the watcher missed is still picked up. It
// re-records the disk ids, and emits/persists only when the result differs.
// Single-flight, so a double click never runs two scans.
export function refreshModsNow(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = reconcileNow(true).finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function resyncFromDisk(): Promise<void> {
  const next = resolveCurrentPath()
  if (next !== null && sameModsPath(next, activeModsPath) && watcher) return
  resyncGeneration += 1
  await stopWatcher()
  if (!next) {
    activeModsPath = null
    cacheReady = false
    if (modsValid || !cacheIsEmpty()) clearCacheSync()
    return
  }
  emptyCache()
  modsValid = true
  cacheReady = false
  activeModsPath = next
  persistCacheSync()
  emitSnapshot({ valid: true, ready: false, mods: emptyLists() })
  await runAllPrepares()
  await startWatcher(next)
  reconcileInBackground()
}

export async function initModsWatcher(
  onMessage: (message: ModChangedMessage) => void
): Promise<void> {
  diffListener = onMessage
  // The Store is already loaded (module import) when the main process awaits
  // this before creating the window; validation runs here, reconcile stays
  // in the background.
  const current = resolveCurrentPath()
  loadCacheFromStore(current)
  if (!current) {
    if (modsValid || !cacheIsEmpty()) clearCacheSync()
    else {
      activeModsPath = null
      persistCacheSync()
    }
    return
  }
  if (!modsValid && cacheIsEmpty()) persistCacheSync()
  await runAllPrepares()
  await startWatcher(current)
  reconcileInBackground()
}

export async function refreshModsWatcher(): Promise<void> {
  await resyncSingleFlight()
}

// Single-flight resync: mount, focus and store:set can trigger together; one
// resync runs at a time and the rest share its promise. Stale in-flight
// reconciles are still fenced by resyncGeneration.
let resyncPromise: Promise<void> | null = null

function resyncSingleFlight(): Promise<void> {
  if (!resyncPromise) {
    resyncPromise = resyncFromDisk().finally(() => {
      resyncPromise = null
    })
  }
  return resyncPromise
}

export async function stopModsWatcher(): Promise<void> {
  diffListener = null
  await stopWatcher()
}
