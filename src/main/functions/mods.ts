import fs from 'fs'
import path from 'path'
import { PAINT_FILE_EXTENSION } from '../constants'
import { getResolvedModsPath } from './paths'
import type { ModType } from '../../types/mods'

export const BIKES_SUBDIR = 'bikes'
export const TRACKS_SUBDIR = 'tracks'
export const RIDERS_SUBDIR = path.join('rider', 'riders')
export const HELMETS_SUBDIR = path.join('rider', 'helmets')
export const STYLES_SUBDIR = path.join('rider', 'animations')

const SUBDIR_BY_TYPE: Record<ModType, string> = {
  bikes: BIKES_SUBDIR,
  tracks: TRACKS_SUBDIR,
  riders: RIDERS_SUBDIR,
  helmets: HELMETS_SUBDIR,
  ridingStyles: STYLES_SUBDIR
}

export function subdirForType(type: ModType): string {
  return SUBDIR_BY_TYPE[type]
}

export function paintFileName(paint: string): string {
  return `${paint}${PAINT_FILE_EXTENSION}`
}

function modStats(...segments: string[]): fs.Stats | null {
  const modsPath = getResolvedModsPath()
  if (!modsPath) return null
  try {
    return fs.statSync(path.join(modsPath, ...segments))
  } catch {
    return null
  }
}

export function isModDir(...segments: string[]): boolean {
  return modStats(...segments)?.isDirectory() ?? false
}

export function isModFile(...segments: string[]): boolean {
  return modStats(...segments)?.isFile() ?? false
}
