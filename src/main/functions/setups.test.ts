import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerSetup } from '../../types/setups.js'

type DotStore = Record<string, unknown>

function getDot(obj: DotStore, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined
    return (acc as DotStore)[part]
  }, obj)
}

function setDot(obj: DotStore, key: string, value: unknown): void {
  const parts = key.split('.')
  let node = obj
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] as string
    if (typeof node[part] !== 'object' || node[part] === null) {
      node[part] = {}
    }
    node = node[part] as DotStore
  }
  node[parts[parts.length - 1] as string] = value
}

function snapshotPractice(): unknown {
  return JSON.parse(JSON.stringify(getDot(persisted, 'practice'))) as unknown
}

const persisted: DotStore = {}

const storeMock = {
  store: persisted,
  get: vi.fn((key: string) => getDot(persisted, key)),
  set: vi.fn((key: string, value: unknown) => {
    setDot(persisted, key, value)
  })
}

const pathsMock = {
  getResolvedGamePath: vi.fn((): string | null => '/game'),
  getResolvedModsPath: vi.fn((): string | null => '/mods')
}

vi.mock('../store', () => ({
  DEFAULT_PRACTICE_STATE: {
    bike: {
      bike_id: 'schwaben_m2_18',
      paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    },
    track: { track_id: 'Adriatic', track_layout: '' },
    settings: {
      weather_realistic: 0,
      weather_conditions: 0,
      temperature: 25,
      wind_direction: 0,
      wind_speed: 0,
      track_conditions: 0
    },
    dynamicsurface: { disable: 0 },
    setup_id: null
  },
  store: storeMock
}))

vi.mock('./paths', () => ({
  getResolvedGamePath: (): string | null => pathsMock.getResolvedGamePath(),
  getResolvedModsPath: (): string | null => pathsMock.getResolvedModsPath()
}))

vi.mock('./practiceIni', () => ({
  writePracticeIni: vi.fn()
}))

vi.mock('./practice', () => ({
  persistPracticeIni: vi.fn()
}))

function makeSetup(overrides: Partial<PlayerSetup> & { name: string }): Omit<PlayerSetup, 'id'> {
  return {
    bike_id: 'bike1',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern',
    ...overrides
  }
}

describe('validateSetupName', () => {
  it('accepts "Pista São João" (unicode accents allowed)', async () => {
    const { validateSetupName } = await import('./setups.js')
    expect(validateSetupName('Pista São João')).toBe(true)
  })

  it('rejects empty string', async () => {
    const { validateSetupName } = await import('./setups.js')
    expect(validateSetupName('')).toBe(false)
  })

  it('rejects only-spaces string', async () => {
    const { validateSetupName } = await import('./setups.js')
    expect(validateSetupName('   ')).toBe(false)
  })

  it('rejects name longer than 32 chars', async () => {
    const { validateSetupName } = await import('./setups.js')
    expect(validateSetupName('a'.repeat(33))).toBe(false)
    expect(validateSetupName('a'.repeat(32))).toBe(true)
  })

  it('rejects control characters including DEL (\\x7F)', async () => {
    const { validateSetupName } = await import('./setups.js')
    expect(validateSetupName('name\x00')).toBe(false)
    expect(validateSetupName('name\x1F')).toBe(false)
    expect(validateSetupName('name\x7F')).toBe(false)
    expect(validateSetupName('name\tname')).toBe(false)
    expect(validateSetupName('name\nname')).toBe(false)
  })
})

