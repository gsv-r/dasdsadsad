import * as z from 'zod'
import { WEATHER_RANGES } from './practice'

function weatherFieldSchema(range: { min: number; max: number }): z.ZodNumber {
  return z.number().int().min(range.min).max(range.max)
}

// Single definition of the weather value shapes. Both the launch gate
// (`validateApp`) and the `store:set` per-key schemas derive from this
// object, so the ranges exist in exactly one place (`WEATHER_RANGES`) and
// the shapes in exactly one object. The renderer never imports this module
// at runtime, so the Zod runtime stays out of its bundle.
export const weatherSettingsSchema = z.object({
  weather_conditions: weatherFieldSchema(WEATHER_RANGES.weather_conditions),
  temperature: weatherFieldSchema(WEATHER_RANGES.temperature),
  wind_direction: weatherFieldSchema(WEATHER_RANGES.wind_direction),
  wind_speed: weatherFieldSchema(WEATHER_RANGES.wind_speed),
  track_conditions: weatherFieldSchema(WEATHER_RANGES.track_conditions)
})
