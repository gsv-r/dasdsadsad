import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => {
  const appMock = {
    getPath: vi.fn((): string => os.tmpdir()),
    getVersion: vi.fn(() => '0.0.0-test')
  }
  const ipcMainMock = { on: vi.fn() }
  return { appMock, ipcMainMock }
})

vi.mock('electron', () => ({
  app: mocks.appMock,
  ipcMain: mocks.ipcMainMock,
  default: { app: mocks.appMock, ipcMain: mocks.ipcMainMock }
}))

import {
  enrichBike,
  enrichHelmet,
  enrichRider,
  enrichRidingStyle,
  enrichTrack
} from './scan.js'

async function makeModDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-scan-'))
  return {
    dir,
    cleanup: async () => {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  }
}

async function writeMetadata(dir: string, raw: string): Promise<void> {
  await fs.promises.writeFile(path.join(dir, 'metadata.json'), raw, 'utf-8')
}

function recordOf(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>
}

const VALID_BIKE = {
  id: 'bikeA',
  name: 'Bike A',
  brand: 'Brand',
  class: 'Moto3',
  year: 2024,
  version: '1.0',
  author: 'Author'
}

// Characterization of the current metadata.json behavior. Every case below
// asserts what the code does today, before any tolerant validation lands:
// data flows through untouched, unparseable input discards the mod, and
// nothing throws.
describe('metadata.json characterization (current behavior)', () => {
  it('loads a valid bike with disk-provided preview and paints', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify(VALID_BIKE))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(result).toMatchObject({ ...VALID_BIKE, preview: null, paints: [] })
    } finally {
      await mod.cleanup()
    }
  })

  it('keeps extra keys while disk values win over paints and preview from JSON', async () => {
    const mod = await makeModDir()
    try {
      await fs.promises.mkdir(path.join(mod.dir, 'paints'), { recursive: true })
      await fs.promises.writeFile(path.join(mod.dir, 'paints', 'real.pnt'), 'paint', 'utf-8')
      await writeMetadata(
        mod.dir,
        JSON.stringify({ ...VALID_BIKE, foo: 1, paints: ['json-paint'], preview: 'json-preview' })
      )
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['foo']).toBe(1)
      expect(recordOf(result)['paints']).toEqual(['real'])
      expect(recordOf(result)['preview']).toBeNull()
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a bike with year as a string, keeping the wrong type untouched', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify({ ...VALID_BIKE, year: '2024' }))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['year']).toBe('2024')
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a bike with name as a number, keeping the wrong type untouched', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify({ ...VALID_BIKE, name: 123 }))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['name']).toBe(123)
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a bike with id as a number, keeping the wrong type untouched', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify({ ...VALID_BIKE, id: 123 }))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['id']).toBe(123)
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a bike without year, like the prepare seed writes it', async () => {
    const mod = await makeModDir()
    try {
      const { year: _omitted, ...seedShape } = VALID_BIKE
      await writeMetadata(mod.dir, JSON.stringify(seedShape))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['year']).toBeUndefined()
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a bike without id, leaving the field undefined', async () => {
    const mod = await makeModDir()
    try {
      const { id: _omitted, ...withoutId } = VALID_BIKE
      await writeMetadata(mod.dir, JSON.stringify(withoutId))
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['id']).toBeUndefined()
    } finally {
      await mod.cleanup()
    }
  })

  it('discards a mod with an empty metadata.json', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '')
      await expect(enrichBike(mod.dir)).resolves.toBeNull()
    } finally {
      await mod.cleanup()
    }
  })

  it('discards a mod with invalid JSON', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '{not json')
      await expect(enrichBike(mod.dir)).resolves.toBeNull()
    } finally {
      await mod.cleanup()
    }
  })

  it('discards a mod with a missing metadata.json', async () => {
    const mod = await makeModDir()
    try {
      await expect(enrichBike(mod.dir)).resolves.toBeNull()
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a mod with an array root, spreading it unchanged', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '[]')
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['preview']).toBeNull()
      expect(recordOf(result)['paints']).toEqual([])
      expect(recordOf(result)['id']).toBeUndefined()
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a mod with a string root, spreading its indices unchanged', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '"x"')
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['0']).toBe('x')
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a mod with a numeric root, spreading it unchanged', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '123')
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['preview']).toBeNull()
      expect(recordOf(result)['paints']).toEqual([])
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a mod with a boolean root, spreading it unchanged', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, 'true')
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['preview']).toBeNull()
      expect(recordOf(result)['paints']).toEqual([])
    } finally {
      await mod.cleanup()
    }
  })

  it('discards a mod with a null root', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, 'null')
      await expect(enrichBike(mod.dir)).resolves.toBeNull()
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a mod with an empty object root', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '{}')
      const result = await enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['preview']).toBeNull()
      expect(recordOf(result)['paints']).toEqual([])
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a valid track with disk-provided layouts', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(
        mod.dir,
        JSON.stringify({
          id: 'trackA',
          name: 'Track A',
          country: 'Country',
          length: 4.5,
          version: '1.0',
          author: 'Author'
        })
      )
      const result = await enrichTrack(mod.dir)
      expect(result).not.toBeNull()
      expect(result).toMatchObject({ id: 'trackA', name: 'Track A', preview: null, layouts: [] })
    } finally {
      await mod.cleanup()
    }
  })

  it('loads a valid rider, helmet and riding style', async () => {
    const rider = await makeModDir()
    const helmet = await makeModDir()
    const style = await makeModDir()
    try {
      await writeMetadata(
        rider.dir,
        JSON.stringify({ id: 'riderA', name: 'Rider A', version: '1.0', author: 'Author' })
      )
      await writeMetadata(
        helmet.dir,
        JSON.stringify({ id: 'helmetA', name: 'Helmet A', version: '1.0', author: 'Author' })
      )
      await writeMetadata(style.dir, JSON.stringify({ id: 'styleA', name: 'Style A' }))
      await expect(enrichRider(rider.dir)).resolves.toMatchObject({ id: 'riderA', paints: [] })
      await expect(enrichHelmet(helmet.dir)).resolves.toMatchObject({ id: 'helmetA', paints: [] })
      await expect(enrichRidingStyle(style.dir)).resolves.toMatchObject({
        id: 'styleA',
        preview: null
      })
    } finally {
      await rider.cleanup()
      await helmet.cleanup()
      await style.cleanup()
    }
  })
})

