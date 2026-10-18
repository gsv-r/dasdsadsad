import { getResolvedModsPath } from './paths'

export interface PracticeValidationResult {
  repaired: string[]
  // True when the `mods` folder was neither detected nor validated.
  // The stored Practice state is preserved untouched in this case;
  // launch requirements are checked by `validateApp` on Go Ride.
  modsMissing: boolean
}

// Entering Practice preserves the stored Practice state untouched.
// No values are cleared, overwritten, or seeded with defaults here.
// Defaults are initialized only on a fresh install via electron-store
// (no persisted config yet). Invalid selections are reported by
// `validateApp` on Go Ride, never repaired here.
export function validateAndRepairPracticeState(): PracticeValidationResult {
  const modsAvailable = getResolvedModsPath() !== null
  return { modsMissing: !modsAvailable, repaired: [] }
}