describe('setups CRUD', () => {
  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    setDot(persisted, 'practice', {
      bike: {
        bike_id: 'schwaben_m2_18',
        paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      },
      track: { track_id: 'Adriatic', track_layout: '' },
      settings: {
        weather_realistic: 0,
        weather_conditions: 0,
        temperature: 25,
        wind_direction: 0,
        wind_speed: 0,
        track_conditions: 0
      },
      dynamicsurface: { disable: 0 },
      setup_id: null
    })
    setDot(persisted, 'setups', [])
  })

  it('createSetup rejects empty name with invalid-name', async () => {
    const { createSetup } = await import('./setups.js')
    expect(createSetup(makeSetup({ name: '' }))).toEqual({ ok: false, reason: 'invalid-name' })
  })

  it('createSetup rejects duplicate name case-insensitively with name-taken', async () => {
    const { createSetup } = await import('./setups.js')
    expect(createSetup(makeSetup({ name: 'My Setup' })).ok).toBe(true)
    expect(createSetup(makeSetup({ name: 'my setup', bike_id: 'bike2' }))).toEqual({
      ok: false,
      reason: 'name-taken'
    })
  })

  it('createSetup stores the new setup with generated id', async () => {
    const { createSetup, listSetups } = await import('./setups.js')
    expect(createSetup(makeSetup({ name: 'Test Setup', bike_id: 'custom_bike' })).ok).toBe(true)
    const setups = listSetups()
    expect(setups.length).toBe(1)
    expect(setups[0].name).toBe('Test Setup')
    expect(setups[0].bike_id).toBe('custom_bike')
    expect(typeof setups[0].id).toBe('string')
  })

  it('updateSetup updates fields of existing setup', async () => {
    const { createSetup, updateSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Original', bike_paint: 'paint1' }))
    const id = listSetups()[0].id
    expect(updateSetup(id, { name: 'Updated', bike_id: 'bike2' }).ok).toBe(true)
    const updated = listSetups().find((s) => s.id === id)
    expect(updated?.name).toBe('Updated')
    expect(updated?.bike_id).toBe('bike2')
    expect(updated?.bike_paint).toBe('paint1')
  })

  it('updateSetup with unknown id returns setup-not-found', async () => {
    const { updateSetup } = await import('./setups.js')
    expect(updateSetup('does-not-exist', { name: 'X' })).toEqual({
      ok: false,
      reason: 'setup-not-found'
    })
  })

  it('updateSetup rejects empty name with invalid-name', async () => {
    const { createSetup, updateSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Original' }))
    const id = listSetups()[0].id
    expect(updateSetup(id, { name: '' })).toEqual({ ok: false, reason: 'invalid-name' })
  })

  it('updateSetup rejects duplicate name case-insensitively', async () => {
    const { createSetup, updateSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Setup A' }))
    createSetup(makeSetup({ name: 'Setup B', bike_id: 'bike2' }))
    const setups = listSetups()
    expect(updateSetup(setups[1].id, { name: 'SETUP A' })).toEqual({
      ok: false,
      reason: 'name-taken'
    })
  })

  it('deleteSetup removes existing setup', async () => {
    const { createSetup, deleteSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'To Delete' }))
    const id = listSetups()[0].id
    expect(deleteSetup(id).ok).toBe(true)
    expect(listSetups().length).toBe(0)
  })

  it('deleteSetup with unknown id returns setup-not-found', async () => {
    const { deleteSetup } = await import('./setups.js')
    expect(deleteSetup('non-existent')).toEqual({ ok: false, reason: 'setup-not-found' })
  })
})

