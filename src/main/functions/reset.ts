import { store } from '../store'
import { resetActiveProfileInfo } from './profiles'

// Reset clears every launcher-owned setting through electron-store and
// restores the defined defaults (practice, setup, paths, pathsAuto,
// profile, modsCache). There is a single store instance (see
// src/main/store.ts), so clear() resets all launcher data at once. Profile
// name/race_number live in the active profile.ini (written through
// profiles:save), outside the store, so store.clear() alone would leave the
// previous values behind: reset them first while the Profile Path still
// resolves, then clear the store. It never deletes files or folders: the
// Chromium profile in %APPDATA%/Roaming stays intact (no locked-file
// errors, no white window), and game files and installed mods — which live
// outside the store — are never touched. The main handler resyncs the mods
// watcher and the renderer reloads from the store, so the interface shows
// initial values without restarting.
export function resetLauncher(): void {
  try {
    resetActiveProfileInfo()
    store.clear()
  } catch (error) {
    throw new Error('Could not reset launcher settings.', { cause: error })
  }
}
