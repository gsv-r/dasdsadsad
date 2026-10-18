// Single source for the practice weather ranges. Both the launch gate
// (`validateApp`) and the renderer sliders import these, so the numbers
// exist in exactly one place. This module stays dependency-free on purpose:
// the renderer imports these values at runtime and must never pull the Zod
// runtime into its bundle.
export const WEATHER_RANGES = {
  weather_conditions: { min: 0, max: 2 },
  temperature: { min: 10, max: 38 },
  wind_direction: { min: 0, max: 7 },
  wind_speed: { min: 0, max: 11 },
  track_conditions: { min: 0, max: 100 }
} as const
