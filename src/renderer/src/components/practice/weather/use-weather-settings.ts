import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  SETTING_FIELDS,
  STORE_KEYS,
  normalizeSettings,
  isIdealPreset,
  trackForConditions
} from './weather-settings'
import type { WeatherField, WeatherSettings } from './weather-settings'
import { ensurePracticeValidated } from '../../../lib/practice-validate'
import { readCachedString, writeCachedString } from '../../../lib/cache-utils'

async function persistPatch(patch: Partial<WeatherSettings>): Promise<void> {
  ;(Object.entries(patch) as [WeatherField, number][]).forEach(([field, value]) => {
    writeCachedString(STORE_KEYS[field], String(value))
  })
  await Promise.all(
    (Object.entries(patch) as [WeatherField, number][]).map(([field, value]) =>
      window.store.set(STORE_KEYS[field], value)
    )
  )
  await window.practice.sync()
}

function readCachedWeather(): WeatherSettings | null {
  const raw = SETTING_FIELDS.map((field) => readCachedString(STORE_KEYS[field]))
  if (!raw.some((value) => value !== null && value !== '')) return null
  const cached: WeatherSettings = { ...DEFAULT_SETTINGS }
  SETTING_FIELDS.forEach((field, index) => {
    const value = raw[index]
    if (value !== null && value !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) cached[field] = parsed
    }
  })
  return cached
}

function writeCachedWeather(settings: WeatherSettings): void {
  SETTING_FIELDS.forEach((field) => {
    writeCachedString(STORE_KEYS[field], String(settings[field]))
  })
}

function hasValidCache(cached: WeatherSettings | null, next: WeatherSettings): boolean {
  return cached !== null && SETTING_FIELDS.every((field) => cached[field] === next[field])
}

export function useWeatherSettings(): {
  settings: WeatherSettings | null
  idealLocked: boolean
  locked: boolean
  isTrackLocked: boolean
  updateSetting: (field: WeatherField, value: number) => void
  updateConditions: (value: number) => void
  toggleIdeal: (checked: boolean) => void
} {
  // Read the cache synchronously: with saved state, open directly, no empty/default flash.
  const [initialCached] = useState(() => readCachedWeather())
  const [settings, setSettings] = useState<WeatherSettings | null>(() => initialCached)
  const [idealLocked, setIdealLocked] = useState(() =>
    initialCached ? isIdealPreset(initialCached) : false
  )

  useEffect(() => {
    let cancelled = false
    ensurePracticeValidated()
      .then(() => Promise.all(SETTING_FIELDS.map((field) => window.store.get<number>(STORE_KEYS[field]))))
      .then((values) => {
        if (cancelled) return

        if (!values.some((value) => typeof value === 'number')) {
          const cached = readCachedWeather()
          if (cached) {
            setSettings((prev) => prev ?? cached)
            setIdealLocked(isIdealPreset(cached))
            return
          }
          setSettings((prev) => prev ?? { ...DEFAULT_SETTINGS })
          setIdealLocked(true)
          return
        }

        const stored: WeatherSettings = { ...DEFAULT_SETTINGS }
        SETTING_FIELDS.forEach((field, index) => {
          if (typeof values[index] === 'number') stored[field] = values[index] as number
        })
        const next = normalizeSettings(stored)

        const cached = readCachedWeather()
        if (!hasValidCache(cached, next)) {
          writeCachedWeather(next)
        }

        const nextIdeal = isIdealPreset(next)
        setSettings((prev) =>
          prev && SETTING_FIELDS.every((field) => prev[field] === next[field]) ? prev : next
        )
        setIdealLocked((prev) => (prev === nextIdeal ? prev : nextIdeal))
        if (stored.trackConditions !== next.trackConditions) {
          void persistPatch({ trackConditions: next.trackConditions })
        }
      })
      .catch((error) => {
        console.error('Failed to load weather settings:', error)
        if (cancelled) return
        const cached = readCachedWeather()
        if (cached) {
          setSettings((prev) => prev ?? cached)
          setIdealLocked(isIdealPreset(cached))
          return
        }
        setSettings((prev) => prev ?? { ...DEFAULT_SETTINGS })
        setIdealLocked(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyPatch = useCallback((patch: Partial<WeatherSettings>, lockIdeal?: boolean) => {
    setSettings((prev) => ({ ...(prev ?? DEFAULT_SETTINGS), ...patch }))
    if (lockIdeal !== undefined) setIdealLocked(lockIdeal)
    else setIdealLocked(false)
    void persistPatch(patch)
  }, [])

  const updateSetting = useCallback(
    (field: WeatherField, value: number) => applyPatch({ [field]: value } as Partial<WeatherSettings>),
    [applyPatch]
  )

  const updateConditions = useCallback(
    (value: number) => applyPatch({ conditions: value, trackConditions: trackForConditions(value) }),
    [applyPatch]
  )

  const toggleIdeal = useCallback(
    (checked: boolean) => {
      if (checked) applyPatch({ ...DEFAULT_SETTINGS }, true)
      else setIdealLocked(false)
    },
    [applyPatch]
  )

  const locked = idealLocked
  const isTrackLocked = locked || (settings?.conditions ?? 1) !== 1

  return {
    settings,
    idealLocked,
    locked,
    isTrackLocked,
    updateSetting,
    updateConditions,
    toggleIdeal
  }
}
