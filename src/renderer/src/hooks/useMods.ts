import { useEffect, useState, useSyncExternalStore } from 'react'
import { applyDiffToSnapshot, isModDiff, settleHydration } from '../../../types/mods'
import type { AnyMod, ModChangedMessage, ModDiff, ModsSnapshot, ModType } from '../../../types/mods'
import { INVALID_MODS_FOLDER_MESSAGE } from '../lib/mods-errors'

const LOADING_SNAPSHOT: ModsSnapshot = { valid: true, ready: false, mods: {} }

// Dispatched after a paths store write so an invalid snapshot revalidates.
const REVALIDATE_EVENT = 'mods:revalidate'

// Clears only the hydration promise so the next mount refetches, without
// clearing the current snapshot (avoids flicker per ui-quality.md).
export function invalidateModsHydration(): void {
  hydratePromise = null
  hydrated = false
}

// Module-level cache hydrated once via mods:getAll, so navigating between
// pages never flashes an empty list. Incremental diffs merge in place; a
// full snapshot replaces the state (never merges stale entries).
let snapshot: ModsSnapshot | null = null
let hydrated = false
let hydratePromise: Promise<void> | null = null
let hydrating = false
// Messages arriving while the initial fetch is in flight. They apply on top
// of the fetch result in order (see settleHydration), never get lost.
let buffered: ModChangedMessage[] = []
const listeners = new Set<() => void>()
let unsubscribeMods: (() => void) | null = null
let subscriberCount = 0

function notify(): void {
  for (const listener of listeners) listener()
}

function getSnapshot(): ModsSnapshot | null {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function applyDiff(diff: ModDiff): void {
  if (!snapshot) return
  snapshot = applyDiffToSnapshot(snapshot, diff)
  notify()
}

function applyMessage(message: ModChangedMessage): void {
  // Never lose events that arrive during the initial fetch: buffer them and
  // let the fetch settle apply them in order.
  if (hydrating && snapshot === null) {
    buffered.push(message)
    return
  }
  if (isModDiff(message)) {
    applyDiff(message)
    return
  }
  snapshot = message
  notify()
}

function ensureSubscription(): void {
  if (unsubscribeMods) return
  unsubscribeMods = window.mods.onChanged(applyMessage)
}

function releaseSubscription(): void {
  if (subscriberCount === 0 && unsubscribeMods) {
    unsubscribeMods()
    unsubscribeMods = null
  }
}

function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    // Subscribe before fetching so events during hydration are buffered.
    ensureSubscription()
    hydrating = true
    hydratePromise = window.mods
      .getAll()
      .then((next) => {
        snapshot = settleHydration(next, buffered)
        buffered = []
        notify()
      })
      .catch((error) => {
        // mods:getAll failing says nothing about the mods path: keep the
        // previous state, or a neutral loading state on first load. Only
        // the main validation (valid:false) ever shows the invalid warning.
        // Validation modals run only on Launch.
        console.error('Failed to fetch mods:', error)
        if (!snapshot) snapshot = { ...LOADING_SNAPSHOT }
        buffered = []
        notify()
      })
      .finally(() => {
        hydrating = false
      })
  }
  return hydratePromise
}

// Deliberately a no-op while a fetch is in flight or the snapshot is already
// valid. That guard exists for the focus path only: window focus is owned by
// main (refreshModsWatcher + refreshByFocus), so the renderer must not add a
// second IPC per focus, and a re-mount reuses the hydrated snapshot.
// The initial load always fetches (ensureHydrated is not gated), and an
// explicit user refresh goes through refreshMods below.
// force=true (paths store write) always refetches, since validity may have
// changed under the current snapshot.
export function revalidateMods(force = false): void {
  if (hydrating) return
  if (!force && snapshot && snapshot.valid) return
  hydratePromise = null
  hydrated = false
  void ensureHydrated().finally(() => {
    hydrated = true
  })
}

// Explicit user refresh (the list refresh button): asks main for a full
// rescan that ignores the focus gate. It never clears the snapshot and never
// flips isLoading, so the list stays on screen while the scan runs (no
// flicker, per ui-quality.md). Main pushes the new state as mods:changed
// only when it actually differs, so the promise carries no payload.
let refreshInFlight = false
const refreshListeners = new Set<() => void>()

export function subscribeModsRefresh(listener: () => void): () => void {
  refreshListeners.add(listener)
  return () => {
    refreshListeners.delete(listener)
  }
}

export function isRefreshingMods(): boolean {
  return refreshInFlight
}

export async function refreshMods(): Promise<void> {
  if (refreshInFlight) return
  refreshInFlight = true
  for (const listener of refreshListeners) listener()
  try {
    await window.mods.refresh()
  } catch (error) {
    // A failed refresh leaves the current snapshot untouched: the next focus
    // or button press retries.
    console.error('Failed to refresh mods:', error)
  } finally {
    refreshInFlight = false
    for (const listener of refreshListeners) listener()
  }
}

// Drops the snapshot (e.g. after launcher:reset clears the store), so the
// next mount fetches from the source instead of showing stale mods.
export function invalidateModsSnapshot(): void {
  snapshot = null
  hydratePromise = null
  hydrated = false
  hydrating = false
  notify()
}

// Fixed guidance text for bikes/tracks cards: always visible, never changes
// based on state. The invalid warning is shown conditionally in a reserved
// slot via aria-live.
export const BIKES_FIXED_MESSAGE =
  'Bikes are read from the Mods Path in Settings.'
export const TRACKS_FIXED_MESSAGE =
  'Tracks are read from the Mods Path in Settings.'

function useModsCache(): { snapshot: ModsSnapshot | null; isLoading: boolean } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [isLoading, setIsLoading] = useState(() => !hydrated)

  useEffect(() => {
    subscriberCount += 1
    ensureSubscription()
    const onFocus = (): void => revalidateMods(false)
    const onRevalidate = (): void => revalidateMods(true)
    window.addEventListener('focus', onFocus)
    window.addEventListener(REVALIDATE_EVENT, onRevalidate)
    let cancelled = false
    void ensureHydrated().finally(() => {
      hydrated = true
      if (!cancelled) setIsLoading(false)
      // Mount-time recovery: a stale invalid first snapshot refetches once.
      if (!cancelled) revalidateMods(false)
    })
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(REVALIDATE_EVENT, onRevalidate)
      subscriberCount -= 1
      releaseSubscription()
    }
  }, [])

  return { snapshot: current, isLoading }
}

export function useMods<T extends AnyMod>(
  type: ModType
): { items: T[]; isLoading: boolean; valid: boolean; ready: boolean; loaded: boolean } {
  const { snapshot: current, isLoading } = useModsCache()
  if (!current) return { items: [], isLoading, valid: true, ready: false, loaded: false }
  return {
    items: ((current.mods[type] as T[] | undefined) ?? []).slice(),
    isLoading,
    valid: current.valid,
    ready: current.ready,
    loaded: true
  }
}

// Empty-list error for the bikes/tracks screens: the invalid warning only,
// on confirmed main validation. Anything else renders blank: no pending
// text, no not-found claim.
export function getBikesEmptyMessage(showInvalid: boolean): string {
  if (showInvalid) return INVALID_MODS_FOLDER_MESSAGE
  return ''
}

export function getTracksEmptyMessage(showInvalid: boolean): string {
  if (showInvalid) return INVALID_MODS_FOLDER_MESSAGE
  return ''
}