// Detection-only logging for invalid metadata.json. The data keeps loading
// exactly as characterized above; a failing safeParse only logs once per
// class, with the folder name and the first failing field, never raw values.
describe('invalid metadata logging', () => {
  let fresh: typeof import('./scan.js')
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    fresh = await import('./scan.js')
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs once with folder and field path while loading the mod unchanged', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify({ ...VALID_BIKE, year: '2024' }))
      const result = await fresh.enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['year']).toBe('2024')
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        `Invalid metadata.json in bike mod "${path.basename(mod.dir)}" at "year". Loading it unchanged.`
      )
    } finally {
      await mod.cleanup()
    }
  })

  it('never logs a second mod of an already reported class', async () => {
    const first = await makeModDir()
    const second = await makeModDir()
    try {
      await writeMetadata(first.dir, JSON.stringify({ ...VALID_BIKE, year: '2024' }))
      await writeMetadata(second.dir, JSON.stringify({ ...VALID_BIKE, name: 123 }))
      await fresh.enrichBike(first.dir)
      const result = await fresh.enrichBike(second.dir)
      expect(result).not.toBeNull()
      expect(recordOf(result)['name']).toBe(123)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      await first.cleanup()
      await second.cleanup()
    }
  })

  it('logs each class independently', async () => {
    const bike = await makeModDir()
    const track = await makeModDir()
    try {
      await writeMetadata(bike.dir, JSON.stringify({ ...VALID_BIKE, year: '2024' }))
      await writeMetadata(
        track.dir,
        JSON.stringify({
          id: 'trackA',
          name: 'Track A',
          country: 123,
          length: 4.5,
          version: '1.0',
          author: 'Author'
        })
      )
      await fresh.enrichBike(bike.dir)
      await fresh.enrichTrack(track.dir)
      expect(errorSpy).toHaveBeenCalledTimes(2)
      expect(errorSpy).toHaveBeenCalledWith(
        `Invalid metadata.json in track mod "${path.basename(track.dir)}" at "country". Loading it unchanged.`
      )
    } finally {
      await bike.cleanup()
      await track.cleanup()
    }
  })

  it('omits the field path when the root itself is invalid', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, '123')
      const result = await fresh.enrichBike(mod.dir)
      expect(result).not.toBeNull()
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        `Invalid metadata.json in bike mod "${path.basename(mod.dir)}". Loading it unchanged.`
      )
    } finally {
      await mod.cleanup()
    }
  })

  it('stays silent for valid metadata', async () => {
    const mod = await makeModDir()
    try {
      await writeMetadata(mod.dir, JSON.stringify(VALID_BIKE))
      await expect(fresh.enrichBike(mod.dir)).resolves.not.toBeNull()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      await mod.cleanup()
    }
  })

  it('stays silent for missing, empty and unparseable files', async () => {
    const missing = await makeModDir()
    const empty = await makeModDir()
    const broken = await makeModDir()
    try {
      await writeMetadata(empty.dir, '')
      await writeMetadata(broken.dir, '{not json')
      await expect(fresh.enrichBike(missing.dir)).resolves.toBeNull()
      await expect(fresh.enrichBike(empty.dir)).resolves.toBeNull()
      await expect(fresh.enrichBike(broken.dir)).resolves.toBeNull()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      await missing.cleanup()
      await empty.cleanup()
      await broken.cleanup()
    }
  })
})
