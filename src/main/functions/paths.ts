import { execSync } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { GAME_APP_ID } from '../constants'
import { store } from '../store'

const STEAM_REGISTRY_QUERY = 'reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath'
const STEAM_EXE_FILENAME = 'steam.exe'
const LIBRARY_FOLDERS_FILE = path.join('steamapps', 'libraryfolders.vdf')
const MODS_PATH = path.join(os.homedir(), 'Documents', 'PiBoSo', 'GP Bikes', 'mods')
const PROFILES_PATH = path.join(os.homedir(), 'Documents', 'PiBoSo', 'GP Bikes', 'profiles')
const GLOBAL_INI_FILENAME = 'global.ini'
const PROFILE_INI_FILENAME = 'profile.ini'
const REQUIRED_MODS_SUBFOLDERS = ['bikes', 'misc', 'rider', 'tracks']
const REQUIRED_TYRE_SUBFOLDERS = ['tires', 'tyres']

// Gate for persisting a manual mods path through store:set. Null clears the
// manual value and is always allowed; a string must describe a valid mods
// folder with the same quote-tolerant check the resolver applies on read, so
// the guard and getResolvedModsPath always agree. Anything else is rejected.
export function isValidManualModsValue(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return isValidModsPath(stripSurroundingQuotes(value))
}
export function isValidModsPath(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== 'string') return false
  const trimmed = candidate.trim()
  if (trimmed === '') return false
  if (!isDir(trimmed)) return false
  const hasRequired = REQUIRED_MODS_SUBFOLDERS.every((subfolder) =>
    isDir(path.join(trimmed, subfolder))
  )
  if (!hasRequired) return false
  // GP Bikes uses the British spelling "tyres" (e.g. Documents/PiBoSo/GP Bikes/mods/tyres).
  // Accept either spelling; extra subfolders are ignored.
  return REQUIRED_TYRE_SUBFOLDERS.some((subfolder) => isDir(path.join(trimmed, subfolder)))
}

function isDir(target: string): boolean {
  try {
    return fs.existsSync(target) && fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target: string): boolean {
  try {
    return fs.existsSync(target) && fs.statSync(target).isFile()
  } catch {
    return false
  }
}

// Gate for persisting a manual profile path through store:set. Null clears the
// manual value and is always allowed; a string must describe a valid profile
// parent folder (containing at least one profile subfolder with profile.ini)
// with the same quote-tolerant check the resolver applies on read, so the
// guard and getResolvedProfilePath always agree. Anything else is rejected.
export function isValidManualProfileValue(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  return isValidProfilePath(stripSurroundingQuotes(value))
}

// A Profile Path is valid when the folder exists and holds at least one
// valid profile: a direct subfolder containing a `profile.ini` file.
// A missing folder is empty, not an exception. Read-only.
export function isValidProfilePath(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== 'string') return false
  const trimmed = stripSurroundingQuotes(candidate)
  if (trimmed === '') return false
  if (!isDir(trimmed)) return false
  try {
    for (const entry of fs.readdirSync(trimmed, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (isFile(path.join(trimmed, entry.name, PROFILE_INI_FILENAME))) return true
    }
    return false
  } catch {
    return false
  }
}

export function findSteamPath(): string | null {
  try {
    const stdout = execSync(STEAM_REGISTRY_QUERY, { encoding: 'utf-8' })
    const steamDir = path.normalize(stdout.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1]?.trim() ?? '')
    if (!steamDir) return null
    const steamExe = path.join(steamDir, STEAM_EXE_FILENAME)
    return fs.existsSync(steamExe) ? steamExe : null
  } catch {
    return null
  }
}

export function findModsPath(): string | null {
  return isValidModsPath(MODS_PATH) ? MODS_PATH : null
}

export function findProfilePath(): string | null {
  return isValidProfilePath(PROFILES_PATH) ? PROFILES_PATH : null
}

function findGameInLibraries(steamDir: string, appId: string): string | null {
  const vdfPath = path.join(steamDir, LIBRARY_FOLDERS_FILE)
  if (!fs.existsSync(vdfPath)) return null

  const vdf = fs.readFileSync(vdfPath, 'utf-8')
  const extra = Array.from(vdf.matchAll(/"(?:path|\d+)"\s+"([^"]+)"/g), (m) =>
    m[1].replace(/\\\\/g, '\\')
  )
  const libraries = [...new Set([steamDir, ...extra])]

  for (const library of libraries) {
    const manifest = path.join(library, 'steamapps', `appmanifest_${appId}.acf`)
    if (!fs.existsSync(manifest)) continue
    const installDir = fs
      .readFileSync(manifest, 'utf-8')
      .match(/"installdir"\s*"([^"]+)"/i)?.[1]
    if (!installDir) continue
    const gamePath = path.join(library, 'steamapps', 'common', installDir)
    if (fs.existsSync(gamePath)) return gamePath
  }

  return null
}

