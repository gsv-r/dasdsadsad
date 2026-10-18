import { useEffect, useState } from 'react'
import { createMemorySnapshot } from '../lib/cache-utils'
import type {
  PlayerSetup,
  SetupSaveResult,
  SetupDeleteResult,
  SetupSelectResult
} from '../../../types/setups'

// Module-level snapshot so re-entering the screen renders instantly instead
// of flashing the loading state (same rationale as the useMods snapshot).
// Mutations refresh it, so every hook instance starts from current data.
// Backed by the shared createMemorySnapshot helper (see lib/cache-utils.ts);
// useMods keeps its own subscription/diff machinery because its lifecycle
// (buffered diffs, revalidate, useSyncExternalStore) does not fit this shape.
const setupsSnapshot = createMemorySnapshot<PlayerSetup[]>()

// Drops the snapshot (e.g. after launcher:reset clears the store), so the
// next mount fetches from the store instead of showing stale setups.
export function invalidateSetupsSnapshot(): void {
  setupsSnapshot.clear()
}

export function useSetups(): {
  setups: PlayerSetup[]
  loading: boolean
  loaded: boolean
  create: (data: Omit<PlayerSetup, 'id'>) => Promise<SetupSaveResult>
  update: (id: string, data: Partial<Omit<PlayerSetup, 'id'>>) => Promise<SetupSaveResult>
  delete: (id: string) => Promise<SetupDeleteResult>
  select: (id: string | null) => Promise<SetupSelectResult>
} {
  const [setups, setSetups] = useState<PlayerSetup[]>(() => setupsSnapshot.get() ?? [])
  const [loading, setLoading] = useState(() => setupsSnapshot.get() === null)
  const [loaded, setLoaded] = useState(() => setupsSnapshot.get() !== null)

  useEffect(() => {
    if (setupsSnapshot.get() !== null) return
    let cancelled = false
    void window.setups
      .list()
      .then((list) => {
        if (!cancelled) {
          setupsSnapshot.set(list)
          setSetups(list)
          setLoaded(true)
        }
      })
      .catch((error) => {
        console.error('Failed to list setups:', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const create = async (data: Omit<PlayerSetup, 'id'>): Promise<SetupSaveResult> => {
    const result = await window.setups.create(data)
    if (result.ok) {
      const list = await window.setups.list()
      setupsSnapshot.set(list)
      setSetups(list)
      setLoaded(true)
    }
    return result
  }

  const update = async (
    id: string,
    data: Partial<Omit<PlayerSetup, 'id'>>
  ): Promise<SetupSaveResult> => {
    const result = await window.setups.update(id, data)
    if (result.ok) {
      const list = await window.setups.list()
      setupsSnapshot.set(list)
      setSetups(list)
      setLoaded(true)
    }
    return result
  }

  const deleteSetup = async (id: string): Promise<SetupDeleteResult> => {
    const result = await window.setups.delete(id)
    if (result.ok) {
      const list = await window.setups.list()
      setupsSnapshot.set(list)
      setSetups(list)
      setLoaded(true)
    }
    return result
  }

  const select = async (id: string | null): Promise<SetupSelectResult> => {
    return window.setups.select(id)
  }

  return { setups, loading, loaded, create, update, delete: deleteSetup, select }
}
