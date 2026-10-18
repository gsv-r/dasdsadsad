// Player setups persisted in electron-store. Each setup stores a complete
// rider configuration that can be applied to Practice in one action.
import * as z from 'zod'

export interface PlayerSetup {
  /** Unique identifier generated on creation. */
  id: string
  /** Display name, 1-32 chars, unique case-insensitive. */
  name: string
  /** Bike id (folder name under mods/bikes). */
  bike_id: string
  /** Bike paint name (folder under bike/paints). */
  bike_paint: string
  /** Rider suit id (folder under mods/rider/riders). */
  rider: string
  /** Helmet id (folder under mods/rider/helmets). */
  helmet: string
  /** Helmet paint name (folder under helmet/paints). */
  helmet_paint: string
  /** Suit paint name (folder under rider/paints). */
  suit_paint: string
  /** Riding style id (folder under mods/rider/animations). */
  riding_style: string
}

// Result of creating/updating a setup through the setups:create|update IPC channels.
// Rejections return instead of throwing, so an expected validation failure
// never prints a handler error.
// When an update targets the active setup, the main process reapplies it and
// `applied` carries the exact 7 practice values written (already normalized),
// so the renderer can refresh its caches synchronously.
export type SetupSaveResult =
  | { ok: true; applied?: AppliedSetupValues }
  | {
      ok: false
      reason: 'invalid-name' | 'name-taken' | 'write-failed' | 'setup-not-found'
    }

// Result of deleting a setup through the setups:delete IPC channel.
export type SetupDeleteResult =
  | { ok: true }
  | {
      ok: false
      reason: 'setup-not-found' | 'write-failed'
    }

// Result of applying a setup through the setups:select IPC channel.
// On success, `applied` carries the exact 7 practice values written to the
// store (already normalized), so the renderer can update its caches
// synchronously without a second store round-trip.
export interface AppliedSetupValues {
  bike_id: string
  bike_paint: string
  rider: string
  helmet: string
  helmet_paint: string
  suit_paint: string
  riding_style: string
}

export type SetupSelectResult =
  | { ok: true; applied?: AppliedSetupValues }
  | {
      ok: false
      reason: 'setup-not-found' | 'write-failed'
    }

// Single guard result for the 7 setup-guarded practice handlers. Returns
// setup-locked when a valid setup is active, otherwise runs the handler.
export type PracticeGuardResult = { ok: true } | { ok: false; reason: 'setup-locked' }

// Setup display names: 1-32 chars after trimming, no control characters.
// Trimming stays at the call sites (create/update trim before validating,
// the form trims before submitting), so the schema never transforms.
export const setupNameSchema = z.string().min(1).max(32).regex(/^[^\p{Cc}]+$/u)

// Shape of one setup creation payload. Field presence and types match what
// the create handler accepted before; semantic checks (name rule,
// uniqueness) stay in createSetup with their typed reasons.
export const setupCreateArgsSchema = z.object({
  name: z.string(),
  bike_id: z.string(),
  bike_paint: z.string(),
  rider: z.string(),
  helmet: z.string(),
  helmet_paint: z.string(),
  suit_paint: z.string(),
  riding_style: z.string()
})
