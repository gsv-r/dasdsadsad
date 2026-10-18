import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const DEFAULT_BIKE = {
  bike_id: 'schwaben_m2_18',
  paint: '',
  rider: 'modern',
  helmet: 'default',
  helmet_paint: '',
  suit_paint: '',
  riding_style: 'modern'
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
  modsAvailable: true,
  getResolvedGamePath: vi.fn((): string | null => '/game'),
  getResolvedModsPath: vi.fn((): string | null => '/mods')
}

vi.mock('../store', () => ({
  DEFAULT_PRACTICE_STATE: {
    bike: { ...DEFAULT_BIKE },
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

function seedUserConfig(): void {
  setDot(persisted, 'practice', {
    bike: {
      bike_id: 'user_bike_01',
      paint: 'user_paint_01',
      rider: 'user_suit_01',
      helmet: 'user_helmet_01',
      helmet_paint: 'user_helmet_paint_01',
      suit_paint: 'user_suit_paint_01',
      riding_style: 'user_style_01'
    },
    track: { track_id: 'user_track_01', track_layout: 'user_layout_01' },
    settings: {
      weather_realistic: 0,
      weather_conditions: 1,
      temperature: 30,
      wind_direction: 2,
      wind_speed: 3,
      track_conditions: 1
    },
    dynamicsurface: { disable: 0 },
    setup_id: null
  })
}

describe('practice persistence (bike, track, rider, riding style)', () => {
  beforeEach(() => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    storeMock.set.mockClear()
    pathsMock.modsAvailable = true
    pathsMock.getResolvedModsPath.mockImplementation(() =>
      pathsMock.modsAvailable ? '/mods' : null
    )
    seedUserConfig()
    // Seeding is setup; only track mutations under test.
    storeMock.set.mockClear()
  })

  it('keeps bike and track selections when the mods folder is missing', async () => {
    pathsMock.modsAvailable = false
    const { validateAndRepairPracticeState } = await import('./practiceValidate.js')

    const before = clone(persisted)
    const result = validateAndRepairPracticeState()

    expect(result.modsMissing).toBe(true)
    expect(result.repaired).toEqual([])
    expect(persisted).toEqual(before)
    expect(storeMock.set).not.toHaveBeenCalled()
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe('user_bike_01')
    expect(getDot(persisted, 'practice.track.track_id')).toBe('user_track_01')
  })

  it('keeps rider gear and riding style after a restart with the mods folder missing', async () => {
    pathsMock.modsAvailable = false
    const { validateAndRepairPracticeState } = await import('./practiceValidate.js')

    // Simulate restart: validation runs on Practice entry before reading.
    const before = clone(persisted)
    validateAndRepairPracticeState()

    // Simulate restart reads after validation.
    expect(getDot(persisted, 'practice.bike.rider')).toBe('user_suit_01')
    expect(getDot(persisted, 'practice.bike.helmet')).toBe('user_helmet_01')
    expect(getDot(persisted, 'practice.bike.helmet_paint')).toBe('user_helmet_paint_01')
    expect(getDot(persisted, 'practice.bike.suit_paint')).toBe('user_suit_paint_01')
    expect(getDot(persisted, 'practice.bike.riding_style')).toBe('user_style_01')
    expect(persisted).toEqual(before)
  })

  it('persists a newly selected riding style without touching bike or track', async () => {
    const { selectRidingStyle } = await import('./practice.js')

    selectRidingStyle('user_style_02')

    expect(getDot(persisted, 'practice.bike.riding_style')).toBe('user_style_02')
    expect(getDot(persisted, 'practice.bike.bike_id')).toBe('user_bike_01')
    expect(getDot(persisted, 'practice.track.track_id')).toBe('user_track_01')
    expect(getDot(persisted, 'practice.bike.rider')).toBe('user_suit_01')
    expect(getDot(persisted, 'practice.bike.helmet')).toBe('user_helmet_01')
  })

  it('normalizes base riding style selections to the stock default', async () => {
    const { selectRidingStyle } = await import('./practice.js')

    selectRidingStyle('default')
    expect(getDot(persisted, 'practice.bike.riding_style')).toBe('modern')

    selectRidingStyle('')
    expect(getDot(persisted, 'practice.bike.riding_style')).toBe('modern')
  })

  it('never repairs rider gear to defaults when the mods folder is available', async () => {
    pathsMock.modsAvailable = true
    const { validateAndRepairPracticeState } = await import('./practiceValidate.js')

    const before = clone(persisted)
    const result = validateAndRepairPracticeState()

    expect(result).toEqual({ modsMissing: false, repaired: [] })
    expect(persisted).toEqual(before)
    expect(storeMock.set).not.toHaveBeenCalled()
  })

  it('preserves setup_id and the 7 setup fields with an active setup', async () => {
    const { validateAndRepairPracticeState } = await import('./practiceValidate.js')
    setDot(persisted, 'practice.setup_id', 'active-setup-id')

    for (const modsAvailable of [true, false]) {
      pathsMock.modsAvailable = modsAvailable
      const before = clone(persisted)
      validateAndRepairPracticeState()
      expect(getDot(persisted, 'practice.setup_id')).toBe('active-setup-id')
      expect(getDot(persisted, 'practice.bike.bike_id')).toBe('user_bike_01')
      expect(getDot(persisted, 'practice.bike.paint')).toBe('user_paint_01')
      expect(getDot(persisted, 'practice.bike.rider')).toBe('user_suit_01')
      expect(getDot(persisted, 'practice.bike.helmet')).toBe('user_helmet_01')
      expect(getDot(persisted, 'practice.bike.helmet_paint')).toBe('user_helmet_paint_01')
      expect(getDot(persisted, 'practice.bike.suit_paint')).toBe('user_suit_paint_01')
      expect(getDot(persisted, 'practice.bike.riding_style')).toBe('user_style_01')
      expect(persisted).toEqual(before)
    }
    expect(storeMock.set).not.toHaveBeenCalled()
  })
})
