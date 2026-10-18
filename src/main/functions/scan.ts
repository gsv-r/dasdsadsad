import fs from 'fs/promises'
import path from 'path'
import * as z from 'zod'
import { getResolvedModsPath } from './paths'
import { prepareBikes, prepareHelmets, prepareRiders, prepareRidingStyles, prepareTracks } from './prepare'
import { subdirForType } from './mods'
import { PREVIEW_IMAGE_FILENAMES, PAINT_FILE_EXTENSION, METADATA_FILENAME } from '../constants'
import type {
  AnyMod,
  Bike,
  BikeMetadata,
  Helmet,
  HelmetMetadata,
  ModType,
  Rider,
  RiderMetadata,
  RidingStyle,
  RidingStyleMetadata,
  Track,
  TrackMetadata
} from '../../types/mods'

// Shared shape of every metadata.json. Only the id field is required;
// every other field stays optional so a mod that loads today keeps
// loading. The schemas below only detect invalid values for logging and
// never rewrite the data (parsed.data is never used).
const baseMetadataSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional()
})

const bikeMetadataSchema = baseMetadataSchema.extend({
  brand: z.string().optional(),
  class: z.string().optional(),
  year: z.number().optional()
})

const trackMetadataSchema = baseMetadataSchema.extend({
  country: z.string().optional(),
  length: z.number().optional()
})

type MetadataClass = 'bike' | 'track' | 'rider' | 'helmet' | 'ridingStyle'

// Classes already reported in this process. Invalid metadata keeps loading
// unchanged, so each class logs at most once, never once per mod.
const reportedMetadataClasses = new Set<MetadataClass>()

// Logs the first invalid metadata.json per class and nothing else. Missing,
// empty or unparseable files never reach this check (loadMetadata already
// returned null for them), so the fallback of today stays silent. Never
// logs raw values, only the folder name and the first failing field path.
function reportInvalidMetadata(
  modClass: MetadataClass,
  dir: string,
  raw: unknown,
  schema: z.ZodType
): void {
  if (reportedMetadataClasses.has(modClass)) return
  const parsed = schema.safeParse(raw)
  if (parsed.success) return
  reportedMetadataClasses.add(modClass)
  const folder = path.basename(dir)
  const at = parsed.error.issues
    .map((issue) => issue.path.join('.'))
    .find((part) => part !== '')
  if (at === undefined) {
    console.error(`Invalid metadata.json in ${modClass} mod "${folder}". Loading it unchanged.`)
  } else {
    console.error(
      `Invalid metadata.json in ${modClass} mod "${folder}" at "${at}". Loading it unchanged.`
    )
  }
}

async function findPreview(dir: string): Promise<string | null> {
  for (const filename of PREVIEW_IMAGE_FILENAMES) {
    try {
      await fs.access(path.join(dir, filename))
      return path.join(dir, filename)
    } catch {
      // try next
    }
  }
  return null
}

async function findPaints(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(dir, 'paints'), { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(PAINT_FILE_EXTENSION))
      .map((e) => path.basename(e.name, path.extname(e.name)))
  } catch {
    return []
  }
}

async function findLayouts(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

async function loadMetadata<T>(dir: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, METADATA_FILENAME), 'utf-8')) as T
  } catch {
    return null
  }
}

async function withPaints<TMeta extends object>(
  dir: string,
  modClass: MetadataClass,
  schema: z.ZodType
): Promise<(TMeta & { preview: string | null; paints: string[] }) | null> {
  const metadata = await loadMetadata<TMeta>(dir)
  if (!metadata) return null
  reportInvalidMetadata(modClass, dir, metadata, schema)
  const [preview, paints] = await Promise.all([findPreview(dir), findPaints(dir)])
  return { ...metadata, preview, paints }
}

async function scanDir<TMod>(
  subdir: string,
  prepare: () => Promise<string[] | false>,
  enrich: (dir: string) => Promise<TMod | null>
): Promise<TMod[] | false> {
  const modsPath = getResolvedModsPath()
  if (!modsPath) return false

  const ids = await prepare()
  if (!ids) return false

  const basePath = path.join(modsPath, subdir)
  const items = await mapWithLimit(ids, 8, (id) => enrich(path.join(basePath, id)))
  return items.filter((item) => item !== null) as TMod[]
}

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workerCount = Math.min(Math.max(limit, 1), items.length)
  if (workerCount === 0) return []
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export function isSameMod(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function enrichBike(dir: string): Promise<Bike | null> {
  return withPaints<BikeMetadata>(dir, 'bike', bikeMetadataSchema) as Promise<Bike | null>
}

export function enrichRider(dir: string): Promise<Rider | null> {
  return withPaints<RiderMetadata>(dir, 'rider', baseMetadataSchema) as Promise<Rider | null>
}

export function enrichHelmet(dir: string): Promise<Helmet | null> {
  return withPaints<HelmetMetadata>(dir, 'helmet', baseMetadataSchema) as Promise<Helmet | null>
}

export function enrichTrack(dir: string): Promise<Track | null> {
  return enrichTrackDir(dir)
}

export function enrichRidingStyle(dir: string): Promise<RidingStyle | null> {
  return enrichRidingStyleDir(dir)
}

// Single-mod scan reusing the full-scan enrichers. No prepare call, so
// watching never creates folders or metadata. Returns null when the mod
// is missing or invalid; the caller removes it from the cache.
export async function scanOne(type: ModType, id: string): Promise<AnyMod | null> {
  const modsPath = getResolvedModsPath()
  if (!modsPath || id === '') return null
  const dir = path.join(modsPath, subdirForType(type), id)
  switch (type) {
    case 'bikes':
      return enrichBike(dir)
    case 'tracks':
      return enrichTrackDir(dir)
    case 'riders':
      return enrichRider(dir)
    case 'helmets':
      return enrichHelmet(dir)
    case 'ridingStyles':
      return enrichRidingStyleDir(dir)
  }
}

async function enrichTrackDir(dir: string): Promise<Track | null> {
  const metadata = await loadMetadata<TrackMetadata>(dir)
  if (!metadata) return null
  reportInvalidMetadata('track', dir, metadata, trackMetadataSchema)
  const [preview, layouts] = await Promise.all([findPreview(dir), findLayouts(dir)])
  return { ...metadata, preview, layouts }
}

async function enrichRidingStyleDir(dir: string): Promise<RidingStyle | null> {
  const metadata = await loadMetadata<RidingStyleMetadata>(dir)
  if (!metadata) return null
  reportInvalidMetadata('ridingStyle', dir, metadata, baseMetadataSchema)
  return { ...metadata, preview: await findPreview(dir) }
}

export function scanBikes(): Promise<Bike[] | false> {
  return scanDir('bikes', prepareBikes, (dir) => withPaints<BikeMetadata>(dir, 'bike', bikeMetadataSchema))
}

export function scanTracks(): Promise<Track[] | false> {
  return scanDir('tracks', prepareTracks, enrichTrack)
}

export function scanRiders(): Promise<Rider[] | false> {
  return scanDir(path.join('rider', 'riders'), prepareRiders, (dir) =>
    withPaints<RiderMetadata>(dir, 'rider', baseMetadataSchema)
  )
}

export function scanHelmets(): Promise<Helmet[] | false> {
  return scanDir(path.join('rider', 'helmets'), prepareHelmets, (dir) =>
    withPaints<HelmetMetadata>(dir, 'helmet', baseMetadataSchema)
  )
}

export function scanRidingStyles(): Promise<RidingStyle[] | false> {
  return scanDir(path.join('rider', 'animations'), prepareRidingStyles, enrichRidingStyle)
}
