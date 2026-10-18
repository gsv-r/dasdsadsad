import fs from 'fs/promises'
import path from 'path'
import { getResolvedModsPath } from './paths'
import { MOD_FILE_EXTENSION, METADATA_FILENAME } from '../constants'

interface PrepareConfig {
  subdir: string
  extraDirs?: string[]
  metadata: Record<string, unknown>
}

const PREPARE_CONFIGS: Record<string, PrepareConfig> = {
  bikes: {
    subdir: 'bikes',
    extraDirs: ['paints'],
    metadata: { name: '', brand: '', class: '', version: '1.0', author: '' }
  },
  tracks: {
    subdir: 'tracks',
    metadata: { name: '', country: '', length: 0, version: '1.0', author: '' }
  },
  riders: {
    subdir: path.join('rider', 'riders'),
    metadata: { name: '', version: '1.0', author: '' }
  },
  helmets: {
    subdir: path.join('rider', 'helmets'),
    metadata: { name: '', version: '1.0', author: '' }
  },
  ridingStyles: {
    subdir: path.join('rider', 'animations'),
    metadata: { name: '', version: '1.0', author: '' }
  }
}

async function prepareItems({ subdir, extraDirs = [], metadata }: PrepareConfig): Promise<string[] | false> {
  const modsPath = getResolvedModsPath()
  if (!modsPath) return false

  const itemsPath = path.join(modsPath, subdir)
  let entries
  try {
    entries = await fs.readdir(itemsPath, { withFileTypes: true })
  } catch {
    return false
  }

  const pkzNames = entries
    .filter((e) => e.isFile() && e.name.endsWith(MOD_FILE_EXTENSION))
    .map((e) => path.basename(e.name, MOD_FILE_EXTENSION))
  const items = [
    ...pkzNames,
    ...entries.filter((e) => e.isDirectory() && !pkzNames.includes(e.name)).map((e) => e.name)
  ]

  await Promise.all(
    items.map(async (item) => {
      const itemDir = path.join(itemsPath, item)
      await fs.mkdir(itemDir, { recursive: true })
      for (const dir of extraDirs) {
        await fs.mkdir(path.join(itemDir, dir), { recursive: true })
      }
      try {
        await fs.writeFile(
          path.join(itemDir, METADATA_FILENAME),
          JSON.stringify({ id: item, ...metadata }),
          { flag: 'wx' }
        )
      } catch {
        // metadata already exists
      }
    })
  )

  return items
}

export function prepareBikes(): Promise<string[] | false> {
  return prepareItems(PREPARE_CONFIGS.bikes)
}

export function prepareTracks(): Promise<string[] | false> {
  return prepareItems(PREPARE_CONFIGS.tracks)
}

export function prepareRiders(): Promise<string[] | false> {
  return prepareItems(PREPARE_CONFIGS.riders)
}

export function prepareHelmets(): Promise<string[] | false> {
  return prepareItems(PREPARE_CONFIGS.helmets)
}

export function prepareRidingStyles(): Promise<string[] | false> {
  return prepareItems(PREPARE_CONFIGS.ridingStyles)
}
