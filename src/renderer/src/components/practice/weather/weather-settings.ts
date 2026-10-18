import type { StoreReadKey } from '../../../../../types/store'

export type WeatherSettings = {
  conditions: number
  trackConditions: number
  windDirection: number
  windSpeed: number
  temperature: number
}

export type WeatherField = keyof WeatherSettings

export const DEFAULT_SETTINGS: WeatherSettings = {
  conditions: 0,
  trackConditions: 0,
  windDirection: 0,
  windSpeed: 0,
  temperature: 25
}

export const STORE_KEYS: Record<WeatherField, StoreReadKey> = {
  conditions: 'practice.settings.weather_conditions',
  trackConditions: 'practice.settings.track_conditions',
  windDirection: 'practice.settings.wind_direction',
  windSpeed: 'practice.settings.wind_speed',
  temperature: 'practice.settings.temperature'
}

export const SETTING_FIELDS: WeatherField[] = [
  'conditions',
  'trackConditions',
  'windDirection',
  'windSpeed',
  'temperature'
]

export const CONDITION_OPTIONS = [
  { label: 'clear', value: 0 },
  { label: 'cloudy', value: 1 },
  { label: 'rainy', value: 2 }
]

export const WIND_DIRECTION_OPTIONS = [
  { label: 'north', value: 0 },
  { label: 'northeast', value: 1 },
  { label: 'east', value: 2 },
  { label: 'southeast', value: 3 },
  { label: 'south', value: 4 },
  { label: 'southwest', value: 5 },
  { label: 'west', value: 6 },
  { label: 'northwest', value: 7 }
]

export function trackConditionLabel(value: number): string {
  return value === 0 ? 'dry' : `wet ${value}%`
}

export function temperatureLabel(value: number): string {
  return `${value}°C`
}

export function windSpeedLabel(value: number): string {
  return value === 0 ? '0 km/h' : `${value * 4 - 1} km/h`
}

// Clear only allows dry (0), rain only 100% wet. Cloudy starts at 10%.
export function trackForConditions(conditions: number): number {
  if (conditions === 0) return 0
  if (conditions === 2) return 100
  return 10
}

export function isIdealPreset(settings: WeatherSettings): boolean {
  return (
    settings.conditions === DEFAULT_SETTINGS.conditions &&
    settings.trackConditions === DEFAULT_SETTINGS.trackConditions &&
    settings.windDirection === DEFAULT_SETTINGS.windDirection &&
    settings.windSpeed === DEFAULT_SETTINGS.windSpeed &&
    settings.temperature === DEFAULT_SETTINGS.temperature
  )
}

// Clear/rain don't allow intermediate track values; cloudy keeps the stored one.
export function normalizeSettings(settings: WeatherSettings): WeatherSettings {
  if (settings.conditions === 1) return settings
  return { ...settings, trackConditions: trackForConditions(settings.conditions) }
}