describe('applySetup', () => {
  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    setDot(persisted, 'practice', {
      bike: {
        bike_id: 'schwaben_m2_18',
        paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      },
      track: { track_id: 'Adriatic', track_layout: '' },
      settings: {
        weather_realistic: 0,
        weather_conditions: 0,
        temperature: 25,
        wind_direction: 0,
        wind_speed: 0,
        track_conditions: 0
      },
      dynamicsurface: { disable: 0 },
      setup_id: null
    })
    setDot(persisted, 'setups', [])
  })

  it('applySetup writes all 7 fields plus setup_id with a single persistPracticeIni', async () => {
    const { createSetup, applySetup, listSetups } = await import('./setups.js')
    const { persistPracticeIni } = await import('./practice.js')
    vi.mocked(persistPracticeIni).mockClear()
    createSetup(
      makeSetup({
        name: 'Test',
        bike_id: 'applied_bike',
        bike_paint: 'applied_paint',
        rider: 'applied_rider',
        helmet: 'applied_helmet',
        helmet_paint: 'applied_helmet_paint',
        suit_paint: 'applied_suit_paint',
        riding_style: 'applied_style'
      })
    )
    const id = listSetups()[0].id
    expect(applySetup(id).ok).toBe(true)
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe('applied_bike')
    expect(getDot(persisted, 'practice.bike.paint')).toBe('applied_paint')
    expect(getDot(persisted, 'practice.bike.rider')).toBe('applied_rider')
    expect(getDot(persisted, 'practice.bike.helmet')).toBe('applied_helmet')
    expect(getDot(persisted, 'practice.bike.helmet_paint')).toBe('applied_helmet_paint')
    expect(getDot(persisted, 'practice.bike.suit_paint')).toBe('applied_suit_paint')
    expect(getDot(persisted, 'practice.bike.riding_style')).toBe('applied_style')
    expect(getDot(persisted, 'practice.setup_id')).toBe(id)
    expect(persistPracticeIni).toHaveBeenCalledTimes(1)
  })

  it('applySetup returns applied with the 7 normalized fields', async () => {
    const { createSetup, applySetup, listSetups } = await import('./setups.js')
    createSetup(
      makeSetup({
        name: 'Test',
        bike_id: 'applied_bike',
        bike_paint: 'default',
        rider: 'applied_rider',
        helmet: 'applied_helmet',
        helmet_paint: 'applied_helmet_paint',
        suit_paint: 'applied_suit_paint',
        riding_style: 'applied_style'
      })
    )
    const id = listSetups()[0].id
    expect(applySetup(id)).toEqual({
      ok: true,
      applied: {
        bike_id: 'applied_bike',
        bike_paint: '',
        rider: 'applied_rider',
        helmet: 'applied_helmet',
        helmet_paint: 'applied_helmet_paint',
        suit_paint: 'applied_suit_paint',
        riding_style: 'applied_style'
      }
    })
  })

  it('applySetup(null) returns ok without applied', async () => {
    const { applySetup } = await import('./setups.js')
    setDot(persisted, 'practice.setup_id', 'some_setup_id')
    expect(applySetup(null)).toEqual({ ok: true })
  })

  it('applySetup(null) clears setup_id, keeps practice values, and does not call persistPracticeIni', async () => {
    const { applySetup } = await import('./setups.js')
    const { persistPracticeIni } = await import('./practice.js')
    vi.mocked(persistPracticeIni).mockClear()
    setDot(persisted, 'practice.bike.bike_id', 'current_bike')
    setDot(persisted, 'practice.bike.paint', 'current_paint')
    setDot(persisted, 'practice.setup_id', 'some_setup_id')
    expect(applySetup(null).ok).toBe(true)
    expect(getDot(persisted, 'practice.setup_id')).toBeNull()
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe('current_bike')
    expect(getDot(persisted, 'practice.bike.paint')).toBe('current_paint')
    expect(persistPracticeIni).not.toHaveBeenCalled()
  })

  it('applySetup with unknown id returns setup-not-found', async () => {
    const { applySetup } = await import('./setups.js')
    expect(applySetup('non-existent')).toEqual({ ok: false, reason: 'setup-not-found' })
  })

  it('applySetup normalizes base paint value to default', async () => {
    const { createSetup, applySetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Test', bike_id: 'bike1', bike_paint: 'default' }))
    applySetup(listSetups()[0].id)
    expect(getDot(persisted, 'practice.bike.paint')).toBe('')
  })
})

