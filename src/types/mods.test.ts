import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyDiffToSnapshot, settleHydration } from './mods'
import type { Bike, Helmet, ModDiff, ModsSnapshot, Rider, RidingStyle, Track } from './mods'

const INVALID: ModsSnapshot = { valid: false, ready: false, mods: {} }

function bike(id: string): Bike {
  return {
    id,
    name: id,
    brand: '',
    class: '',
    year: 2024,
    version: '1.0',
    author: '',
    preview: null,
    paints: []
  }
}

function validSnapshot(ids: string[]): ModsSnapshot {
  return { valid: true, ready: true, mods: { bikes: ids.map(bike) } }
}

function track(id: string): Track {
  return {
    id,
    name: id,
    country: '',
    length: 0,
    version: '1.0',
    author: '',
    preview: null,
    layouts: []
  }
}

function rider(id: string): Rider {
  return { id, name: id, version: '1.0', author: '', preview: null, paints: [] }
}

function helmet(id: string): Helmet {
  return { id, name: id, version: '1.0', author: '', preview: null, paints: [] }
}

function ridingStyle(id: string): RidingStyle {
  return { id, name: id, preview: null }
}

describe('applyDiffToSnapshot', () => {
  it('merges upserts and removals without touching validity', () => {
    const diff: ModDiff = { type: 'bikes', upserted: [bike('new')], removed: ['old'] }
    expect(applyDiffToSnapshot(validSnapshot(['old', 'kept']), diff)).toEqual({
      valid: true,
      ready: true,
      mods: { bikes: [bike('kept'), bike('new')] }
    })
  })
})

describe('settleHydration', () => {
  it('returns the fetch result when nothing arrived during hydration', () => {
    const fetched = validSnapshot(['bikeA'])
    expect(settleHydration(fetched, [])).toBe(fetched)
  })

  it('a stale valid:false fetch recovers when a valid snapshot arrived during hydration', () => {
    const recovered = settleHydration(INVALID, [validSnapshot(['bikeA'])])
    expect(recovered.valid).toBe(true)
    expect((recovered.mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
  })

  it('stays invalid when only invalid snapshots arrived during hydration', () => {
    expect(settleHydration(INVALID, [INVALID])).toEqual(INVALID)
  })

  it('applies a buffered diff on top of the fetched snapshot in order', () => {
    const diff: ModDiff = { type: 'bikes', upserted: [bike('live')], removed: [] }
    const settled = settleHydration(validSnapshot(['fetched']), [diff])
    expect((settled.mods.bikes ?? []).map((b) => b.id)).toEqual(['fetched', 'live'])
  })
})

// Guarded merge: valid diffs behave exactly as before, while a malformed
// or unknown-typed diff is ignored (same snapshot back, no throw, no
// phantom key) and reported once per process.
describe('applyDiffToSnapshot guard', () => {
  const emptySnapshot: ModsSnapshot = { valid: true, ready: true, mods: {} }

  it.each([
    ['bikes', bike('new-bike')],
    ['tracks', track('new-track')],
    ['riders', rider('new-rider')],
    ['helmets', helmet('new-helmet')],
    ['ridingStyles', ridingStyle('new-style')]
  ] as const)('merges a valid %s diff', (type, mod) => {
    const diff = { type, upserted: [mod], removed: [] } as unknown as ModDiff
    const result = applyDiffToSnapshot(emptySnapshot, diff)
    expect(result.mods[type]).toEqual([mod])
  })

  it('ignores an unknown diff type, returning the same snapshot', () => {
    const diff = { type: 'misc', upserted: [], removed: [] } as unknown as ModDiff
    const result = applyDiffToSnapshot(emptySnapshot, diff)
    expect(result).toBe(emptySnapshot)
    expect('misc' in result.mods).toBe(false)
  })

  it.each([
    ['missing upserted', { type: 'bikes', removed: [] }],
    ['missing removed', { type: 'bikes', upserted: [bike('new')] }],
    ['non-array upserted', { type: 'bikes', upserted: 123, removed: [] }],
    ['non-array removed', { type: 'bikes', upserted: [], removed: 123 }]
  ] as const)('ignores a diff with %s without throwing', (_label, raw) => {
    const diff = raw as unknown as ModDiff
    expect(() => applyDiffToSnapshot(emptySnapshot, diff)).not.toThrow()
    expect(applyDiffToSnapshot(emptySnapshot, diff)).toBe(emptySnapshot)
  })

  it('ignores a diff with a non-string type', () => {
    const diff = { type: 123, upserted: [], removed: [] } as unknown as ModDiff
    expect(() => applyDiffToSnapshot(emptySnapshot, diff)).not.toThrow()
    expect(applyDiffToSnapshot(emptySnapshot, diff)).toBe(emptySnapshot)
  })
})

describe('invalid mod diff logging', () => {
  let fresh: typeof import('./mods')
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    fresh = await import('./mods')
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs an invalid diff only once per process', async () => {
    const snapshot: ModsSnapshot = { valid: true, ready: true, mods: {} }
    const bad = { type: 'misc', upserted: [], removed: [] } as unknown as ModDiff
    expect(fresh.applyDiffToSnapshot(snapshot, bad)).toBe(snapshot)
    expect(fresh.applyDiffToSnapshot(snapshot, bad)).toBe(snapshot)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('Ignored an invalid mod diff.')
  })

  it('stays silent for valid diffs', async () => {
    const snapshot: ModsSnapshot = { valid: true, ready: true, mods: {} }
    const diff: ModDiff = { type: 'bikes', upserted: [], removed: [] }
    expect(fresh.applyDiffToSnapshot(snapshot, diff)).not.toBe(snapshot)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
