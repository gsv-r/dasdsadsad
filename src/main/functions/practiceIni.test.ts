import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

const persisted: DotStore = {}

const storeMock = {
  store: persisted,
  get: vi.fn((key: string) => getDot(persisted, key)),
  set: vi.fn((key: string, value: unknown) => {
    setDot(persisted, key, value)
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

async function freshPracticeIni(): Promise<typeof import('./practiceIni.js')> {
  vi.resetModules()
  return import('./practiceIni.js')
}

async function freshValidate(): Promise<typeof import('./validate.js')> {
  vi.resetModules()
  return import('./validate.js')
}

const gameDirs: string[] = []

function freshGameDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-practiceini-'))
  gameDirs.push(dir)
  return dir
}

function seedPractice(settings: unknown): void {
  for (const key of Object.keys(persisted)) delete persisted[key]
  setDot(persisted, 'practice', {
    bike: {
      bike_id: 'user_bike_01',
      paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    },
    track: { track_id: 'user_track_01', track_layout: '' },
    settings,
    dynamicsurface: { disable: 0 },
    setup_id: null
  })
}

function readIni(gameDir: string): string {
  return fs.readFileSync(path.join(gameDir, 'practice.ini'), 'utf-8')
}

beforeEach(() => {
  for (const key of Object.keys(persisted)) delete persisted[key]
  storeMock.get.mockClear()
  storeMock.set.mockClear()
})

afterAll(() => {
  for (const dir of gameDirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('practice.ini with mistyped settings', () => {
  it.each(['ab', 123])('falls back to defaults without garbage lines for settings %s', async (settings) => {
    seedPractice(settings)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      const ini = readIni(gameDir)
      expect(ini).not.toMatch(/^\d+ = /m)
      expect(ini).toContain('temperature = 25')
      expect(ini).toContain('weather_conditions = 0')
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('practice.settings')
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('falls back to defaults silently for null settings', async () => {
    seedPractice(null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      expect(readIni(gameDir)).toContain('temperature = 25')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('falls back to defaults silently for absent settings', async () => {
    for (const key of Object.keys(persisted)) delete persisted[key]
    setDot(persisted, 'practice', {
      bike: {
        bike_id: 'user_bike_01',
        paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      },
      track: { track_id: 'user_track_01', track_layout: '' },
      dynamicsurface: { disable: 0 },
      setup_id: null
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      expect(readIni(gameDir)).toContain('temperature = 25')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('accepts the default sections without logging', async () => {
    seedPractice({
      weather_realistic: 0,
      weather_conditions: 0,
      temperature: 25,
      wind_direction: 0,
      wind_speed: 0,
      track_conditions: 0
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      expect(readIni(gameDir)).toContain('temperature = 25')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('writes settings without weather_realistic verbatim and backfills it', async () => {
    seedPractice({
      weather_conditions: 1,
      temperature: 30,
      wind_direction: 2,
      wind_speed: 3,
      track_conditions: 40
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      const ini = readIni(gameDir)
      expect(ini).toContain('temperature = 30')
      expect(ini).toContain('weather_conditions = 1')
      expect(ini).toContain('weather_realistic = 0')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it.each(['ab', 123])(
    'rejects an invalid dynamicsurface with defaults and the exact key',
    async (dynamicsurface) => {
      seedPractice({
        weather_realistic: 0,
        weather_conditions: 1,
        temperature: 30,
        wind_direction: 0,
        wind_speed: 0,
        track_conditions: 0
      })
      setDot(persisted, 'practice.dynamicsurface', dynamicsurface)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { writePracticeIni } = await freshPracticeIni()
      try {
        const gameDir = freshGameDir()
        writePracticeIni(gameDir)
        expect(readIni(gameDir)).toContain('disable = 0')
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalledWith(
          'Invalid store value for "practice.dynamicsurface". Using defaults.'
        )
      } finally {
        errorSpy.mockRestore()
      }
    }
  )

  it('reverts the whole settings block when a single leaf has the wrong type', async () => {
    seedPractice({
      weather_realistic: 0,
      weather_conditions: 1,
      temperature: 'hot',
      wind_direction: 0,
      wind_speed: 0,
      track_conditions: 0
    })
    const { writePracticeIni } = await freshPracticeIni()
    const gameDir = freshGameDir()
    writePracticeIni(gameDir)
    const ini = readIni(gameDir)
    expect(ini).toContain('temperature = 25')
    expect(ini).toContain('weather_conditions = 0')
    expect(ini).not.toContain('temperature = hot')
  })

  it('writes valid settings verbatim without logging', async () => {
    seedPractice({
      weather_realistic: 0,
      weather_conditions: 2,
      temperature: 30,
      wind_direction: 3,
      wind_speed: 4,
      track_conditions: 100
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      const gameDir = freshGameDir()
      writePracticeIni(gameDir)
      const ini = readIni(gameDir)
      expect(ini).toContain('temperature = 30')
      expect(ini).toContain('track_conditions = 100')
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs an invalid leaf only once per process', async () => {
    seedPractice('ab')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { writePracticeIni } = await freshPracticeIni()
    try {
      writePracticeIni(freshGameDir())
      writePracticeIni(freshGameDir())
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('falls back per leaf for a mistyped bike section', async () => {
    seedPractice({
      weather_realistic: 0,
      weather_conditions: 1,
      temperature: 30,
      wind_direction: 0,
      wind_speed: 0,
      track_conditions: 0
    })
    setDot(persisted, 'practice.bike', 'not-an-object')
    const { writePracticeIni } = await freshPracticeIni()
    const gameDir = freshGameDir()
    writePracticeIni(gameDir)
    const ini = readIni(gameDir)
    expect(ini).toContain('bike_id = schwaben_m2_18')
    expect(ini).toContain('temperature = 30')
  })
})

describe('launch gate stays authoritative on mistyped settings', () => {
  it.each(['ab', 123])('still emits PRACTICE_SETTINGS_INVALID for settings %s', async (settings) => {
    seedPractice(settings)
    const { validateApp } = await freshValidate()
    const issues = validateApp().issues.filter(
      (issue) => issue.code === 'PRACTICE_SETTINGS_INVALID'
    )
    expect(issues).toEqual([
      {
        code: 'PRACTICE_SETTINGS_INVALID',
        title: 'Practice settings invalid',
        message:
          'Practice weather settings are out of range. Check Conditions (clear/cloudy/rainy), Temperature (10-38°C), Wind direction, Wind speed and Track conditions in Practice.'
      }
    ])
  })

  it('emits no weather issue for null settings, like the untouched guard always did', async () => {
    seedPractice(null)
    const { validateApp } = await freshValidate()
    expect(
      validateApp().issues.filter((issue) => issue.code === 'PRACTICE_SETTINGS_INVALID')
    ).toEqual([])
  })
})
