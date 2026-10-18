import fs from 'fs'
import path from 'path'
import { BASE_SELECTION_VALUES, GAME_PROCESS_NAME } from '../constants'
import { getResolvedGamePath, getResolvedModsPath, getResolvedProfilePath, getResolvedSteamPath, getStoredModsPath, getStoredProfilePath, isValidModsPath, isValidProfilePath, resolveSteamExecutable } from './paths'
import { weatherSettingsSchema } from '../../types/weather'
import { DEFAULT_PRACTICE_STATE, store } from '../store'
import {
  BIKES_SUBDIR,
  HELMETS_SUBDIR,
  RIDERS_SUBDIR,
  STYLES_SUBDIR,
  TRACKS_SUBDIR,
  isModDir,
  isModFile,
  paintFileName
} from './mods'
import { getActiveProfile } from './profiles'

export interface AppValidationIssue {
  code: string
  title: string
  message: string
}

export interface AppValidationResult {
  valid: boolean
  issues: AppValidationIssue[]
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isWritable(target: string): boolean {
  try {
    fs.accessSync(target, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

// Central application validation. Runs before any critical action (e.g.
// launching the game) and blocks it when something is misconfigured.
// Read-only: never loads mod lists or mutates the stored configuration.
// Every check pushes an exact, user-facing issue so the caller can show
// the error modal with precisely what must be fixed.
export function validateApp(): AppValidationResult {
  const issues: AppValidationIssue[] = []

  checkSteam(issues)
  checkGame(issues)
  const modsPath = checkModsFolder(issues)
  checkPracticeSelection(issues)
  checkPracticeSettings(issues)
  checkProfilePath(issues)
  checkProfileFields(issues)
  if (modsPath && isDirectory(modsPath)) {
    checkInstalledMods(modsPath, issues)
  }

  return { valid: issues.length === 0, issues }
}

function checkSteam(issues: AppValidationIssue[]): void {
  const steamExe = resolveSteamExecutable(getResolvedSteamPath())
  if (!steamExe) {
    issues.push({
      code: 'STEAM_PATH_MISSING',
      title: 'Steam not found',
      message: 'Steam executable was not found. Check Steam Path in Settings.'
    })
  } else if (!isFile(steamExe)) {
    issues.push({
      code: 'STEAM_EXE_MISSING',
      title: 'Steam not found',
      message: `Steam executable was not found at "${steamExe}". Check Steam Path in Settings.`
    })
  }
}

function checkGame(issues: AppValidationIssue[]): void {
  const gamePath = getResolvedGamePath()
  if (!gamePath) {
    issues.push({
      code: 'GAME_PATH_MISSING',
      title: 'Game folder not found',
      message: 'Game folder was not found. Check Game Path in Settings.'
    })
  } else if (!isDirectory(gamePath)) {
    issues.push({
      code: 'GAME_FOLDER_MISSING',
      title: 'Game folder not found',
      message: `Game folder was not found at "${gamePath}". Check Game Path in Settings.`
    })
  } else {
    if (!isFile(path.join(gamePath, GAME_PROCESS_NAME))) {
      issues.push({
        code: 'GAME_EXE_MISSING',
        title: 'Game executable not found',
        message: `"${GAME_PROCESS_NAME}" was not found inside the configured Game Path ("${gamePath}"). Check Game Path in Settings.`
      })
    }
    if (!isWritable(gamePath)) {
      issues.push({
        code: 'GAME_FOLDER_NOT_WRITABLE',
        title: 'Game folder not writable',
        message: `Practice settings cannot be written to the Game Path ("${gamePath}"). Check folder permissions.`
      })
    }
  }
}

function checkModsFolder(issues: AppValidationIssue[]): string | null {
  const modsPath = getResolvedModsPath()
  if (!modsPath) {
    const stored = getStoredModsPath()
    if (stored && !isValidModsPath(stored)) {
      issues.push({
        code: 'MODS_FOLDER_INVALID',
        title: 'Invalid Mods folder',
        message: `The selected Mods folder is invalid or does not have the expected structure (bikes, misc, rider, tracks, tires/tyres) at "${stored}". Check Mods Path in Settings.`
      })
    } else {
      issues.push({
        code: 'MODS_PATH_MISSING',
        title: 'Mods folder not found',
        message: 'Mods folder was not found. Check Mods Path in Settings.'
      })
    }
  } else if (!isDirectory(modsPath)) {
    issues.push({
      code: 'MODS_FOLDER_MISSING',
      title: 'Mods folder not found',
      message: `Mods folder was not found at "${modsPath}". Check Mods Path in Settings.`
    })
  }
  return modsPath
}

function checkPracticeSelection(issues: AppValidationIssue[]): void {
  try {
    const bikeId = store.store.practice?.bike?.bike_id
    const trackId = store.store.practice?.track?.track_id
    if (typeof bikeId !== 'string' || bikeId.trim() === '') {
      issues.push({
        code: 'PRACTICE_BIKE_MISSING',
        title: 'Bike not configured',
        message: 'No bike is selected. Select a bike before launching the game.'
      })
    }
    if (typeof trackId !== 'string' || trackId.trim() === '') {
      issues.push({
        code: 'PRACTICE_TRACK_MISSING',
        title: 'Track not configured',
        message: 'No track is selected. Select a track before launching the game.'
      })
    }
  } catch {
    issues.push({
      code: 'PRACTICE_CONFIG_UNREADABLE',
      title: 'Configuration unreadable',
      message: 'Practice configuration could not be read. Check the app configuration and try again.'
    })
  }
}

function checkPracticeSettings(issues: AppValidationIssue[]): void {
  const settings = store.store.practice?.settings
  if (!settings) return
  if (!weatherSettingsSchema.safeParse(settings).success) {
    issues.push({
      code: 'PRACTICE_SETTINGS_INVALID',
      title: 'Practice settings invalid',
      message:
        'Practice weather settings are out of range. Check Conditions (clear/cloudy/rainy), Temperature (10-38°C), Wind direction, Wind speed and Track conditions in Practice.'
    })
  }
}

function checkProfilePath(issues: AppValidationIssue[]): void {
  const profilePath = getResolvedProfilePath()
  if (!profilePath) {
    const stored = getStoredProfilePath()
    if (stored && !isValidProfilePath(stored)) {
      issues.push({
        code: 'PROFILE_FOLDER_INVALID',
        title: 'Invalid Profile folder',
        message: `The selected Profile folder is invalid or does not contain a valid profile subfolder with profile.ini at "${stored}". Check Profile Path in Settings.`
      })
    } else {
      issues.push({
        code: 'PROFILE_PATH_MISSING',
        title: 'Profile folder not found',
        message: 'Profile folder was not found. Check Profile Path in Settings.'
      })
    }
  } else if (!isDirectory(profilePath)) {
    issues.push({
      code: 'PROFILE_FOLDER_MISSING',
      title: 'Profile folder not found',
      message: `Profile folder was not found at "${profilePath}". Check Profile Path in Settings.`
    })
  } else {
    // Validate that the active profile's profile.ini exists in its subfolder.
    const activeProfile = getActiveProfile()
    if (activeProfile) {
      const activeProfilePath = path.join(profilePath, activeProfile.id)
      const profileIniPath = path.join(activeProfilePath, 'profile.ini')
      if (!isFile(profileIniPath)) {
        issues.push({
          code: 'PROFILE_INI_MISSING',
          title: 'Profile configuration missing',
          message: `The active profile "${activeProfile.id}" does not have a profile.ini file. Check Profile Path in Settings.`
        })
      }
    }
  }
}

function checkProfileFields(issues: AppValidationIssue[]): void {
  const profile = getActiveProfile()
  if (!profile) {
    issues.push({
      code: 'PROFILE_NOT_FOUND',
      title: 'Profile not found',
      message: 'No profile is available. Check Profile Path in Settings.'
    })
    return
  }
  if (!profile.name || profile.name.trim() === '' || profile.name === 'Unnamed') {
    issues.push({
      code: 'PROFILE_NAME_MISSING',
      title: 'Profile name not configured',
      message: 'Profile name is empty. Enter a name in the Profile tab.'
    })
  }
  if (!profile.raceNumber || profile.raceNumber.trim() === '') {
    issues.push({
      code: 'PROFILE_RACE_NUMBER_MISSING',
      title: 'Profile race number not configured',
      message: 'Profile race number is empty. Enter a race number in the Profile tab.'
    })
  }
  const nationality = store.store.profile?.nationality
  if (!nationality || typeof nationality !== 'string' || nationality.trim() === '') {
    issues.push({
      code: 'PROFILE_NATIONALITY_MISSING',
      title: 'Profile nationality not configured',
      message: 'Profile nationality is not selected. Select a nationality in the Profile tab.'
    })
  }
}

const MOD_MISSING_CAUSES =
  'Possible causes: the mod was removed or renamed, the Mods Path changed, or the mod folder is incomplete.'

// Empty, base ("default") and stock-default ids resolve inside the game
// itself, so only user-selected mods need a folder on disk.
function isBaseOrDefault(value: unknown, fallback: string): boolean {
  return (
    typeof value !== 'string' ||
    value.trim() === '' ||
    BASE_SELECTION_VALUES.has(value) ||
    value === fallback
  )
}

function modNotFoundMessage(label: string, id: string, fullPath: string, hint: string): string {
  return `${label} "${id}" was not found in the Mods folder ("${fullPath}"). ${MOD_MISSING_CAUSES} ${hint}.`
}

// Go Ride gate: every mod referenced by the user's setup must exist in the
// Mods folder and be installed correctly.
function checkInstalledMods(modsPath: string, issues: AppValidationIssue[]): void {
  const bike = store.store.practice?.bike ?? DEFAULT_PRACTICE_STATE.bike
  const track = store.store.practice?.track ?? DEFAULT_PRACTICE_STATE.track
  const defaults = DEFAULT_PRACTICE_STATE

  const bikeExists = isModDir(BIKES_SUBDIR, bike.bike_id)
  if (!isBaseOrDefault(bike.bike_id, defaults.bike.bike_id) && !bikeExists) {
    issues.push({
      code: 'MOD_BIKE_MISSING',
      title: 'Bike mod not found',
      message: modNotFoundMessage(
        'Bike',
        bike.bike_id,
        path.join(modsPath, BIKES_SUBDIR, bike.bike_id),
        'Select another bike in Bikes or reinstall the mod'
      )
    })
  } else if (
    !isBaseOrDefault(bike.paint, defaults.bike.paint) &&
    bikeExists &&
    !isModFile(BIKES_SUBDIR, bike.bike_id, 'paints', paintFileName(bike.paint))
  ) {
    issues.push({
      code: 'MOD_BIKE_PAINT_MISSING',
      title: 'Bike paint not found',
      message: modNotFoundMessage(
        'Bike paint',
        bike.paint,
        path.join(modsPath, BIKES_SUBDIR, bike.bike_id, 'paints', paintFileName(bike.paint)),
        'Select another paint in Practice or reinstall the mod'
      )
    })
  }

  const trackExists = isModDir(TRACKS_SUBDIR, track.track_id)
  if (!isBaseOrDefault(track.track_id, defaults.track.track_id) && !trackExists) {
    issues.push({
      code: 'MOD_TRACK_MISSING',
      title: 'Track mod not found',
      message: modNotFoundMessage(
        'Track',
        track.track_id,
        path.join(modsPath, TRACKS_SUBDIR, track.track_id),
        'Select another track in Tracks or reinstall the mod'
      )
    })
  } else if (
    !isBaseOrDefault(track.track_layout, defaults.track.track_layout) &&
    trackExists &&
    !isModDir(TRACKS_SUBDIR, track.track_id, track.track_layout)
  ) {
    issues.push({
      code: 'MOD_TRACK_LAYOUT_MISSING',
      title: 'Track layout not found',
      message: modNotFoundMessage(
        'Track layout',
        track.track_layout,
        path.join(modsPath, TRACKS_SUBDIR, track.track_id, track.track_layout),
        'Select another layout in Practice or reinstall the mod'
      )
    })
  }

  const riderExists = isModDir(RIDERS_SUBDIR, bike.rider)
  if (!isBaseOrDefault(bike.rider, defaults.bike.rider) && !riderExists) {
    issues.push({
      code: 'MOD_RIDER_MISSING',
      title: 'Rider suit mod not found',
      message: modNotFoundMessage(
        'Rider suit',
        bike.rider,
        path.join(modsPath, RIDERS_SUBDIR, bike.rider),
        'Select another suit in Practice or reinstall the mod'
      )
    })
  } else if (
    !isBaseOrDefault(bike.suit_paint, defaults.bike.suit_paint) &&
    riderExists &&
    !isModFile(RIDERS_SUBDIR, bike.rider, 'paints', paintFileName(bike.suit_paint))
  ) {
    issues.push({
      code: 'MOD_SUIT_PAINT_MISSING',
      title: 'Suit paint not found',
      message: modNotFoundMessage(
        'Suit paint',
        bike.suit_paint,
        path.join(modsPath, RIDERS_SUBDIR, bike.rider, 'paints', paintFileName(bike.suit_paint)),
        'Select another suit paint in Practice or reinstall the mod'
      )
    })
  }

  const helmetExists = isModDir(HELMETS_SUBDIR, bike.helmet)
  if (!isBaseOrDefault(bike.helmet, defaults.bike.helmet) && !helmetExists) {
    issues.push({
      code: 'MOD_HELMET_MISSING',
      title: 'Helmet mod not found',
      message: modNotFoundMessage(
        'Helmet',
        bike.helmet,
        path.join(modsPath, HELMETS_SUBDIR, bike.helmet),
        'Select another helmet in Practice or reinstall the mod'
      )
    })
  } else if (
    !isBaseOrDefault(bike.helmet_paint, defaults.bike.helmet_paint) &&
    helmetExists &&
    !isModFile(HELMETS_SUBDIR, bike.helmet, 'paints', paintFileName(bike.helmet_paint))
  ) {
    issues.push({
      code: 'MOD_HELMET_PAINT_MISSING',
      title: 'Helmet paint not found',
      message: modNotFoundMessage(
        'Helmet paint',
        bike.helmet_paint,
        path.join(modsPath, HELMETS_SUBDIR, bike.helmet, 'paints', paintFileName(bike.helmet_paint)),
        'Select another helmet paint in Practice or reinstall the mod'
      )
    })
  }

  if (
    !isBaseOrDefault(bike.riding_style, defaults.bike.riding_style) &&
    !isModDir(STYLES_SUBDIR, bike.riding_style)
  ) {
    issues.push({
      code: 'MOD_RIDING_STYLE_MISSING',
      title: 'Riding style mod not found',
      message: modNotFoundMessage(
        'Riding style',
        bike.riding_style,
        path.join(modsPath, STYLES_SUBDIR, bike.riding_style),
        'Select another riding style in Practice or reinstall the mod'
      )
    })
  }
}
