import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessage } from '@renderer/components/shared/message-modal-context'
import type { StoreSetResult } from '../../../types/store'
import {
  AUTO_STORE_KEYS,
  EMPTY_DETECTED,
  EMPTY_OVERRIDES,
  PATH_KEYS,
  SAVE_FAILED_MESSAGE,
  STORE_KEYS,
  clearedAllErrors,
  clearedErrorForKey,
  clearManual,
  commitRejectionForKey,
  commitErrorForKey,
  detectedEqual,
  invalidFlagsForFirstIssue,
  missingLabels,
  normalizeStored,
  overridesEqual,
  persistAuto,
  redetectModsError,
  redetectProfileError,
  toDetected,
  normalizeCommitDraft,
  valueForKey,
  isDuplicateCommit
} from '@renderer/lib/path-utils'
import { invalidateModsHydration } from '@renderer/hooks/useMods'
import {
  readCachedDetected,
  readCachedOverrides,
  writeCachedOverride,
  writeCachedPaths
} from '@renderer/lib/paths-cache'
import { invalidateProfileCache } from '@renderer/lib/profile-cache'
import type {
  DetectedPaths,
  FieldErrors,
  InvalidFlags,
  Overrides,
  PathKey
} from '@renderer/lib/path-utils'

// Backward-compatible re-exports: the pure helpers now live in
// lib/path-utils.ts, but existing imports from this hook keep working.
export * from '@renderer/lib/path-utils'

