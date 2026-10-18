import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCachedProfile,
  readCachedActiveProfile,
  readCachedNationality,
  writeCachedActiveProfile,
  writeCachedNationality
} from './profile-cache.js'

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

describe('profile-cache', () => {
  it('reads an empty cache as nulls', () => {
    mockStorage()
    expect(readCachedActiveProfile()).toBeNull()
    expect(readCachedNationality()).toBeNull()
  })

  it('round-trips the active profile', () => {
    mockStorage()
    writeCachedActiveProfile({ id: 'Rider', name: 'Rider', raceNumber: '7' })
    expect(readCachedActiveProfile()).toEqual({ id: 'Rider', name: 'Rider', raceNumber: '7' })
  })

  it('keeps a null race number as null', () => {
    mockStorage()
    writeCachedActiveProfile({ id: 'Rider', name: 'Rider', raceNumber: null })
    expect(readCachedActiveProfile()).toEqual({ id: 'Rider', name: 'Rider', raceNumber: null })
  })

  it('falls back to the folder id when the cached name is missing', () => {
    mockStorage({
      'profile.active.snapshot': JSON.stringify({ id: 'Rider', raceNumber: '7' })
    })
    expect(readCachedActiveProfile()).toEqual({ id: 'Rider', name: 'Rider', raceNumber: '7' })
  })

  it('rejects a snapshot without a folder id', () => {
    mockStorage({
      'profile.active.snapshot': JSON.stringify({ name: 'Rider', raceNumber: '7' })
    })
    expect(readCachedActiveProfile()).toBeNull()
  })

  it('rejects invalid snapshot JSON', () => {
    mockStorage({ 'profile.active.snapshot': 'not-json{' })
    expect(readCachedActiveProfile()).toBeNull()
  })

  it('validates the cached nationality like the screen does', () => {
    mockStorage({ 'profile.nationality': 'BR' })
    expect(readCachedNationality()).toBe('br')
    mockStorage({ 'profile.nationality': 'xx' })
    expect(readCachedNationality()).toBeNull()
    mockStorage({ 'profile.nationality': '   ' })
    expect(readCachedNationality()).toBeNull()
  })

  it('writes the nationality normalized and removes on null', () => {
    const store = mockStorage()
    writeCachedNationality('BR')
    expect(store.get('profile.nationality')).toBe('br')
    writeCachedNationality(null)
    expect(store.has('profile.nationality')).toBe(false)
  })

  it('clears the profile paint cache', () => {
    mockStorage()
    writeCachedActiveProfile({ id: 'Rider', name: 'Rider', raceNumber: '7' })
    writeCachedNationality('br')
    clearCachedProfile()
    expect(readCachedActiveProfile()).toBeNull()
    expect(readCachedNationality()).toBeNull()
  })

  it('removes the snapshot when writing null', () => {
    mockStorage()
    writeCachedActiveProfile({ id: 'Rider', name: 'Rider', raceNumber: '7' })
    writeCachedActiveProfile(null)
    expect(readCachedActiveProfile()).toBeNull()
  })

  it('remembers a confirmed empty across navigation until reset', async () => {
    const cache = await import('./profile-cache.js')
    cache.writeProfileScreenSnapshot(null)
    expect(cache.readProfileScreenSnapshot()).toBeNull()
    cache.writeProfileScreenSnapshot({ id: 'Rider', name: 'Rider', raceNumber: '7' })
    expect(cache.readProfileScreenSnapshot()).toEqual({
      id: 'Rider',
      name: 'Rider',
      raceNumber: '7'
    })
    cache.invalidateProfileScreenSnapshot()
    expect(cache.readProfileScreenSnapshot()).toBeUndefined()
  })
})
