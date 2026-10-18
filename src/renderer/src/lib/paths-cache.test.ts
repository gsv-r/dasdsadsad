import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCachedPaths,
  readCachedDetected,
  readCachedOverrides,
  writeCachedDetected,
  writeCachedOverride,
  writeCachedPaths
} from './paths-cache.js'

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

describe('paths-cache', () => {
  it('reads an empty cache as nulls', () => {
    mockStorage()
    expect(readCachedOverrides()).toEqual({ steam: null, game: null, mods: null, profile: null })
    expect(readCachedDetected()).toEqual({
      steamPath: null,
      gamePath: null,
      modsPath: null,
      profilePath: null
    })
  })

  it('reads stored manual and auto values', () => {
    mockStorage({
      'paths.steam': 'C:\\steam',
      'paths.mods': 'C:\\mods',
      'pathsAuto.game': 'C:\\game',
      'pathsAuto.profile': 'C:\\profiles'
    })
    expect(readCachedOverrides()).toEqual({
      steam: 'C:\\steam',
      game: null,
      mods: 'C:\\mods',
      profile: null
    })
    expect(readCachedDetected()).toEqual({
      steamPath: null,
      gamePath: 'C:\\game',
      modsPath: null,
      profilePath: 'C:\\profiles'
    })
  })

  it('treats blank cached text as missing', () => {
    mockStorage({ 'paths.steam': '   ', 'pathsAuto.mods': '' })
    expect(readCachedOverrides().steam).toBeNull()
    expect(readCachedDetected().modsPath).toBeNull()
  })

  it('writes overrides and removes on null', () => {
    const store = mockStorage({ 'paths.steam': 'C:\\old' })
    writeCachedOverride('steam', 'C:\\new')
    expect(store.get('paths.steam')).toBe('C:\\new')
    writeCachedOverride('steam', null)
    expect(store.has('paths.steam')).toBe(false)
  })

  it('round-trips manual plus auto and clears all', () => {
    const store = mockStorage()
    writeCachedPaths(
      { steam: 'C:\\steam', game: null, mods: 'C:\\mods', profile: null },
      { steamPath: null, gamePath: 'C:\\game', modsPath: null, profilePath: 'C:\\profiles' }
    )
    expect(readCachedOverrides()).toEqual({
      steam: 'C:\\steam',
      game: null,
      mods: 'C:\\mods',
      profile: null
    })
    expect(readCachedDetected()).toEqual({
      steamPath: null,
      gamePath: 'C:\\game',
      modsPath: null,
      profilePath: 'C:\\profiles'
    })
    writeCachedDetected({ steamPath: 'C:\\s', gamePath: null, modsPath: 'C:\\m', profilePath: null })
    expect(store.get('pathsAuto.steam')).toBe('C:\\s')
    clearCachedPaths()
    expect(readCachedOverrides()).toEqual({ steam: null, game: null, mods: null, profile: null })
    expect(readCachedDetected()).toEqual({
      steamPath: null,
      gamePath: null,
      modsPath: null,
      profilePath: null
    })
  })
})
