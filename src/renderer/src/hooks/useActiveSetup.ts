import { useEffect, useState } from 'react'
import { useSetups } from './useSetups'
import { clearCachedSetupIdIf, readCachedSetupId, setCachedSetupId } from '../lib/practice-cache'
import type { PlayerSetup, SetupSelectResult } from '../../../types/setups'

// Module snapshot of the last confirmed setup_id (null means confirmed
// None). The paint cache is removed on null, so it conflates a cache miss
// with confirmed None: without this every Practice entry with None active
// would start with the select disabled. Memory survives navigation; a cold
// boot still starts disabled once.
let setupIdSnapshot: string | null | undefined = undefined

// Drops the snapshot (e.g. after launcher:reset clears the store), so the
// next mount fetches from the store instead of showing stale setup data.
export function invalidateActiveSetupSnapshot(): void {
  setupIdSnapshot = undefined
}

export function useActiveSetup(): {
  setupId: string | null
  setup: PlayerSetup | null
  setups: PlayerSetup[]
  loading: boolean
  applySetup: (id: string | null) => Promise<SetupSelectResult>
} {
  const { setups, loading: setupsLoading, loaded: setupsLoaded, select } = useSetups()
  // Seed from the module snapshot when navigation already confirmed a value
  // (including confirmed None); otherwise seed from the paint cache. Loading
  // is only reported when nothing is confirmed yet, so a seeded select opens
  // enabled on the right value instead of flashing disabled/loading.
  const [setupId, setSetupId] = useState<string | null>(
    () => setupIdSnapshot ?? readCachedSetupId()
  )
  const [loading, setLoading] = useState(() => setupIdSnapshot === undefined)

  const setup = setupId ? (setups.find((s) => s.id === setupId) ?? null) : null

  // Orphan setup_id (not in list): treat as null and clear the store.
  // Runs only after a successful list(): a failed list() leaves setups empty
  // and must never wipe a valid active setup.
  useEffect(() => {
    if (setupsLoaded && !loading && setupId && !setups.some((s) => s.id === setupId)) {
      setSetupId(null)
      setupIdSnapshot = null
      clearCachedSetupIdIf(setupId)
      void window.setups.select(null).catch((error) => {
        console.error('Failed to clear orphan setup_id:', error)
      })
    }
  }, [setupsLoaded, loading, setupId, setups])

  useEffect(() => {
    let cancelled = false
    // A confirmed snapshot still reconciles silently with the store: the
    // seeded select never flashes loading, but an outside change still
    // corrects it in place without a loading flash.
    const reportLoading = setupIdSnapshot === undefined
    if (!reportLoading) setLoading(false)
    const loadSetupId = async () => {
      try {
        const stored = await window.store.get<string>('practice.setup_id')
        if (!cancelled) {
          if (stored && stored !== '' && stored !== 'null') {
            setSetupId((prev) => (prev === stored ? prev : stored))
            setupIdSnapshot = stored
            setCachedSetupId(stored)
          } else {
            setSetupId((prev) => (prev === null ? prev : null))
            setupIdSnapshot = null
            setCachedSetupId(null)
          }
        }
      } catch (error) {
        console.error('Failed to load setup_id:', error)
        if (!cancelled) {
          setSetupId(null)
        }
      } finally {
        if (!cancelled && reportLoading) setLoading(false)
      }
    }
    loadSetupId()
    return () => {
      cancelled = true
    }
  }, [])

  const applySetup = async (id: string | null) => {
    const result = await select(id)
    if (result.ok) {
      if (id) {
        setSetupId(id)
      } else {
        setSetupId(null)
      }
      setupIdSnapshot = id
      setCachedSetupId(id)
    }
    return result
  }

  return { setupId, setup, setups, loading: setupsLoading || loading, applySetup }
}
