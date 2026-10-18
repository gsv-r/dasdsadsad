import { describe, expect, it, vi } from 'vitest'

type DotStore = Record<string, unknown>

const persisted: DotStore = {}

const storeMock = {
  store: persisted,
  get: vi.fn((key: string) => {
    const parts = key.split('.')
    let node: unknown = persisted
    for (const part of parts) {
      if (typeof node !== 'object' || node === null) return undefined
      node = (node as DotStore)[part]
    }
    return node
  }),
  set: vi.fn((key: string, value: unknown) => {
    const parts = key.split('.')
    let node: DotStore = persisted
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i] as string
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {}
      node = node[part] as DotStore
    }
    node[parts[parts.length - 1] as string] = value
  })
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

vi.mock('electron', () => ({
  app: { getPath: vi.fn((): string => '/tmp'), getVersion: vi.fn(() => '0.0.0-test') },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  default: { app: {}, ipcMain: {} }
}))

// Characterization oracle: the exact rule checkPracticeSettings used before
// the schema migration (isIntInRange + ranges). Any divergence between this
// oracle and the schema is a behavior change and must fail here.
function oldIsIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function oldWouldFlag(settings: Record<string, unknown>): boolean {
  return !(
    oldIsIntInRange(settings['weather_conditions'], 0, 2) &&
    oldIsIntInRange(settings['temperature'], 10, 38) &&
    oldIsIntInRange(settings['wind_direction'], 0, 7) &&
    oldIsIntInRange(settings['wind_speed'], 0, 11) &&
    oldIsIntInRange(settings['track_conditions'], 0, 100)
  )
}

const WEATHER_ISSUE = {
  code: 'PRACTICE_SETTINGS_INVALID',
  title: 'Practice settings invalid',
  message:
    'Practice weather settings are out of range. Check Conditions (clear/cloudy/rainy), Temperature (10-38°C), Wind direction, Wind speed and Track conditions in Practice.'
}

const VALID_SETTINGS = {
  weather_realistic: 0,
  weather_conditions: 1,
  temperature: 25,
  wind_direction: 0,
  wind_speed: 0,
  track_conditions: 50
}

function setPractice(settings: unknown, bikeId = 'bikeA', trackId = 'trackA'): void {
  for (const key of Object.keys(persisted)) delete persisted[key]
  persisted['practice'] = {
    bike: {
      bike_id: bikeId,
      paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    },
    track: { track_id: trackId, track_layout: '' },
    settings,
    dynamicsurface: { disable: 0 },
    setup_id: null
  }
  persisted['profile'] = { nationality: 'br' }
}

describe('practice weather launch gate characterization', () => {
  it('matches the old rule on a schema equivalence matrix', async () => {
    const { weatherSettingsSchema } = await import('../../types/weather.js')
    const fields = {
      weather_conditions: [0, 2],
      temperature: [10, 38],
      wind_direction: [0, 7],
      wind_speed: [0, 11],
      track_conditions: [0, 100]
    } as const
    const probes: unknown[] = [0, 1, 2, 7, 10, 11, 25, 38, 100, -1, 101, 1.5, '1', null]
    for (const field of Object.keys(fields)) {
      for (const value of probes) {
        const candidate = { ...VALID_SETTINGS, [field]: value }
        expect(weatherSettingsSchema.safeParse(candidate).success).toBe(
          oldWouldFlag(candidate) === false
        )
      }
    }
    expect(weatherSettingsSchema.safeParse(VALID_SETTINGS).success).toBe(true)
    expect(
      weatherSettingsSchema.safeParse({ ...VALID_SETTINGS, weather_realistic: 0 }).success
    ).toBe(true)
    const { temperature: _dropped, ...rest } = VALID_SETTINGS
    expect(weatherSettingsSchema.safeParse(rest).success).toBe(false)
  })

  it('keeps the schema fields in sync with the store write schemas', async () => {
    const { weatherSettingsSchema } = await import('../../types/weather.js')
    const { STORE_WRITE_SCHEMAS } = await import('../../types/store.js')
    const schemaFields = Object.keys(weatherSettingsSchema.shape).sort()
    expect(schemaFields).toEqual([
      'temperature',
      'track_conditions',
      'weather_conditions',
      'wind_direction',
      'wind_speed'
    ])
    for (const field of schemaFields) {
      const storeKey = `practice.settings.${field}` as keyof typeof STORE_WRITE_SCHEMAS
      expect(STORE_WRITE_SCHEMAS[storeKey]).toBeDefined()
    }
  })

  it.each([
    ['weather_conditions', 0, 2],
    ['temperature', 10, 38],
    ['wind_direction', 0, 7],
    ['wind_speed', 0, 11],
    ['track_conditions', 0, 100]
  ] as const)(
    'matches the old rule for %s (min, max, min-1, max+1, non-integer, wrong type)',
    async (field, min, max) => {
      const { validateApp } = await import('./validate.js')
      for (const value of [min, max, min - 1, max + 1, min + 0.5, 'x']) {
        setPractice({ ...VALID_SETTINGS, [field]: value })
        const result = validateApp()
        const weatherIssues = result.issues.filter(
          (issue) => issue.code === 'PRACTICE_SETTINGS_INVALID'
        )
        const flagged = oldWouldFlag({ ...VALID_SETTINGS, [field]: value })
        expect(weatherIssues.length).toBeLessThanOrEqual(1)
        expect(weatherIssues.length).toBe(flagged ? 1 : 0)
        if (flagged) expect(weatherIssues[0]).toEqual(WEATHER_ISSUE)
      }
    }
  )

  it('keeps the exact issue payload, count and order with everything else broken', async () => {
    const { validateApp } = await import('./validate.js')
    setPractice({ ...VALID_SETTINGS, temperature: 99 }, '', '')
    const flagged = validateApp()
    expect(flagged.issues).toEqual([
      {
        code: 'STEAM_PATH_MISSING',
        title: 'Steam not found',
        message: 'Steam executable was not found. Check Steam Path in Settings.'
      },
      {
        code: 'GAME_PATH_MISSING',
        title: 'Game folder not found',
        message: 'Game folder was not found. Check Game Path in Settings.'
      },
      {
        code: 'MODS_PATH_MISSING',
        title: 'Mods folder not found',
        message: 'Mods folder was not found. Check Mods Path in Settings.'
      },
      {
        code: 'PRACTICE_BIKE_MISSING',
        title: 'Bike not configured',
        message: 'No bike is selected. Select a bike before launching the game.'
      },
      {
        code: 'PRACTICE_TRACK_MISSING',
        title: 'Track not configured',
        message: 'No track is selected. Select a track before launching the game.'
      },
      WEATHER_ISSUE,
      {
        code: 'PROFILE_PATH_MISSING',
        title: 'Profile folder not found',
        message: 'Profile folder was not found. Check Profile Path in Settings.'
      },
      {
        code: 'PROFILE_NOT_FOUND',
        title: 'Profile not found',
        message: 'No profile is available. Check Profile Path in Settings.'
      }
    ])

    setPractice({ ...VALID_SETTINGS }, '', '')
    const clean = validateApp()
    expect(clean.issues.filter((issue) => issue.code === 'PRACTICE_SETTINGS_INVALID')).toEqual([])
    expect(clean.issues.map((issue) => issue.code)).toEqual(
      flagged.issues
        .map((issue) => issue.code)
        .filter((code) => code !== 'PRACTICE_SETTINGS_INVALID')
    )
  })
})
