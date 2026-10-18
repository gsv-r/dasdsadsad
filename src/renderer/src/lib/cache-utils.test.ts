import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCachedKeyIf,
  createMemorySnapshot,
  readCachedString,
  readJsonSnapshot,
  removeCachedKey,
  writeCachedString,
  writeJsonSnapshot
} from './cache-utils.js'

function mockStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    }
  }
  vi.stubGlobal('window', { localStorage })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cache-utils string primitives', () => {
  it('reads a missing key as null', () => {
    mockStorage()
    expect(readCachedString('missing')).toBeNull()
  })

  it('writes only on divergence', () => {
    const store = mockStorage({ k: 'v' })
    const setSpy = vi.spyOn(store, 'set')
    writeCachedString('k', 'v')
    expect(setSpy).not.toHaveBeenCalled()
    writeCachedString('k', 'v2')
    expect(store.get('k')).toBe('v2')
  })

  it('removes keys and clears conditionally', () => {
    const store = mockStorage({ a: '1', b: '2' })
    removeCachedKey('a')
    expect(store.has('a')).toBe(false)
    clearCachedKeyIf('b', 'other')
    expect(store.has('b')).toBe(true)
    clearCachedKeyIf('b', '2')
    expect(store.has('b')).toBe(false)
  })

  it('returns null when storage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
        removeItem: () => {
          throw new Error('denied')
        }
      }
    })
    expect(readCachedString('k')).toBeNull()
    expect(() => writeCachedString('k', 'v')).not.toThrow()
    expect(() => removeCachedKey('k')).not.toThrow()
    expect(() => clearCachedKeyIf('k', 'v')).not.toThrow()
  })
})

describe('cache-utils json primitives', () => {
  it('round-trips JSON and skips unchanged writes', () => {
    const store = mockStorage()
    writeJsonSnapshot('snap', { id: 'a', n: 1 })
    const setSpy = vi.spyOn(store, 'set')
    writeJsonSnapshot('snap', { id: 'a', n: 1 })
    expect(setSpy).not.toHaveBeenCalled()
    expect(readJsonSnapshot<{ id: string; n: number }>('snap')).toEqual({ id: 'a', n: 1 })
  })

  it('returns null for missing or invalid JSON', () => {
    mockStorage({ bad: 'not-json{' })
    expect(readJsonSnapshot('missing')).toBeNull()
    expect(readJsonSnapshot('bad')).toBeNull()
  })
})

describe('createMemorySnapshot', () => {
  it('starts null, holds set values and clears', () => {
    const snap = createMemorySnapshot<string[]>()
    expect(snap.get()).toBeNull()
    snap.set(['a'])
    expect(snap.get()).toEqual(['a'])
    snap.clear()
    expect(snap.get()).toBeNull()
  })
})