export function findGamePath(appId = GAME_APP_ID): string | null {
  const steamExe = findSteamPath()
  if (!steamExe) return null
  return findGameInLibraries(path.dirname(steamExe), appId)
}

export interface DetectedPaths {
  steamPath: string | null
  gamePath: string | null
  modsPath: string | null
  profilePath: string | null
}

function readStored(
  key: 'steam' | 'game' | 'mods' | 'profile',
  scope: 'paths' | 'pathsAuto'
): string | null {
  try {
    const value = store.get(`${scope}.${key}`) as unknown
    if (typeof value !== 'string') return null
    // Users often paste quoted paths from Explorer ("C:\..."): strip
    // surrounding quotes so a correct path is never rejected.
    const unquoted = stripSurroundingQuotes(value)
    return unquoted === '' ? null : unquoted
  } catch {
    return null
  }
}

export function stripSurroundingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim()
    }
  }
  return trimmed
}

function readOverride(key: 'steam' | 'game' | 'mods' | 'profile'): string | null {
  return readStored(key, 'paths')
}

function readAuto(key: 'steam' | 'game' | 'mods' | 'profile'): string | null {
  return readStored(key, 'pathsAuto')
}

export function getDetectedPaths(): DetectedPaths {
  return {
    steamPath: findSteamPath(),
    gamePath: findGamePath(),
    modsPath: findModsPath(),
    profilePath: findProfilePath()
  }
}

// Persisted values are the single source of truth for initialization.
// Effective value = manual (`paths.*`) ?? last auto-detection (`pathsAuto.*`).
// Null effective means "not configured". No live detection fallback here:
// auto-detection only runs when explicitly requested via `getDetectedPaths()`
// (Auto Detect) and its results are persisted by the caller.
export function getResolvedSteamPath(): string | null {
  return readOverride('steam') ?? readAuto('steam')
}

// Users often configure the Steam folder instead of steam.exe. Accept a
// directory that contains steam.exe so a correct install is never rejected
// (false positive). Returns the executable when it resolves, otherwise the
// original candidate so validation reports it with the exact path shown.
export function resolveSteamExecutable(candidate: string | null): string | null {
  if (!candidate) return null
  try {
    if (fs.statSync(candidate).isFile()) return candidate
    const exe = path.join(candidate, STEAM_EXE_FILENAME)
    if (fs.existsSync(exe) && fs.statSync(exe).isFile()) return exe
    return candidate
  } catch {
    return candidate
  }
}

export function getResolvedGamePath(): string | null {
  return readOverride('game') ?? readAuto('game')
}

export function getResolvedModsPath(): string | null {
  const candidate = getStoredModsPath()
  if (!candidate) return null
  return isValidModsPath(candidate) ? candidate : null
}

// Normalized comparison for persisted vs current mods paths. Formatting
// differences (separators, dot segments, trailing slash, letter case on
// Windows) never mean a different folder.
export function normalizeModsPath(candidate: string): string {
  const resolved = path.resolve(path.normalize(candidate.trim()))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function sameModsPath(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return normalizeModsPath(a) === normalizeModsPath(b)
}

// Raw configured value (manual `paths.mods` ?? auto `pathsAuto.mods`) without
// structure validation. Used by Launch validation to distinguish "not
// configured" from "configured but with an invalid structure".
export function getStoredModsPath(): string | null {
  return readOverride('mods') ?? readAuto('mods')
}

// Raw configured Profile Path (manual `paths.profile` ?? auto
// `pathsAuto.profile`) without structure validation.
export function getStoredProfilePath(): string | null {
  return readOverride('profile') ?? readAuto('profile')
}

// Effective Profile Path, validated like the mods resolver: an invalid
// manual value shadows a valid auto-detection with null (no fallback).
export function getResolvedProfilePath(): string | null {
  const candidate = getStoredProfilePath()
  if (!candidate) return null
  return isValidProfilePath(candidate) ? candidate : null
}

// Location of the game-owned global.ini that selects the active profile
// (`[profile] lastprofile`). Evaluated on call so tests can stub homedir.
export function getGlobalIniPath(): string {
  return path.join(os.homedir(), 'Documents', 'PiBoSo', 'GP Bikes', GLOBAL_INI_FILENAME)
}