describe('active setup reapply and clear in main', () => {
  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    setDot(persisted, 'practice', {
      bike: {
        bike_id: 'schwaben_m2_18',
        paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      },
      track: { track_id: 'Adriatic', track_layout: '' },
      settings: {
        weather_realistic: 0,
        weather_conditions: 0,
        temperature: 25,
        wind_direction: 0,
        wind_speed: 0,
        track_conditions: 0
      },
      dynamicsurface: { disable: 0 },
      setup_id: null
    })
    setDot(persisted, 'setups', [])
  })

  it('updateSetup of the active setup reapplies all 7 fields with a single persistPracticeIni', async () => {
    const { createSetup, applySetup, updateSetup, listSetups } = await import('./setups.js')
    const { persistPracticeIni } = await import('./practice.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1', bike_paint: 'paint1' }))
    const id = listSetups()[0].id
    applySetup(id)
    vi.mocked(persistPracticeIni).mockClear()
    expect(updateSetup(id, { bike_id: 'bike2', bike_paint: 'paint2' }).ok).toBe(true)
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe('bike2')
    expect(getDot(persisted, 'practice.bike.paint')).toBe('paint2')
    expect(getDot(persisted, 'practice.setup_id')).toBe(id)
    expect(persistPracticeIni).toHaveBeenCalledTimes(1)
  })

  it('updateSetup of the active setup returns applied with the reapplied values', async () => {
    const { createSetup, applySetup, updateSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1', bike_paint: 'paint1' }))
    const id = listSetups()[0].id
    applySetup(id)
    expect(updateSetup(id, { bike_id: 'bike2', bike_paint: 'default' })).toEqual({
      ok: true,
      applied: {
        bike_id: 'bike2',
        bike_paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      }
    })
  })

  it('updateSetup of a non-active setup returns ok without applied', async () => {
    const { createSetup, applySetup, updateSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1' }))
    createSetup(makeSetup({ name: 'Other', bike_id: 'other1' }))
    const setups = listSetups()
    applySetup(setups[0].id)
    expect(updateSetup(setups[1].id, { bike_id: 'other2' })).toEqual({ ok: true })
  })

  it('updateSetup of a non-active setup does not alter practice.*', async () => {
    const { createSetup, applySetup, updateSetup, listSetups } = await import('./setups.js')
    const { persistPracticeIni } = await import('./practice.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1' }))
    createSetup(makeSetup({ name: 'Other', bike_id: 'other1' }))
    const setups = listSetups()
    applySetup(setups[0].id)
    const before = snapshotPractice()
    vi.mocked(persistPracticeIni).mockClear()
    expect(updateSetup(setups[1].id, { bike_id: 'other2' }).ok).toBe(true)
    expect(getDot(persisted, 'practice')).toEqual(before)
    expect(persistPracticeIni).not.toHaveBeenCalled()
  })

  it('deleteSetup of the active setup clears setup_id and keeps practice values', async () => {
    const { createSetup, applySetup, deleteSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1', bike_paint: 'paint1' }))
    const id = listSetups()[0].id
    applySetup(id)
    const bikeBefore = getDot(persisted, 'practice.bike.bike_id')
    expect(deleteSetup(id).ok).toBe(true)
    expect(getDot(persisted, 'practice.setup_id')).toBeNull()
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe(bikeBefore)
  })

  it('deleteSetup of a non-active setup does not alter setup_id', async () => {
    const { createSetup, applySetup, deleteSetup, listSetups } = await import('./setups.js')
    createSetup(makeSetup({ name: 'Active', bike_id: 'bike1' }))
    createSetup(makeSetup({ name: 'Other', bike_id: 'other1' }))
    const setups = listSetups()
    applySetup(setups[0].id)
    expect(deleteSetup(setups[1].id).ok).toBe(true)
    expect(getDot(persisted, 'practice.setup_id')).toBe(setups[0].id)
  })
})

