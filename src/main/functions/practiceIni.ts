import fs from 'fs'
import path from 'path'
import * as z from 'zod'
import { DEFAULT_PRACTICE_STATE, store, type PracticeBikeState } from '../store'
import { BASE_SELECTION_VALUES } from '../constants'
import { BIKES_SUBDIR, TRACKS_SUBDIR, RIDERS_SUBDIR, HELMETS_SUBDIR, STYLES_SUBDIR, isModDir, isModFile, paintFileName } from './mods'

const PRACTICE_INI_FILENAME = 'practice.ini'

// Shape-only schemas for the sections spread verbatim into the file. A
// setting with the wrong type (e.g. a string where a number belongs) would
// otherwise be written as garbage lines. Ranges stay with the launch gate,
// which remains the authority on invalid values.
const settingsSchema = z.looseObject({
  // Optional: valid stores predate the key, and the writer below always
  // backfills it, so an absent key behaves exactly like before.
  weather_realistic: z.number().optional(),
  weather_conditions: z.number(),
  temperature: z.number(),
  wind_direction: z.number(),
  wind_speed: z.number(),
  track_conditions: z.number()
})
const dynamicsurfaceSchema = z.looseObject({ disable: z.number() })

// Leaves already reported in this process. The launch gate stays the
// authority on invalid values; practice.ini just never persists garbage.
const reportedLeaves = new Set<string>()

function readLeaf<T>(section: unknown, field: string, schema: z.ZodType<T>, fallback: T): T {
  const key = `practice.${field}`
  const raw =
    typeof section === 'object' && section !== null
      ? (section as Record<string, unknown>)[field]
      : undefined
  // Absent behaves like the old `??` fallback: silent, no log.
  if (raw === undefined || raw === null) return fallback
  const parsed = schema.safeParse(raw)
  if (parsed.success) return raw as T
  if (!reportedLeaves.has(key)) {
    reportedLeaves.add(key)
    const at = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .find((part) => part !== '')
    console.error(
      at === undefined
        ? `Invalid store value for "${key}". Using defaults.`
        : `Invalid store value for "${key}" at "${at}". Using defaults.`
    )
  }
  return fallback
}

function formatSection(title: string, entries: Record<string, string | number>): string {
  const lines = Object.entries(entries).map(([key, value]) => `${key} = ${value}`)
  return `[${title}]\n${lines.join('\n')}`
}

// A configured id is only valid when its folder exists. Anything else
// falls back to the default so the generated INI is always valid.
function resolveModId(subdir: string, id: string, fallback: string): string {
  if (!id || id === fallback || BASE_SELECTION_VALUES.has(id)) return fallback
  return isModDir(subdir, id) ? id : fallback
}

function resolvePaint(subdir: string, modId: string, paint: string, fallback: string): string {
  if (!paint) return fallback
  return isModFile(subdir, modId, 'paints', paintFileName(paint)) ? paint : fallback
}

function resolveBikeForIni(bike: PracticeBikeState): PracticeBikeState {
  const defaults = DEFAULT_PRACTICE_STATE.bike
  const bikeId = resolveModId(BIKES_SUBDIR, bike.bike_id, defaults.bike_id)
  const rider = resolveModId(RIDERS_SUBDIR, bike.rider, defaults.rider)
  const helmet = resolveModId(HELMETS_SUBDIR, bike.helmet, defaults.helmet)
  const ridingStyle = resolveModId(STYLES_SUBDIR, bike.riding_style, defaults.riding_style)

  return {
    bike_id: bikeId,
    paint: resolvePaint(BIKES_SUBDIR, bikeId, bike.paint, defaults.paint),
    rider,
    helmet,
    helmet_paint: resolvePaint(HELMETS_SUBDIR, helmet, bike.helmet_paint, defaults.helmet_paint),
    suit_paint: resolvePaint(RIDERS_SUBDIR, rider, bike.suit_paint, defaults.suit_paint),
    riding_style: ridingStyle
  }
}

function buildPracticeIni(): string {
  const practice = store.store.practice ?? DEFAULT_PRACTICE_STATE
  const bike = practice.bike ?? DEFAULT_PRACTICE_STATE.bike
  const track = practice.track ?? DEFAULT_PRACTICE_STATE.track
  const settings = readLeaf(
    practice,
    'settings',
    settingsSchema,
    DEFAULT_PRACTICE_STATE.settings
  )
  const dynamicsurface = readLeaf(
    practice,
    'dynamicsurface',
    dynamicsurfaceSchema,
    DEFAULT_PRACTICE_STATE.dynamicsurface
  )

  const trackId = resolveModId(TRACKS_SUBDIR, track?.track_id, DEFAULT_PRACTICE_STATE.track.track_id)
  const trackLayout =
    track?.track_layout && isModDir(TRACKS_SUBDIR, trackId, track.track_layout)
      ? track.track_layout
      : DEFAULT_PRACTICE_STATE.track.track_layout

  return [
    formatSection('bike', { ...resolveBikeForIni(bike) }),
    formatSection('track', { track_id: trackId, track_layout: trackLayout }),
    // weather_realistic is always off (option removed from the UI).
    formatSection('settings', { ...settings, weather_realistic: 0 }),
    formatSection('dynamicsurface', { ...dynamicsurface })
  ].join('\n\n')
}

export function writePracticeIni(gamePath: string): void {
  // Always overwrite the whole file so stale mod names never survive.
  fs.writeFileSync(path.join(gamePath, PRACTICE_INI_FILENAME), `${buildPracticeIni()}\n`, 'utf-8')
}
