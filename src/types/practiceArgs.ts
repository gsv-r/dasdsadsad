import * as z from 'zod'

// Argument shapes for the `practice:*` IPC handlers. Every value the real
// callers send (disk folder names, `''` for reset-to-default, `default` and
// `modern` sentinels, paint/layout arrays) must keep passing: folder names
// can never contain path separators, Windows-reserved symbols or control
// characters, so rejecting those in practice never rejects a real mod. Existence
// stays with the launch gate, which reports the exact missing mod.
const modId = z.string().regex(/^[^/\\<>:"|?*\p{Cc}]*$/u)

// Paint and layout lists tolerate a missing value exactly like the main
// process already does (`?? []`); `.default([])` would not cover null.
const paintList = z.array(modId).nullish()

export const practiceSelectBikeArgs = z.object({ bikeId: modId, paints: paintList })
export const practiceSelectTrackArgs = z.object({ trackId: modId, layouts: paintList })
export const practiceSetBikePaintArgs = z.object({ paint: modId })
export const practiceSetTrackLayoutArgs = z.object({ layout: modId })
export const practiceSelectHelmetArgs = z.object({ helmetId: modId, paints: paintList })
export const practiceSetHelmetPaintArgs = z.object({ paint: modId })
export const practiceSelectRiderArgs = z.object({ suitId: modId, paints: paintList })
export const practiceSetSuitPaintArgs = z.object({ paint: modId })
export const practiceSelectRidingStyleArgs = z.object({ styleId: modId })