describe('setup guard (checkPracticeGuard / withSetupGuard)', () => {
  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    setDot(persisted, 'practice', {
      bike: {
        bike_id: 'schwaben_m2_18',
        paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      },
      track: { track_id: 'Adriatic', track_layout: '' },
      settings: {
        weather_realistic: 0,
        weather_conditions: 0,
        temperature: 25,
        wind_direction: 0,
        wind_speed: 0,
        track_conditions: 0
      },
      dynamicsurface: { disable: 0 },
      setup_id: null
    })
    setDot(persisted, 'setups', [])
  })

  function seedActiveSetup(): string {
    const active = {
      id: 'active_setup',
      name: 'Test',
      bike_id: 'b1',
      bike_paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    }
    setDot(persisted, 'setups', [active])
    setDot(persisted, 'practice.setup_id', 'active_setup')
    return 'active_setup'
  }

  it('checkPracticeGuard blocks when a valid setup is active', async () => {
    const { checkPracticeGuard } = await import('./setups.js')
    seedActiveSetup()
    expect(checkPracticeGuard()).toEqual({ ok: false, reason: 'setup-locked' })
  })

  it('checkPracticeGuard allows when no setup is active', async () => {
    const { checkPracticeGuard } = await import('./setups.js')
    expect(checkPracticeGuard()).toEqual({ ok: true })
  })

  it('orphan setup_id: guard does not block and clears setup_id', async () => {
    const { checkPracticeGuard } = await import('./setups.js')
    setDot(persisted, 'practice.setup_id', 'orphan_id')
    setDot(persisted, 'setups', [])
    expect(checkPracticeGuard()).toEqual({ ok: true })
    expect(getDot(persisted, 'practice.setup_id')).toBeNull()
  })

  it('withSetupGuard blocks the wrapped fn when setup is active', async () => {
    const { withSetupGuard } = await import('./setups.js')
    seedActiveSetup()
    const fn = vi.fn()
    expect(withSetupGuard(fn)('a', 'b')).toEqual({ ok: false, reason: 'setup-locked' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('withSetupGuard runs the wrapped fn and returns ok when no setup is active', async () => {
    const { withSetupGuard } = await import('./setups.js')
    const fn = vi.fn()
    expect(withSetupGuard(fn)('a', 'b')).toEqual({ ok: true })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a', 'b')
  })

  it('withSetupGuard clears orphan setup_id and then runs the wrapped fn', async () => {
    const { withSetupGuard } = await import('./setups.js')
    setDot(persisted, 'practice.setup_id', 'orphan_id')
    setDot(persisted, 'setups', [])
    const fn = vi.fn()
    expect(withSetupGuard(fn)()).toEqual({ ok: true })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getDot(persisted, 'practice.setup_id')).toBeNull()
  })

  it('getValidActiveSetup returns setup when id exists and clears orphan otherwise', async () => {
    const { getValidActiveSetup } = await import('./setups.js')
    setDot(persisted, 'setups', [
      {
        id: 'active_setup',
        name: 'Test',
        bike_id: 'b1',
        bike_paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      }
    ])
    setDot(persisted, 'practice.setup_id', 'active_setup')
    expect(getValidActiveSetup()?.id).toBe('active_setup')
    setDot(persisted, 'practice.setup_id', 'orphan_id')
    setDot(persisted, 'setups', [])
    expect(getValidActiveSetup()).toBeNull()
    expect(getDot(persisted, 'practice.setup_id')).toBeNull()
  })

  it('getSetupLock returns id only for a valid active setup', async () => {
    const { getSetupLock } = await import('./setups.js')
    expect(getSetupLock()).toBeNull()
    seedActiveSetup()
    expect(getSetupLock()).toBe('active_setup')
    setDot(persisted, 'practice.setup_id', 'orphan_id')
    setDot(persisted, 'setups', [])
    expect(getSetupLock()).toBeNull()
  })
})

describe('tolerant setups reads', () => {
  const validA = {
    id: 'tolerant-a',
    name: 'Tolerant A',
    bike_id: 'bikeA',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  }
  const validB = {
    id: 'tolerant-b',
    name: 'Tolerant B',
    bike_id: 'bikeB',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  }
  const junkName = { name: 'Tolerant A' }
  const junkFields = {
    id: 'tolerant-junk',
    name: 'Junk',
    bike_id: 123,
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  }

  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    storeMock.get.mockClear()
  })

  it('lists only valid entries and ignores the rest', async () => {
    const { listSetups, getSetup } = await import('./setups.js')
    setDot(persisted, 'setups', [validA, 'ab', 123, null, junkName, ['x'], validB])
    expect(listSetups()).toEqual([validA, validB])
    expect(getSetup('tolerant-a')).toEqual(validA)
    expect(getSetup('tolerant-junk')).toBeNull()
    expect(getSetup('missing')).toBeNull()
  })

  it('ignores invalid entries in the name check', async () => {
    const { createSetup } = await import('./setups.js')
    setDot(persisted, 'setups', [validA, junkName, junkFields])
    expect(createSetup(makeSetup({ name: 'Tolerant A' }))).toEqual({
      ok: false,
      reason: 'name-taken'
    })
    expect(createSetup(makeSetup({ name: 'Junk' }))).toEqual({ ok: true })
  })

  it('treats a non-array root as an empty list and recovers on create', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { listSetups, createSetup } = await import('./setups.js')
      setDot(persisted, 'setups', { hacked: true })
      expect(listSetups()).toEqual([])
      expect(listSetups()).toEqual([])
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'Setups store is not a list; treating it as empty.'
      )
      expect(createSetup(makeSetup({ name: 'First' }))).toEqual({ ok: true })
      expect(listSetups().map((s) => s.name)).toEqual(['First'])
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('treats an unreadable store as an empty list', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    storeMock.get.mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied')
    })
    try {
      const { listSetups } = await import('./setups.js')
      expect(listSetups()).toEqual([])
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        'Setups store is unreadable; treating it as empty.'
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('setups rewrite preservation', () => {
  const validA = {
    id: 'preserve-a',
    name: 'Preserve A',
    bike_id: 'bikeA',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  }
  const junk: unknown[] = ['ab', 123, null, { name: 'No Id' }, { id: 'bad-fields', name: 'Bad', bike_id: 123 }]

  function seedMixed(): unknown[] {
    const raw = [validA, ...junk]
    setDot(persisted, 'setups', raw)
    return raw
  }

  function rawJson(): string {
    return JSON.stringify(getDot(persisted, 'setups'))
  }

  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    storeMock.get.mockClear()
  })

  it('create preserves invalid entries byte for byte and in order', async () => {
    const { createSetup, listSetups } = await import('./setups.js')
    const before = seedMixed()
    expect(createSetup(makeSetup({ name: 'Brand New' }))).toEqual({ ok: true })
    const after = getDot(persisted, 'setups') as unknown[]
    expect(after.slice(0, before.length)).toEqual(before)
    expect((after[after.length - 1] as { name: string }).name).toBe('Brand New')
    expect(listSetups().map((s) => s.id)).toEqual([
      'preserve-a',
      (after[after.length - 1] as { id: string }).id
    ])
  })

  it('delete preserves invalid entries byte for byte and in order', async () => {
    const { deleteSetup } = await import('./setups.js')
    seedMixed()
    expect(deleteSetup('preserve-a')).toEqual({ ok: true })
    expect(rawJson()).toBe(JSON.stringify(junk))
  })

  it('update of another item preserves invalid entries byte for byte', async () => {
    const { updateSetup } = await import('./setups.js')
    seedMixed()
    expect(updateSetup('preserve-a', { bike_id: 'bikeZ' })).toEqual({ ok: true })
    const after = getDot(persisted, 'setups') as unknown[]
    expect(after.length).toBe(1 + junk.length)
    expect((after[0] as { bike_id: string }).bike_id).toBe('bikeZ')
    expect(after.slice(1)).toEqual(junk)
  })

  it('update of an invalid target returns setup-not-found without writing', async () => {
    const { updateSetup } = await import('./setups.js')
    const before = seedMixed()
    expect(updateSetup('bad-fields', { bike_id: 'bikeZ' })).toEqual({
      ok: false,
      reason: 'setup-not-found'
    })
    expect(updateSetup('missing', { bike_id: 'bikeZ' })).toEqual({
      ok: false,
      reason: 'setup-not-found'
    })
    expect(rawJson()).toBe(JSON.stringify(before))
    expect(storeMock.set).not.toHaveBeenCalled()
  })

  it('delete/apply of an invalid target return setup-not-found without writing', async () => {
    const { deleteSetup, applySetup } = await import('./setups.js')
    const before = seedMixed()
    const practiceBefore = getDot(persisted, 'practice')
    expect(deleteSetup('bad-fields')).toEqual({ ok: false, reason: 'setup-not-found' })
    expect(applySetup('bad-fields')).toEqual({ ok: false, reason: 'setup-not-found' })
    expect(rawJson()).toBe(JSON.stringify(before))
    expect(getDot(persisted, 'practice')).toEqual(practiceBefore)
    expect(storeMock.set).not.toHaveBeenCalled()
  })

  it('apply of a valid target never writes non-strings to practice', async () => {
    const { applySetup } = await import('./setups.js')
    setDot(persisted, 'setups', [validA])
    const result = applySetup('preserve-a')
    expect(result.ok).toBe(true)
    const bike = getDot(persisted, 'practice.bike') as Record<string, unknown>
    for (const value of Object.values(bike)) {
      expect(typeof value).toBe('string')
    }
  })

  it('update preserves extra keys on a valid entry', async () => {
    const { updateSetup } = await import('./setups.js')
    setDot(persisted, 'setups', [{ ...validA, extra: 'keep-me' }])
    expect(updateSetup('preserve-a', { name: 'Renamed' })).toEqual({ ok: true })
    const after = getDot(persisted, 'setups') as Array<Record<string, unknown>>
    expect(after[0]?.['extra']).toBe('keep-me')
    expect(after[0]?.['name']).toBe('Renamed')
  })
})
