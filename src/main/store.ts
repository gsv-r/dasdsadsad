import Store from 'electron-store'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { MODS_CACHE_VERSION } from '../types/mods'
import type { ModsCachePersisted } from '../types/mods'
import type { PlayerSetup } from '../types/setups'

export interface PracticeBikeState {
  bike_id: string
  paint: string
  rider: string
  helmet: string
  helmet_paint: string
  suit_paint: string
  riding_style: string
}

interface PracticeState {
  bike: PracticeBikeState
  track: {
    track_id: string
    track_layout: string
  }
  settings: {
    weather_realistic: number
    weather_conditions: number
    temperature: number
    wind_direction: number
    wind_speed: number
    track_conditions: number
  }
  dynamicsurface: {
    disable: number
  }
  /** Active setup id, or null when no setup is applied. */
  setup_id: string | null
}

interface StoreSchema {
  practice: PracticeState
  setup: {
    bike: { id: string; name: string }
    track: { id: string; name: string }
  }
  paths: {
    steam: string | null
    game: string | null
    mods: string | null
    profile: string | null
  }
  pathsAuto: {
    steam: string | null
    game: string | null
    mods: string | null
    profile: string | null
  }
  profile: {
    nationality: string | null
  }
  modsCache: ModsCachePersisted
  setups: PlayerSetup[]
}

export const DEFAULT_PRACTICE_STATE: PracticeState = {
  bike: {
    bike_id: 'schwaben_m2_18',
    paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  },
  track: {
    track_id: 'Adriatic',
    track_layout: ''
  },
  settings: {
    weather_realistic: 0,
    weather_conditions: 0,
    temperature: 25,
    wind_direction: 0,
    wind_speed: 0,
    track_conditions: 0
  },
  dynamicsurface: {
    disable: 0
  },
  setup_id: null
}

// Defaults below seed a fresh install only (no config file yet).
// electron-store writes them once on first run. On later runs the persisted
// file is the source of truth and is never overwritten here, so existing
// user configuration is always preserved.
export const DEFAULT_SETUP: StoreSchema['setup'] = {
  bike: { id: 'schwaben_m2_18', name: 'Schwaben M2 2018' },
  track: { id: 'Adriatic', name: 'Adriatic' }
}

export const DEFAULT_PATHS: StoreSchema['paths'] = {
  steam: null,
  game: null,
  mods: null,
  profile: null
}

export const DEFAULT_PATHS_AUTO: StoreSchema['pathsAuto'] = {
  steam: null,
  game: null,
  mods: null,
  profile: null
}

export const DEFAULT_PROFILE: StoreSchema['profile'] = {
  nationality: null
}

export const DEFAULT_MODS_CACHE: ModsCachePersisted = {
  version: MODS_CACHE_VERSION,
  valid: false,
  ready: false,
  modsPath: null,
  mods: {}
}

export const DEFAULT_SETUPS: PlayerSetup[] = []

const STORE_DEFAULTS = {
  practice: DEFAULT_PRACTICE_STATE,
  setup: DEFAULT_SETUP,
  paths: DEFAULT_PATHS,
  pathsAuto: DEFAULT_PATHS_AUTO,
  profile: DEFAULT_PROFILE,
  modsCache: DEFAULT_MODS_CACHE,
  setups: DEFAULT_SETUPS
}

// Config file location from the same source the constructor uses:
// electron-store defaults to `<userData>/config.json` when no name or cwd
// is given.
function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function createStore(): Store<StoreSchema> {
  try {
    return new Store<StoreSchema>({ defaults: STORE_DEFAULTS })
  } catch (error) {
    // Only a malformed file is recoverable: move it aside (preserved for
    // support) and start clean. Anything else is rethrown, including a
    // failed move.
    if (!(error instanceof SyntaxError)) throw error
    const source = configFilePath()
    const backup = `${source}.corrupt-${new Date().toISOString().replace(/:/g, '-')}`
    fs.renameSync(source, backup)
    console.error(`Invalid store config moved to "${backup}". Starting with defaults.`)
    return new Store<StoreSchema>({ defaults: STORE_DEFAULTS })
  }
}

export const store = createStore()

// Persistent paths are the source of truth.
// `paths.*` holds manual values (null = not manual).
// `pathsAuto.*` holds the last auto-detection (null = never detected).
// Effective value = manual ?? auto. Null effective means "not configured".
