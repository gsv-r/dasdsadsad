// Practice validation shared by the screen hooks.
// Every time Practice opens, main checks the mods folder. The stored Practice
// state is always preserved untouched; defaults are seeded only on a fresh
// install via electron-store. Hooks await this validation before reading the
// store. Invalid selections are reported by Go Ride validation (`validateApp`).
// The result reports `modsMissing` when the mods folder is missing.

export interface PracticeValidationResult {
  repaired: string[]
  modsMissing: boolean
}

let pendingValidation: Promise<PracticeValidationResult | null> | null = null

export function ensurePracticeValidated(): Promise<PracticeValidationResult | null> {
  if (pendingValidation) return pendingValidation
  const run = async (): Promise<PracticeValidationResult | null> => {
    try {
      return await window.practice.validate()
    } catch (error) {
      console.error('Failed to validate practice configuration:', error)
      return null
    }
  }
  pendingValidation = run().finally(() => {
    // Release on the next task so hooks mounted together share the same
    // validation, while the next Practice entry validates again.
    setTimeout(() => {
      pendingValidation = null
    }, 0)
  })
  return pendingValidation
}