export function usePaths(): {
  values: Record<PathKey, string>
  isManual: Record<PathKey, boolean>
  invalid: Record<PathKey, boolean>
  fieldErrors: Record<PathKey, string | null>
  detected: DetectedPaths
  loaded: boolean
  detecting: boolean
  commitPath: (key: PathKey, draft: string) => Promise<boolean>
  clearFieldError: (key: PathKey) => void
  resetPath: (key: PathKey) => void
  redetect: () => Promise<void>
} {
  // Seed from the sync paint cache so inputs open directly on the saved
  // values instead of flashing empty until the async store read resolves
  // (same rationale as the practice field caches). electron-store stays the
  // source of truth: the load below overwrites any stale cache without an
  // extra paint when values differ, and every write-through below keeps the
  // cache fresh.
  const [overrides, setOverrides] = useState<Overrides>(() => readCachedOverrides())
  const [detected, setDetected] = useState<DetectedPaths>(() => readCachedDetected())
  const [loaded, setLoaded] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(() => ({
    steam: null,
    game: null,
    mods: null,
    profile: null
  }))
  const [invalid, setInvalid] = useState<InvalidFlags>(() => ({
    steam: false,
    game: false,
    mods: false,
    profile: false
  }))
  // Guards refreshValidity so overlapping triggers (commit, reset, redetect,
  // focus) never run two validations concurrently.
  const refreshingRef = useRef(false)
  // In-flight commits by key for identical-confirmation dedup. Entries are
  // removed on settle, so retrying the same value after a failure works.
  const pendingCommits = useRef(
    new Map<PathKey, { payload: string | null; task: Promise<boolean> }>()
  )
  // Latest user intent per key. Every new intent (commit, edit, Reset, Auto
  // Detect) supersedes in-flight commits: a settlement applies its state
  // updates only when still the latest, so a late rejection can never
  // overwrite a newer draft's error state.
  const commitSeq = useRef<Record<PathKey, number>>({ steam: 0, game: 0, mods: 0, profile: 0 })
  const { showMessage } = useMessage()

  // Flags fields whose saved value fails path validation, so an invalid
  // manual path saved before commit-time validation existed is visibly
  // marked. Data only: no modal is ever shown here (Launch stays the
  // exclusive display point for validation modals).
  const refreshValidity = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      const result = await window.validation.validateApp()
      const next = invalidFlagsForFirstIssue(result.issues ?? [])
      setInvalid((prev) =>
        prev.steam === next.steam && prev.game === next.game && prev.mods === next.mods
          ? prev
          : { ...prev, steam: next.steam, game: next.game, mods: next.mods }
      )
    } catch (error) {
      console.error('Failed to refresh path validity:', error)
    } finally {
      refreshingRef.current = false
    }
  }, [])

  // Profile invalid flag, kept separate from launch validation: the profile
  // folder never blocks launch. Reads the persisted values directly so the
  // callback stays stable and can run on load, commit, reset, redetect and
  // focus without stale closures.
  const refreshProfileValidity = useCallback(async () => {
    try {
      const [storedManual, storedAuto] = await Promise.all([
        window.store.get(STORE_KEYS.profile),
        window.store.get(AUTO_STORE_KEYS.profile)
      ])
      const resolved = normalizeStored(storedManual) ?? normalizeStored(storedAuto) ?? ''
      if (resolved === '') {
        setInvalid((prev) => (prev.profile === false ? prev : { ...prev, profile: false }))
        return
      }
      const found = await window.profiles.list(resolved)
      const bad = found.length === 0
      setInvalid((prev) => (prev.profile === bad ? prev : { ...prev, profile: bad }))
    } catch (error) {
      console.error('Failed to refresh profile validity:', error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Persistent storage is the source of truth: load manual + last auto-detection first.
      let manual: Overrides
      let auto: DetectedPaths
      try {
        const [
          storedSteam,
          storedGame,
          storedMods,
          storedProfile,
          storedAutoSteam,
          storedAutoGame,
          storedAutoMods,
          storedAutoProfile
        ] = await Promise.all([
          window.store.get(STORE_KEYS.steam),
          window.store.get(STORE_KEYS.game),
          window.store.get(STORE_KEYS.mods),
          window.store.get(STORE_KEYS.profile),
          window.store.get(AUTO_STORE_KEYS.steam),
          window.store.get(AUTO_STORE_KEYS.game),
          window.store.get(AUTO_STORE_KEYS.mods),
          window.store.get(AUTO_STORE_KEYS.profile)
        ])
        if (cancelled) return
        manual = {
          steam: normalizeStored(storedSteam),
          game: normalizeStored(storedGame),
          mods: normalizeStored(storedMods),
          profile: normalizeStored(storedProfile)
        }
        auto = {
          steamPath: normalizeStored(storedAutoSteam),
          gamePath: normalizeStored(storedAutoGame),
          modsPath: normalizeStored(storedAutoMods),
          profilePath: normalizeStored(storedAutoProfile)
        }
      } catch (error) {
        console.error('Failed to load saved paths:', error)
        if (cancelled) return
        manual = { ...EMPTY_OVERRIDES }
        auto = { ...EMPTY_DETECTED }
      }

      // Never auto-detect on page open: detection only runs when the user
      // clicks Auto Detect (redetect). Load persisted values as-is; empty
      // storage means empty fields.
      // No validation modal here: modals run exclusively on Launch.
      // Fill inputs in place: only update state when values actually differ
      // to avoid re-rendering fields that already hold the right value.
      if (cancelled) return
      setOverrides((prev) => (overridesEqual(prev, manual) ? prev : manual))
      setDetected((prev) => (detectedEqual(prev, auto) ? prev : auto))
      // Keep the paint cache warm from the source of truth so the next mount
      // seeds from current values. Writes skip unchanged keys internally.
      writeCachedPaths(manual, auto)
      setLoaded(true)
      // Flag already-saved invalid paths (see refreshValidity).
      if (PATH_KEYS.some((key) => manual[key] !== null)) void refreshValidity()
      if (manual.profile !== null || auto.profilePath !== null) void refreshProfileValidity()
    })()
    return () => {
      cancelled = true
    }
  }, [refreshValidity, refreshProfileValidity])

  // Revalidate on window focus (mirrors useMods): a folder repaired outside
  // the app must clear a stale invalid flag without another commit.
  useEffect(() => {
    const onFocus = (): void => {
      void refreshValidity()
      void refreshProfileValidity()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshValidity, refreshProfileValidity])

  const redetect = useCallback(async () => {
    setDetecting(true)
    // Auto Detect discards every draft: supersede in-flight commits and drop
    // their errors up front, so the detected values resync into clean fields.
    for (const key of PATH_KEYS) commitSeq.current[key] += 1
    setFieldErrors((prev) => clearedAllErrors(prev))
    try {
      const raw = await window.paths.detect()
      const nextDetected = toDetected(raw)
      // Auto Detect overwrites the persisted auto-detection and clears manual
      // values, so results always show as auto (never manual).
      await Promise.all([persistAuto(nextDetected), clearManual()])
      // The mods path may have changed: let the mods cache revalidate.
      invalidateModsHydration()
      window.dispatchEvent(new Event('mods:revalidate'))
      // The profile path may have changed: invalidate profile cache.
      invalidateProfileCache()
      setDetected((prev) => (detectedEqual(prev, nextDetected) ? prev : nextDetected))
      setOverrides((prev) =>
        overridesEqual(prev, EMPTY_OVERRIDES) ? prev : { ...EMPTY_OVERRIDES }
      )
      // Mirror the persisted switch to auto: the next mount must seed from
      // the detected values, never from the discarded manual ones.
      writeCachedPaths({ ...EMPTY_OVERRIDES }, nextDetected)
      // Never clear blindly: without a valid mods result the previous error
      // and invalid flag stay until the user fixes the path by typing,
      // a successful Auto Detect, or Reset. Only a valid detection clears
      // the error and revalidates, so both disappear solely when the
      // resolved state is really valid.
      setFieldErrors((prev) => redetectModsError(prev, nextDetected.modsPath))
      setFieldErrors((prev) => redetectProfileError(prev, nextDetected.profilePath))
      if (nextDetected.modsPath !== null) void refreshValidity()
      if (nextDetected.profilePath !== null) void refreshProfileValidity()
      const missing = missingLabels({
        steam: nextDetected.steamPath ?? '',
        game: nextDetected.gamePath ?? '',
        mods: nextDetected.modsPath ?? '',
        profile: nextDetected.profilePath ?? ''
      })
      if (missing.length > 0) {
        showMessage({
          title: 'Paths not found',
          message: `Automatic detection did not find: ${missing.join(', ')}. You can set them manually.`,
          type: 'warning'
        })
      }
    } catch (error) {
      console.error('Failed to detect paths:', error)
      showMessage({
        title: 'Detection failed',
        message:
          'Automatic path detection failed. You can still set Steam Path, Game Path, Mods Path and Profile Path manually.',
        type: 'error'
      })
    } finally {
      setDetecting(false)
    }
  }, [showMessage, refreshValidity, refreshProfileValidity])

  const commitPath = useCallback(
    async (key: PathKey, draft: string): Promise<boolean> => {
      // Surrounding whitespace never persists; empty clears the manual value
      // and falls back to auto.
      const next = normalizeCommitDraft(draft)
      const current = valueForKey(key, overrides, detected)
      // Every new confirmation supersedes in-flight commits for the key.
      commitSeq.current[key] += 1
      const seq = commitSeq.current[key]
      // Unchanged text commits nothing (no write, no watcher refresh) but
      // still revalidates, so a saved-and-valid value clears stale UI state.
      if (next === (current === '' ? null : current)) {
        setFieldErrors((prev) => clearedErrorForKey(prev, key))
        if (key === 'profile') void refreshProfileValidity()
        else void refreshValidity()
        return true
      }
      // A repeat confirmation while the identical commit is still in flight
      // shares its promise instead of writing twice.
      const inFlight = pendingCommits.current.get(key)
      if (isDuplicateCommit(inFlight ? { key, payload: inFlight.payload } : null, key, next)) {
        return inFlight?.task ?? true
      }
      // Anything else persists only when the main process accepts it:
      // store:set reports an invalid manual mods path (see the store:set
      // handler), so a partial keystroke can never shadow a valid
      // auto-detection. The profile path has no store:set guard (see
      // index.ts), so it pre-validates here via profiles:list: an invalid
      // draft never reaches the store and its error keeps the typed text in
      // the input until the user edits it.
      const task = (async (): Promise<boolean> => {
        if (key === 'profile' && next !== null) {
          try {
            const found = await window.profiles.list(next)
            if (commitSeq.current[key] !== seq) return false
            if (found.length === 0) {
              setFieldErrors((prev) => commitErrorForKey(prev, key))
              return false
            }
          } catch (error) {
            console.error(`Failed to validate path "${STORE_KEYS[key]}":`, error)
            if (commitSeq.current[key] !== seq) return false
            setFieldErrors((prev) => ({ ...prev, [key]: SAVE_FAILED_MESSAGE }))
            return false
          }
        }
        let result: StoreSetResult
        try {
          result = await window.store.set(STORE_KEYS[key], next)
        } catch (error) {
          // Unexpected failure only (IPC/disk): fixed generic message, never
          // the raw error. A superseded settlement writes nothing.
          console.error(`Failed to save path "${STORE_KEYS[key]}":`, error)
          if (commitSeq.current[key] !== seq) return false
          setFieldErrors((prev) => ({ ...prev, [key]: SAVE_FAILED_MESSAGE }))
          return false
        }
        // A superseded settlement writes nothing: the newer intent owns the
        // error and override state. The draft itself is never rewritten here.
        if (commitSeq.current[key] !== seq) return result.ok
        if (!result.ok) {
          if (result.reason === 'unknown-key') {
            console.error(`Unexpected store key "${STORE_KEYS[key]}" rejected.`)
            return false
          }
          setFieldErrors((prev) => commitRejectionForKey(prev, key, result.reason))
          return false
        }
        setFieldErrors((prev) => clearedErrorForKey(prev, key))
        setOverrides((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }))
        // Keep the paint cache in sync with the committed manual value so the
        // next mount seeds from it.
        writeCachedOverride(key, next)
        // The mods path may have changed: let the mods cache revalidate.
        if (key === 'mods') {
          invalidateModsHydration()
          window.dispatchEvent(new Event('mods:revalidate'))
        }
        // The profile path may have changed: invalidate profile cache.
        if (key === 'profile') invalidateProfileCache()
        if (key === 'profile') void refreshProfileValidity()
        else void refreshValidity()
        return true
      })()
      pendingCommits.current.set(key, { payload: next, task })
      try {
        return await task
      } finally {
        // Release only our own entry: a newer commit for the same key may
        // already have replaced it, and retrying after a failure must work.
        if (pendingCommits.current.get(key)?.task === task) pendingCommits.current.delete(key)
      }
    },
    [overrides, detected, refreshValidity, refreshProfileValidity]
  )

  const clearFieldError = useCallback((key: PathKey) => {
    // Editing or discarding the draft supersedes any in-flight commit.
    commitSeq.current[key] += 1
    setFieldErrors((prev) => clearedErrorForKey(prev, key))
  }, [])

  const resetPath = useCallback(
    (key: PathKey) => {
      setOverrides((prev) => (prev[key] === null ? prev : { ...prev, [key]: null }))
      // Reset returns to auto: drop the manual paint cache synchronously with
      // the optimistic state so a remount before the store write settles
      // still seeds from auto.
      writeCachedOverride(key, null)
      // Reset discards the draft: supersede in-flight commits and drop the error.
      clearFieldError(key)
      window.store
        .set(STORE_KEYS[key], null)
        .then(() => {
          // The mods path may have changed: let the mods cache revalidate.
          if (key === 'mods') {
            invalidateModsHydration()
            window.dispatchEvent(new Event('mods:revalidate'))
          }
          // The profile path may have changed: invalidate profile cache.
          if (key === 'profile') invalidateProfileCache()
          if (key === 'profile') void refreshProfileValidity()
          else void refreshValidity()
        })
        .catch((error) => console.error(`Failed to reset path "${STORE_KEYS[key]}":`, error))
    },
    [refreshValidity, refreshProfileValidity, clearFieldError]
  )

  return {
    values: {
      steam: valueForKey('steam', overrides, detected),
      game: valueForKey('game', overrides, detected),
      mods: valueForKey('mods', overrides, detected),
      profile: valueForKey('profile', overrides, detected)
    },
    isManual: {
      steam: overrides.steam !== null,
      game: overrides.game !== null,
      mods: overrides.mods !== null,
      profile: overrides.profile !== null
    },
    invalid,
    fieldErrors,
    detected,
    loaded,
    detecting,
    commitPath,
    clearFieldError,
    resetPath,
    redetect
  }
}
