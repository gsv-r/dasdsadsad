// Shared contracts for the electron-store IPC bridge (`store:get`/`store:set`).
// Schemas here only encode existing behavior: every value the current
// renderer callers send must keep passing. Anything else is rejected without
// throwing, so the main process never prints a handler error for an expected
// rejection.
import * as z from 'zod'
import { weatherSettingsSchema } from './weather'

// Exact read allowlist for `store:get` (see the PR 1a caller audit). Adding
// or removing a key must update the locked list test below.
export const STORE_READ_KEYS = [
  'paths.steam',
  'paths.game',
  'paths.mods',
  'paths.profile',
  'pathsAuto.steam',
  'pathsAuto.game',
  'pathsAuto.mods',
  'pathsAuto.profile',
  'profile.nationality',
  'practice.settings.weather_conditions',
  'practice.settings.temperature',
  'practice.settings.wind_direction',
  'practice.settings.wind_speed',
  'practice.settings.track_conditions',
  'practice.bike.helmet',
  'practice.bike.rider',
  'practice.bike.bike_id',
  'practice.track.track_id',
  'practice.bike',
  'practice.setup_id',
  'practice.bike.paint',
  'practice.track.track_layout',
  'practice.bike.helmet_paint',
  'practice.bike.suit_paint',
  'practice.bike.riding_style'
] as const

export type StoreReadKey = (typeof STORE_READ_KEYS)[number]

export function isStoreReadKey(key: unknown): key is StoreReadKey {
  return typeof key === 'string' && (STORE_READ_KEYS as readonly string[]).includes(key)
}

// Keys the renderer may write through `store:set`. Everything else
// (bulk `paths`/`pathsAuto`, `modsCache`, `setups`, …) is rejected with
// `unknown-key`; only the main process writes those directly.
export const STORE_WRITE_KEYS = [
  'paths.steam',
  'paths.game',
  'paths.mods',
  'paths.profile',
  'pathsAuto.steam',
  'pathsAuto.game',
  'pathsAuto.mods',
  'pathsAuto.profile',
  'profile.nationality',
  'practice.settings.weather_conditions',
  'practice.settings.temperature',
  'practice.settings.wind_direction',
  'practice.settings.wind_speed',
  'practice.settings.track_conditions'
] as const

export type StoreWriteKey = (typeof STORE_WRITE_KEYS)[number]

export function isStoreWriteKey(key: unknown): key is StoreWriteKey {
  return typeof key === 'string' && (STORE_WRITE_KEYS as readonly string[]).includes(key)
}

// Per-key value shapes. Paths and nationality accept what the callers send
// today (`string | null`, already trimmed by the renderer). Weather accepts
// only integers inside the launch gate ranges: every real caller (sliders
// clamped to WEATHER_RANGES, fixed selects, DEFAULT_SETTINGS/toggleIdeal)
// already sends values inside them, so a rejection means a faulty caller.
const nullableStringSchema = z.string().nullable()

export const STORE_WRITE_SCHEMAS: Record<StoreWriteKey, z.ZodType<unknown>> = {
  'paths.steam': nullableStringSchema,
  'paths.game': nullableStringSchema,
  'paths.mods': nullableStringSchema,
  'paths.profile': nullableStringSchema,
  'pathsAuto.steam': nullableStringSchema,
  'pathsAuto.game': nullableStringSchema,
  'pathsAuto.mods': nullableStringSchema,
  'pathsAuto.profile': nullableStringSchema,
  'profile.nationality': nullableStringSchema,
  'practice.settings.weather_conditions': weatherSettingsSchema.shape.weather_conditions,
  'practice.settings.temperature': weatherSettingsSchema.shape.temperature,
  'practice.settings.wind_direction': weatherSettingsSchema.shape.wind_direction,
  'practice.settings.wind_speed': weatherSettingsSchema.shape.wind_speed,
  'practice.settings.track_conditions': weatherSettingsSchema.shape.track_conditions
}

// Result of persisting a value through the store:set IPC channel. A manual
// mods path persists only when valid; a manual profile path persists only
// when valid; anything else is rejected without throwing, so the main
// process never prints a handler error for an expected rejection.
export type StoreSetResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-mods-folder' }
  | { ok: false; reason: 'invalid-profile-folder' }
  | { ok: false; reason: 'unknown-key' }
  | { ok: false; reason: 'invalid-value' }
