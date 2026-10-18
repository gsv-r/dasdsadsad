import { describe, expect, it } from 'vitest'
import {
  STORE_READ_KEYS,
  STORE_WRITE_KEYS,
  STORE_WRITE_SCHEMAS,
  isStoreReadKey,
  isStoreWriteKey
} from './store.js'

describe('store read allowlist', () => {
  it('locks the exact key list: adding or removing a key breaks this test', () => {
    expect([...STORE_READ_KEYS]).toEqual([
      'paths.steam',
      'paths.game',
      'paths.mods',
      'paths.profile',
      'pathsAuto.steam',
      'pathsAuto.game',
      'pathsAuto.mods',
      'pathsAuto.profile',
      'profile.nationality',
      'practice.settings.weather_conditions',
      'practice.settings.temperature',
      'practice.settings.wind_direction',
      'practice.settings.wind_speed',
      'practice.settings.track_conditions',
      'practice.bike.helmet',
      'practice.bike.rider',
      'practice.bike.bike_id',
      'practice.track.track_id',
      'practice.bike',
      'practice.setup_id',
      'practice.bike.paint',
      'practice.track.track_layout',
      'practice.bike.helmet_paint',
      'practice.bike.suit_paint',
      'practice.bike.riding_style'
    ])
  })

  it('accepts every listed key and rejects the rest', () => {
    for (const key of STORE_READ_KEYS) {
      expect(isStoreReadKey(key)).toBe(true)
    }
    for (const key of ['paths', 'pathsAuto', 'modsCache', 'setups', 'setup', 'practice', 'nope', '']) {
      expect(isStoreReadKey(key)).toBe(false)
    }
    for (const key of [123, null, undefined, {}, []]) {
      expect(isStoreReadKey(key)).toBe(false)
    }
  })
})

describe('store write allowlist', () => {
  it('locks the exact key list: adding or removing a key breaks this test', () => {
    expect([...STORE_WRITE_KEYS]).toEqual([
      'paths.steam',
      'paths.game',
      'paths.mods',
      'paths.profile',
      'pathsAuto.steam',
      'pathsAuto.game',
      'pathsAuto.mods',
      'pathsAuto.profile',
      'profile.nationality',
      'practice.settings.weather_conditions',
      'practice.settings.temperature',
      'practice.settings.wind_direction',
      'practice.settings.wind_speed',
      'practice.settings.track_conditions'
    ])
  })

  it('is a subset of the read allowlist', () => {
    for (const key of STORE_WRITE_KEYS) {
      expect(isStoreReadKey(key)).toBe(true)
    }
  })

  it('rejects bulk objects, caches and unknown keys', () => {
    for (const key of ['paths', 'pathsAuto', 'modsCache', 'setups', 'practice', 'nope']) {
      expect(isStoreWriteKey(key)).toBe(false)
    }
    for (const key of [123, null, undefined, {}, []]) {
      expect(isStoreWriteKey(key)).toBe(false)
    }
  })
})

describe('store write value schemas', () => {
  it('has a schema for every writable key', () => {
    expect(Object.keys(STORE_WRITE_SCHEMAS).sort()).toEqual([...STORE_WRITE_KEYS].sort())
  })

  it.each([
    'paths.steam',
    'paths.game',
    'paths.mods',
    'paths.profile',
    'pathsAuto.steam',
    'pathsAuto.game',
    'pathsAuto.mods',
    'pathsAuto.profile',
    'profile.nationality'
  ] as const)('accepts the string|null values %s callers send', (key) => {
    expect(STORE_WRITE_SCHEMAS[key].safeParse('C:\\some\\path').success).toBe(true)
    expect(STORE_WRITE_SCHEMAS[key].safeParse(null).success).toBe(true)
    expect(STORE_WRITE_SCHEMAS[key].safeParse(123).success).toBe(false)
    expect(STORE_WRITE_SCHEMAS[key].safeParse(undefined).success).toBe(false)
    expect(STORE_WRITE_SCHEMAS[key].safeParse({}).success).toBe(false)
  })

  it.each([
    ['practice.settings.weather_conditions', 0, 2],
    ['practice.settings.temperature', 10, 38],
    ['practice.settings.wind_direction', 0, 7],
    ['practice.settings.wind_speed', 0, 11],
    ['practice.settings.track_conditions', 0, 100]
  ] as const)(
    'accepts only in-range integers for %s (slider/select/DEFAULT_SETTINGS values)',
    (key, min, max) => {
      expect(STORE_WRITE_SCHEMAS[key].safeParse(min).success).toBe(true)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(max).success).toBe(true)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(min - 1).success).toBe(false)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(max + 1).success).toBe(false)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(min + 0.5).success).toBe(false)
      expect(STORE_WRITE_SCHEMAS[key].safeParse('25').success).toBe(false)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(null).success).toBe(false)
      expect(STORE_WRITE_SCHEMAS[key].safeParse(undefined).success).toBe(false)
    }
  )

  it('accepts every value DEFAULT_SETTINGS and toggleIdeal produce', () => {
    const byStoreField = {
      'practice.settings.weather_conditions': 0,
      'practice.settings.temperature': 25,
      'practice.settings.wind_direction': 0,
      'practice.settings.wind_speed': 0,
      'practice.settings.track_conditions': 0
    } as const
    for (const [key, value] of Object.entries(byStoreField)) {
      expect(
        STORE_WRITE_SCHEMAS[key as keyof typeof byStoreField].safeParse(value).success
      ).toBe(true)
    }
  })
})
