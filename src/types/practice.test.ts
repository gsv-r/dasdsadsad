import { describe, expect, it } from 'vitest'
import { WEATHER_RANGES } from './practice.js'

describe('WEATHER_RANGES', () => {
  it('keeps the exact launch gate ranges', () => {
    expect(WEATHER_RANGES).toEqual({
      weather_conditions: { min: 0, max: 2 },
      temperature: { min: 10, max: 38 },
      wind_direction: { min: 0, max: 7 },
      wind_speed: { min: 0, max: 11 },
      track_conditions: { min: 0, max: 100 }
    })
  })
})
