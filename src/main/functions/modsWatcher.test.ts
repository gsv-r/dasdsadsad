import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ModChangedMessage, ModDiff } from '../../types/mods.js'

const chokidarState = vi.hoisted(() => ({
  watchCalls: [] as { paths: string[]; options: unknown }[],
  allHandler: null as null | ((event: string, fullPath: string) => void),
  errorHandler: null as null | ((error: unknown) => void),
  closeCalls: 0
}))

const pathsState = vi.hoisted(() => ({ modsPath: null as string | null }))

const storeState = vi.hoisted(() => ({ data: {} as Record<string, unknown>, setCalls: 0 }))

// scanOne is the unit the watcher drives per event, so the tests count and
// control it directly. By default it delegates to the real implementation
// (the earlier tests rely on real metadata.json on disk). `results` pins a
// return value per `${type}:${id}` so timer logic can be asserted without any
// disk timing, and `hold` parks one call so a result can be released after a
// resync changed the generation.
const scanState = vi.hoisted(() => ({
  scanOneCalls: [] as { type: string; id: string }[],
  results: new Map<string, unknown>(),
  hold: null as null | { key: string; promise: Promise<unknown> }
}))

vi.mock('chokidar', () => ({
  default: {
    watch: (paths: string[], options: unknown) => {
      chokidarState.watchCalls.push({ paths, options })
      return {
        on: (event: string, handler: (...args: never[]) => void) => {
          if (event === 'all') chokidarState.allHandler = handler as typeof chokidarState.allHandler
          if (event === 'error') {
            chokidarState.errorHandler = handler as typeof chokidarState.errorHandler
          }
          return chokidarState
        },
        close: async (): Promise<void> => {
          chokidarState.closeCalls += 1
        }
      }
    }
  }
}))

vi.mock('./paths', async () => {
  const actual = await vi.importActual<typeof import('./paths.js')>('./paths.js')
  return {
    ...actual,
    getResolvedModsPath: vi.fn((): string | null => pathsState.modsPath)
  }
})

vi.mock('../store', () => ({
  DEFAULT_MODS_CACHE: { version: 3, valid: false, ready: false, modsPath: null, mods: {} },
  store: {
    get: vi.fn((key: string) => storeState.data[key]),
    set: vi.fn((key: string, value: unknown) => {
      storeState.data[key] = value
      storeState.setCalls += 1
    })
  }
}))

vi.mock('./scan', async () => {
  const actual = await vi.importActual<typeof import('./scan.js')>('./scan.js')
  return {
    ...actual,
    scanOne: (type: Parameters<typeof actual.scanOne>[0], id: string): Promise<unknown> => {
      const key = `${type}:${id}`
      scanState.scanOneCalls.push({ type, id })
      const held = scanState.hold
      if (held && held.key === key) return held.promise
      if (scanState.results.has(key)) return Promise.resolve(scanState.results.get(key) ?? null)
      return actual.scanOne(type, id) as Promise<unknown>
    }
  }
})

type WatcherModule = typeof import('./modsWatcher.js')

async function freshWatcher(): Promise<WatcherModule> {
  vi.resetModules()
  return import('./modsWatcher.js')
}

function writeMod(modsPath: string, subdir: string, id: string, metadata: object): void {
  const dir = path.join(modsPath, subdir, id)
  fs.mkdirSync(path.join(dir, 'paints'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ id, ...metadata }))
}

function makeModsTree(): string {
  const modsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-watcher-'))
  for (const sub of ['bikes', 'tracks', path.join('rider', 'riders')]) {
    fs.mkdirSync(path.join(modsPath, sub), { recursive: true })
  }
  return modsPath
}

function bikeEntry(id: string, name: string): object {
  return { id, name, preview: null, paints: [] }
}

function isDiff(message: ModChangedMessage): message is ModDiff {
  return typeof (message as ModDiff).type === 'string'
}

function scanOneCallsFor(id: string): number {
  return scanState.scanOneCalls.filter((call) => call.id === id).length
}

// Drains the scanOne -> applyScanResult -> scheduleScanRetry microtask chain.
// Ten turns cover .then/.catch/.finally without relying on real timers.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Each test re-imports the watcher module, but PERSIST_DEBOUNCE_MS timers
// from earlier modules stay live and later write to this shared store mock.
// Tests that count store writes must drain those first, otherwise a leaked
// timer from a previous test lands mid-assertion (order-dependent failures).
async function drainLeakedPersists(watcher: WatcherModule): Promise<void> {
  await sleep(1600)
  watcher.flushModsCache()
  storeState.setCalls = 0
}

beforeEach(() => {
  chokidarState.watchCalls.length = 0
  chokidarState.allHandler = null
  chokidarState.errorHandler = null
  chokidarState.closeCalls = 0
  pathsState.modsPath = null
  storeState.data = {}
  storeState.setCalls = 0
  scanState.scanOneCalls.length = 0
  scanState.results.clear()
  scanState.hold = null
})

describe('invalid mods path at boot', () => {
  it('clears memory and Store, starts no watcher, serves { valid: false, mods: {} }', async () => {
    const modsPath = makeModsTree()
    try {
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      storeState.data.modsCache = {
        version: 3,
        valid: true,
        ready: true,
        modsPath,
        mods: { bikes: [bikeEntry('bikeA', 'Bike A')], tracks: [], riders: [], helmets: [], ridingStyles: [] }
      }
      pathsState.modsPath = null
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))

      expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })
      expect(chokidarState.watchCalls).toHaveLength(0)
      expect(storeState.data.modsCache).toMatchObject({ valid: false, mods: {} })
      // The existing path validation gates the cache before serving it.
      const pathsMod = await import('./paths.js')
      expect(pathsMod.getResolvedModsPath).toHaveBeenCalled()
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('persisted modsPath mismatch at boot', () => {
  it('discards the previous folder mods and rebuilds from the current path', async () => {
    const dirA = makeModsTree()
    const dirB = makeModsTree()
    try {
      writeMod(dirB, 'bikes', 'bikeB', { name: 'Bike B' })
      storeState.data.modsCache = {
        version: 3,
        valid: true,
        ready: true,
        modsPath: dirA,
        mods: { bikes: [bikeEntry('oldBike', 'Old Bike')], tracks: [], riders: [], helmets: [], ridingStyles: [] }
      }
      pathsState.modsPath = dirB
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})

      // Never serves the previous folder's mods, even before reconcile.
      const immediate = watcher.getModsSnapshot()
      expect((immediate.mods.bikes ?? []).map((b) => b.id)).not.toContain('oldBike')

      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeB'])
      })
      expect(watcher.getModsSnapshot().valid).toBe(true)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true })
      fs.rmSync(dirB, { recursive: true, force: true })
    }
  })
})

describe('regression: valid path without cache', () => {
  it('serves { valid: true, ready: false } immediately, never invalid or empty', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))

      const immediate = watcher.getModsSnapshot()
      expect(immediate.valid).toBe(true)
      expect(immediate.ready).toBe(false)

      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      expect(watcher.getModsSnapshot()).toMatchObject({ valid: true, ready: true })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('emits a full snapshot at the end of the first reconcile, even with no mods on disk', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))

      await vi.waitFor(() => {
        expect(
          messages.some((message) => !isDiff(message) && message.valid && message.ready)
        ).toBe(true)
      })
      expect(watcher.getModsSnapshot()).toMatchObject({ valid: true, ready: true })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('regression: foreign-format persisted modsPath', () => {
  it('stays valid when only the formatting differs', async () => {
    const modsPath = makeModsTree()
    try {
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      storeState.data.modsCache = {
        version: 3,
        valid: true,
        ready: true,
        modsPath: modsPath + path.sep,
        mods: { bikes: [bikeEntry('bikeA', 'Bike A')], tracks: [], riders: [], helmets: [], ridingStyles: [] }
      }
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))

      const immediate = watcher.getModsSnapshot()
      expect(immediate.valid).toBe(true)
      expect((immediate.mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      expect(messages.some((message) => !isDiff(message) && !message.valid)).toBe(false)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('mods path change while open', () => {
  it('replaces the renderer state with { valid: false, mods: {} } and closes the watcher', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })

      pathsState.modsPath = null
      await watcher.refreshModsWatcher()

      expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })
      expect(chokidarState.closeCalls).toBeGreaterThan(0)
      expect(storeState.data.modsCache).toMatchObject({ valid: false, mods: {} })
      expect(messages).toContainEqual({ valid: false, ready: false, mods: {} })
      // Never an empty diff: every incremental message carries a change.
      for (const message of messages) {
        if (isDiff(message)) {
          expect(message.upserted.length + message.removed.length).toBeGreaterThan(0)
        }
      }
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('resyncFromDisk stops old watcher, empties cache, emits {valid:true,ready:false}, starts watcher on new folder', async () => {
    const modsPathA = makeModsTree()
    const modsPathB = makeModsTree()
    try {
      writeMod(modsPathA, 'bikes', 'bikeA', { name: 'Bike A' })
      writeMod(modsPathB, 'bikes', 'bikeB', { name: 'Bike B' })

      pathsState.modsPath = modsPathA
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })

      const watchCallsBefore = chokidarState.watchCalls.length
      const closeCallsBefore = chokidarState.closeCalls

      // Switch to new path
      pathsState.modsPath = modsPathB
      await watcher.refreshModsWatcher()

      // Old watcher closed
      expect(chokidarState.closeCalls - closeCallsBefore).toBe(1)
      // New watcher started on new folder
      expect(chokidarState.watchCalls.length - watchCallsBefore).toBe(1)
      const newWatchCall = chokidarState.watchCalls[chokidarState.watchCalls.length - 1]
      expect(newWatchCall.paths).toEqual(
        expect.arrayContaining([expect.stringContaining(modsPathB)])
      )

      // Cache emptied and {valid:true,ready:false} emitted immediately
      // getModsSnapshotFresh triggers resync and we can check the snapshot
      const freshSnapshot = await watcher.getModsSnapshotFresh()
      expect(freshSnapshot.valid).toBe(true)
      expect(freshSnapshot.ready).toBe(false)
      expect(freshSnapshot.mods.bikes).toEqual([])

      // New scan completes
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeB'])
      })
      expect(watcher.getModsSnapshot()).toMatchObject({ valid: true, ready: true })

      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPathA, { recursive: true, force: true })
      fs.rmSync(modsPathB, { recursive: true, force: true })
    }
  })
})

describe('path becomes invalid with the app open', () => {
  it('a filesystem event revalidates and replaces the state instead of serving stale mods', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })

      // Folder deleted on disk: validation fails, the next event resyncs.
      fs.rmSync(modsPath, { recursive: true, force: true })
      pathsState.modsPath = null
      chokidarState.allHandler?.('unlinkDir', path.join(modsPath, 'bikes', 'bikeA'))

      await vi.waitFor(() => {
        expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })
      })
      expect(messages).toContainEqual({ valid: false, ready: false, mods: {} })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('watcher setup', () => {
  it('watches each mods subfolder with bounded depth and survives errors', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})
      await vi.waitFor(() => expect(chokidarState.watchCalls.length).toBe(1))
      const call = chokidarState.watchCalls[0] as {
        paths: string[]
        options: Record<string, unknown>
      }
      expect(call.paths).toHaveLength(5)
      expect(call.options.ignoreInitial).toBe(true)
      expect(call.options.depth).toBe(2)
      expect(call.options.awaitWriteFinish).toBeDefined()
      expect(chokidarState.errorHandler).not.toBeNull()
      expect(() => chokidarState.errorHandler?.(new Error('EBUSY'))).not.toThrow()
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('resolveEventTarget', () => {
  it('maps subfolder paths to type/id with platform separators', async () => {
    const watcher = await freshWatcher()
    const modsPath = path.join('C:', 'mods')
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'bikes', 'bikeA', 'metadata.json'))
    ).toEqual({ type: 'bikes', id: 'bikeA' })
    expect(watcher.resolveEventTarget(modsPath, path.join(modsPath, 'bikes', 'foo.pkz'))).toEqual({
      type: 'bikes',
      id: 'foo'
    })
    expect(
      watcher.resolveEventTarget(
        modsPath,
        path.join(modsPath, 'rider', 'helmets', 'h1', 'preview.png')
      )
    ).toEqual({ type: 'helmets', id: 'h1' })
    expect(
      watcher.resolveEventTarget(
        modsPath,
        path.join(modsPath, 'rider', 'animations', 'styleA', 'metadata.json')
      )
    ).toEqual({ type: 'ridingStyles', id: 'styleA' })
    expect(watcher.resolveEventTarget(modsPath, path.join(modsPath, 'misc', 'file.txt'))).toBeNull()
    expect(watcher.resolveEventTarget(null, path.join(modsPath, 'bikes', 'x'))).toBeNull()
  })

  it('resolveEventTarget para arquivos internos da pasta do mod (bikes/tracks)', async () => {
    const watcher = await freshWatcher()
    const modsPath = path.join('C:', 'mods')
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'bikes', 'NovaMoto', 'metadata.json'))
    ).toEqual({ type: 'bikes', id: 'NovaMoto' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'bikes', 'NovaMoto', 'preview.png'))
    ).toEqual({ type: 'bikes', id: 'NovaMoto' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'tracks', 'Adriatic', 'layoutA', 'info.txt'))
    ).toEqual({ type: 'tracks', id: 'Adriatic' })
  })

  it('resolveEventTarget para arquivos internos da pasta do mod (rider/<sub>/)', async () => {
    const watcher = await freshWatcher()
    const modsPath = path.join('C:', 'mods')
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'rider', 'riders', 'Joao', 'metadata.json'))
    ).toEqual({ type: 'riders', id: 'Joao' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'rider', 'riders', 'Joao', 'paints', 'paint1.png'))
    ).toEqual({ type: 'riders', id: 'Joao' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'rider', 'helmets', 'H1', 'preview.png'))
    ).toEqual({ type: 'helmets', id: 'H1' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'rider', 'helmets', 'H1', 'metadata.json'))
    ).toEqual({ type: 'helmets', id: 'H1' })
    expect(
      watcher.resolveEventTarget(modsPath, path.join(modsPath, 'rider', 'animations', 'StyleA', 'metadata.json'))
    ).toEqual({ type: 'ridingStyles', id: 'StyleA' })
  })
})

describe('refreshByFocus gate', () => {
  it('disco igual ao cache: não dispara scan nem emit', async () => {
    const modsPath = makeModsTree()
    try {
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect(watcher.getModsSnapshot().ready).toBe(true)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      const messagesBefore = messages.length

      // Disco igual: focus não deve disparar novo scan nem emit.
      await watcher.refreshByFocus()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(messages.length).toBe(messagesBefore)
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('disco diferente (nova pasta no disco): dispara reconcile e o mod aparece', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect(watcher.getModsSnapshot().ready).toBe(true)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])
      })

      // Adiciona mod no disco sem disparar watcher event.
      writeMod(modsPath, 'bikes', 'bikeB', { name: 'Bike B' })

      await watcher.refreshByFocus()
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toContain('bikeB')
      })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('arquivo interno alterado sem mudar lista de ids não dispara scan', async () => {
    const modsPath = makeModsTree()
    try {
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      pathsState.modsPath = modsPath
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect(watcher.getModsSnapshot().ready).toBe(true)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      const messagesBefore = messages.length

      // Adiciona um arquivo dentro da pasta do mod (não muda a lista de ids).
      fs.writeFileSync(path.join(modsPath, 'bikes', 'bikeA', 'extra.txt'), 'conteudo')

      await watcher.refreshByFocus()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(messages.length).toBe(messagesBefore)
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('equal ids including a folder with no metadata.json: no reconcile, no persist, no emit', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeNoMeta', { name: 'No Meta' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeNoMeta'])
      })
      await drainLeakedPersists(watcher)

      // The folder is still there but its metadata.json is gone, so it can no
      // longer be loaded. Its NAME is still a disk id and it is already
      // recorded, so the id set on disk is unchanged from the boot reconcile.
      const modDir = path.join(modsPath, 'bikes', 'bikeNoMeta')
      fs.rmSync(path.join(modDir, 'metadata.json'))

      // Settle every pending debounce, then freeze the baseline.
      await watcher.flushModsCache()
      const messagesBefore = messages.length
      const setCallsBefore = storeState.setCalls
      const persistedBefore = storeState.data.modsCache

      await watcher.refreshByFocus()
      await watcher.refreshByFocus()
      await sleep(100)
      // flushModsCache runs any pending dirty persist immediately, so this
      // would expose a persist caused by the focus.
      watcher.flushModsCache()

      // Gate closed: no reconcile (no new snapshot), no persist, no emit.
      expect(messages.length).toBe(messagesBefore)
      expect(storeState.setCalls).toBe(setCallsBefore)
      expect(storeState.data.modsCache).toBe(persistedBefore)
      expect(scanOneCallsFor('bikeNoMeta')).toBe(0)
      // The gate compares names, so the now-unloadable mod is NOT dropped:
      // only a watcher event or a real id change revises the cache.
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeNoMeta'])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('a metadata.json that arrives after the folder is recorded does not open the gate', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeNoMeta', { name: 'No Meta' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeNoMeta'])
      })
      await drainLeakedPersists(watcher)
      const modDir = path.join(modsPath, 'bikes', 'bikeNoMeta')
      const metadataPath = path.join(modDir, 'metadata.json')
      const initialMod = (watcher.getModsSnapshot().mods.bikes ?? [])[0]
      fs.rmSync(metadataPath)
      await watcher.flushModsCache()

      // metadata.json arrives again in the folder that already exists, so no
      // id changes: the gate stays closed and focus does no work at all.
      fs.writeFileSync(metadataPath, JSON.stringify({ id: 'bikeNoMeta', name: 'Renamed' }))
      const messagesBefore = messages.length
      await watcher.refreshByFocus()
      await sleep(100)
      expect(messages.length).toBe(messagesBefore)
      // Still the old content: focus did not re-read anything.
      expect((watcher.getModsSnapshot().mods.bikes ?? [])[0]).toEqual(initialMod)

      // The watcher event is what applies it. This is the coverage for
      // "the folder existed without metadata and metadata.json arrived
      // later": the scanOne retry path and this event path are the two ways
      // that state resolves. The focus gate deliberately covers neither.
      chokidarState.allHandler?.('add', metadataPath)
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? [])[0]).toMatchObject({
          id: 'bikeNoMeta',
          name: 'Renamed'
        })
      })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('a folder created after the last reconcile opens the gate exactly once', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)
      const messagesBefore = messages.length
      fs.mkdirSync(path.join(modsPath, 'bikes', 'bikeB'), { recursive: true })
      await watcher.refreshByFocus()
      await vi.waitFor(() => expect(messages.length).toBeGreaterThan(messagesBefore))
      await watcher.flushModsCache()

      // Second focus with the same ids: the gate is closed again.
      const messagesAfter = messages.length
      const setCallsAfter = storeState.setCalls
      const persistedAfter = storeState.data.modsCache
      await watcher.refreshByFocus()
      await sleep(100)
      watcher.flushModsCache()
      expect(messages.length).toBe(messagesAfter)
      expect(storeState.setCalls).toBe(setCallsAfter)
      expect(storeState.data.modsCache).toBe(persistedAfter)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('refreshModsNow (explicit refresh)', () => {
  it('ignores the focus gate and applies a metadata change in a known folder', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)

      // The documented gate gap: the folder and its id already exist, and only
      // metadata.json changes, with no watcher event to report it.
      fs.writeFileSync(
        path.join(modsPath, 'bikes', 'bikeA', 'metadata.json'),
        JSON.stringify({ id: 'bikeA', name: 'Renamed Bike' })
      )
      const messagesBefore = messages.length

      // Focus alone cannot see it: the id set on disk is unchanged.
      await watcher.refreshByFocus()
      await sleep(50)
      expect(messages.length).toBe(messagesBefore)
      expect((watcher.getModsSnapshot().mods.bikes ?? [])[0]).toMatchObject({ name: 'Bike A' })

      // The explicit refresh rescans anyway and reports the new content.
      await watcher.refreshModsNow()
      expect((watcher.getModsSnapshot().mods.bikes ?? [])[0]).toMatchObject({
        id: 'bikeA',
        name: 'Renamed Bike'
      })
      expect(messages.length).toBeGreaterThan(messagesBefore)
      expect(messages[messages.length - 1]).toMatchObject({ valid: true, ready: true })
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('picks up a mod the watcher never reported at all', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)

      // A whole mod folder appears with no watcher event.
      writeMod(modsPath, 'bikes', 'bikeB', { name: 'Bike B' })
      await watcher.refreshModsNow()
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id).sort()).toEqual([
        'bikeA',
        'bikeB'
      ])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('re-records the disk ids so a later focus stays closed', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)

      // New folder + refresh: recordDiskIds runs inside the refresh.
      fs.mkdirSync(path.join(modsPath, 'bikes', 'bikeB'), { recursive: true })
      await watcher.refreshModsNow()
      await drainLeakedPersists(watcher)
      const messagesAfter = messages.length

      // The gate now compares against the refreshed ids: focus is a no-op.
      await watcher.refreshByFocus()
      await sleep(100)
      watcher.flushModsCache()
      expect(messages.length).toBe(messagesAfter)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('an unchanged disk emits no mods:changed and persists nothing', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)
      const messagesBefore = messages.length
      const setCallsBefore = storeState.setCalls
      const persistedBefore = storeState.data.modsCache

      await watcher.refreshModsNow()
      await sleep(100)
      watcher.flushModsCache()

      // A refresh over an unchanged folder is completely silent: the mod list
      // stays correct and nothing reaches the renderer or the Store.
      expect(messages.length).toBe(messagesBefore)
      expect(storeState.setCalls).toBe(setCallsBefore)
      expect(storeState.data.modsCache).toBe(persistedBefore)
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('a second concurrent refresh shares the single in-flight scan', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      const messages: ModChangedMessage[] = []
      await watcher.initModsWatcher((message) => messages.push(message))
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      await drainLeakedPersists(watcher)

      // Real content for the refresh to report, so one reconcile is visible as
      // exactly one emitted snapshot.
      fs.writeFileSync(
        path.join(modsPath, 'bikes', 'bikeA', 'metadata.json'),
        JSON.stringify({ id: 'bikeA', name: 'Renamed Bike' })
      )
      const messagesBefore = messages.length

      // Double click: the second call joins the first instead of starting a
      // second scan. Identity of the promise is the proof.
      const first = watcher.refreshModsNow()
      const second = watcher.refreshModsNow()
      expect(second).toBe(first)
      await Promise.all([first, second])

      // One reconcile ran, so exactly one snapshot was emitted, not two.
      expect(messages.length - messagesBefore).toBe(1)

      // The lock is released: a later refresh scans again and stays silent,
      // because the disk no longer changed.
      const messagesAfter = messages.length
      await watcher.refreshModsNow()
      expect(messages.length).toBe(messagesAfter)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('a failed refresh keeps the current snapshot and releases the lock', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = modsPath
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})
      await vi.waitFor(() => {
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })

      // The path goes invalid while the scan runs: reconcileNow clears the
      // cache, and the stale generation fence drops the in-flight result.
      pathsState.modsPath = null
      await watcher.refreshModsNow()
      expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })

      // The lock is not stuck: a valid path can refresh again.
      pathsState.modsPath = modsPath
      await watcher.refreshModsNow()
      expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('scanOne retry', () => {
  it('retenta scan enquanto metadata.json não existe, com limite de tentativas', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        const messages: ModChangedMessage[] = []
        await watcher.initModsWatcher((message) => messages.push(message))
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))

        // Cria pasta SEM metadata.json depois do boot (prepare* não toca nela).
        fs.mkdirSync(path.join(modsPath, 'bikes', 'bikePending'), { recursive: true })

        // Dispara evento: pasta criada, mas sem metadata.
        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))

        // Debounce de 300ms → scanOne retorna null → retry agendado em 200ms.
        vi.advanceTimersByTime(300)
        await Promise.resolve()

        // Adiciona metadata.json no disco.
        fs.writeFileSync(
          path.join(modsPath, 'bikes', 'bikePending', 'metadata.json'),
          JSON.stringify({ id: 'bikePending', name: 'Bike Pending' })
        )

        // Avança o retry (200ms): agora encontra o metadata.
        vi.advanceTimersByTime(200)
        await Promise.resolve()

        await vi.waitFor(() => {
          expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toContain('bikePending')
        })
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('novo evento do mesmo mod cancela o retry pendente', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        const messages: ModChangedMessage[] = []
        await watcher.initModsWatcher((message) => messages.push(message))
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))

        // Cria pasta sem metadata depois do boot.
        fs.mkdirSync(path.join(modsPath, 'bikes', 'bikePending'), { recursive: true })

        // Primeiro evento: debounce 300ms, depois retry 200ms.
        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await Promise.resolve()

        // Novo evento para o mesmo mod antes do retry: cancela o retry original.
        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await Promise.resolve()

        // O retry original foi cancelado; o novo retry está agendado em 200ms.
        // Avança além do tempo do retry original: nada deve ter sido adicionado ainda.
        vi.advanceTimersByTime(200)
        await Promise.resolve()
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])

        // Adiciona metadata e dispara novo evento para fazer scanOne funcionar.
        fs.writeFileSync(
          path.join(modsPath, 'bikes', 'bikePending', 'metadata.json'),
          JSON.stringify({ id: 'bikePending', name: 'Bike Pending' })
        )
        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await Promise.resolve()

        await vi.waitFor(() => {
          expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toContain('bikePending')
        })
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('atinge o limite de tentativas e desiste sem erro', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        const messages: ModChangedMessage[] = []
        await watcher.initModsWatcher((message) => messages.push(message))
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))

        // Cria pasta sem metadata depois do boot.
        fs.mkdirSync(path.join(modsPath, 'bikes', 'bikePending'), { recursive: true })

        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await Promise.resolve()

        // Avança todos os retries (200+400+800+1600+3200 = 6200ms) sem metadata nunca aparecer.
        vi.advanceTimersByTime(7000)
        await Promise.resolve()

        // Nunca entrou no cache.
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops at exactly MAX_SCAN_RETRIES scanOne calls and never schedules a 6th retry', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        await watcher.initModsWatcher(() => {})
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))
        // scanOne always answers null: the mod folder never resolves.
        scanState.results.set('bikes:bikePending', null)
        scanState.scanOneCalls.length = 0

        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await flushMicrotasks()
        // 1 call from the event itself.
        expect(scanOneCallsFor('bikePending')).toBe(1)

        // MAX_SCAN_RETRIES = 5 backoff delays: 200, 400, 800, 1600, 3200.
        for (const delay of [200, 400, 800, 1600, 3200]) {
          vi.advanceTimersByTime(delay)
          await flushMicrotasks()
        }
        expect(scanOneCallsFor('bikePending')).toBe(6)

        // Far beyond the last backoff: the limit holds, no timer is left.
        vi.advanceTimersByTime(60_000)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(6)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new event for the same {type, id} cancels the pending retry and restarts the budget', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        await watcher.initModsWatcher(() => {})
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))
        scanState.results.set('bikes:bikePending', null)
        scanState.scanOneCalls.length = 0

        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(1)

        // First retry fires, second retry is now pending at +400ms.
        vi.advanceTimersByTime(200)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(2)

        // A new event for the same mod cancels the pending retry and clears
        // its counter; the debounce re-scans after 300ms instead.
        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikePending'))
        vi.advanceTimersByTime(300)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(3)

        // The cancelled retry never fires. The proof is the timing, not just
        // the count: had the counter continued at 2, the next retry would
        // only be 400ms after this scan. It restarts at 200ms instead, so
        // the call is still absent at +199ms and lands exactly at +200ms.
        vi.advanceTimersByTime(199)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(3)
        vi.advanceTimersByTime(1)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(4)

        // And the restarted budget is a full one again: 4 more retries reach
        // exactly MAX_SCAN_RETRIES, with no 6th timer left behind.
        for (const delay of [400, 800, 1600, 3200]) {
          vi.advanceTimersByTime(delay)
          await flushMicrotasks()
        }
        expect(scanOneCallsFor('bikePending')).toBe(8)
        vi.advanceTimersByTime(60_000)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikePending')).toBe(8)
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('a cached mod whose scanOne returns null is removed with no retry at all', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
        const watcher = await freshWatcher()
        const messages: ModChangedMessage[] = []
        await watcher.initModsWatcher((message) => messages.push(message))
        await vi.waitFor(() => {
          expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
        })
        scanState.scanOneCalls.length = 0
        const messagesBefore = messages.length

        // The folder is gone: scanOne answers null for a mod already cached.
        scanState.results.set('bikes:bikeA', null)
        chokidarState.allHandler?.('unlinkDir', path.join(modsPath, 'bikes', 'bikeA'))
        vi.advanceTimersByTime(300)
        await flushMicrotasks()

        expect(scanOneCallsFor('bikeA')).toBe(1)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])
        expect(messages).toContainEqual({ type: 'bikes', upserted: [], removed: ['bikeA'] })
        expect(messages.length).toBe(messagesBefore + 1)

        // A removal is final: no retry is scheduled for a cached mod.
        vi.advanceTimersByTime(60_000)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikeA')).toBe(1)
        expect(messages.length).toBe(messagesBefore + 1)
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a scan result that lands after a resync changed resyncGeneration', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        const watcher = await freshWatcher()
        const messages: ModChangedMessage[] = []
        await watcher.initModsWatcher((message) => messages.push(message))
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))

        // Park the scan so its result lands only after the resync below.
        let release: (value: unknown) => void = () => {}
        scanState.hold = {
          key: 'bikes:bikeLate',
          promise: new Promise((resolve) => {
            release = resolve
          })
        }
        scanState.scanOneCalls.length = 0

        chokidarState.allHandler?.('add', path.join(modsPath, 'bikes', 'bikeLate'))
        vi.advanceTimersByTime(300)
        await flushMicrotasks()
        expect(scanOneCallsFor('bikeLate')).toBe(1)
        // Still in flight: nothing was applied.
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual([])

        // The mods path becomes invalid, resync bumps the generation and
        // clears the cache while the scan is still in flight.
        pathsState.modsPath = null
        await watcher.refreshModsWatcher()
        expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })

        // The stale scan now resolves with a valid mod.
        release(bikeEntry('bikeLate', 'Bike Late'))
        await flushMicrotasks()
        vi.advanceTimersByTime(60_000)
        await flushMicrotasks()

        // The stale result is discarded: it never repopulates cleared entries
        // and never schedules a retry.
        expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })
        expect(scanOneCallsFor('bikeLate')).toBe(1)
        expect(messages.some((message) => isDiff(message) && message.upserted.length > 0)).toBe(false)
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('regression: boot with null path recovers without restart', () => {
  it('getModsSnapshotFresh resyncs once the path validates', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = null
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})
      expect(watcher.getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })

      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      pathsState.modsPath = modsPath
      await vi.waitFor(async () => {
        const fresh = await watcher.getModsSnapshotFresh()
        expect((fresh.mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      })
      expect((await watcher.getModsSnapshotFresh()).valid).toBe(true)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })

  it('concurrent refreshes share a single resync', async () => {
    const modsPath = makeModsTree()
    try {
      pathsState.modsPath = null
      const watcher = await freshWatcher()
      await watcher.initModsWatcher(() => {})
      writeMod(modsPath, 'bikes', 'bikeA', { name: 'Bike A' })
      pathsState.modsPath = modsPath

      await Promise.all([
        watcher.getModsSnapshotFresh(),
        watcher.getModsSnapshotFresh(),
        watcher.refreshModsWatcher()
      ])
      expect(chokidarState.watchCalls.length).toBe(1)
      await watcher.stopModsWatcher()
    } finally {
      fs.rmSync(modsPath, { recursive: true, force: true })
    }
  })
})

describe('event debounce', () => {
  it('collapses 200 internal events for one mod into a single scanOne', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        writeMod(modsPath, 'bikes', 'NovaMoto', { name: 'NovaMoto' })
        const watcher = await freshWatcher()
        await watcher.initModsWatcher(() => {})
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))
        scanState.scanOneCalls.length = 0

        const modDir = path.join(modsPath, 'bikes', 'NovaMoto')
        const internalPaths: string[] = [path.join(modDir, 'metadata.json'), path.join(modDir, 'preview.png')]
        for (let i = 0; i < 198; i += 1) {
          internalPaths.push(path.join(modDir, 'paints', `paint${i}.png`))
        }
        expect(internalPaths).toHaveLength(200)
        for (const fullPath of internalPaths) {
          chokidarState.allHandler?.('change', fullPath)
        }

        // Every event resolves to { type: 'bikes', id: 'NovaMoto' }, and each
        // one only restarts the same 300ms debounce timer.
        expect(scanOneCallsFor('NovaMoto')).toBe(0)
        vi.advanceTimersByTime(299)
        await flushMicrotasks()
        expect(scanOneCallsFor('NovaMoto')).toBe(0)
        vi.advanceTimersByTime(1)
        await flushMicrotasks()
        expect(scanOneCallsFor('NovaMoto')).toBe(1)

        // One scan applied the whole burst: no follow-up scans, no retries.
        vi.advanceTimersByTime(60_000)
        await flushMicrotasks()
        expect(scanOneCallsFor('NovaMoto')).toBe(1)
        expect((watcher.getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['NovaMoto'])
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('debounces per mod, so a burst on two mods still yields one scan each', async () => {
    vi.useFakeTimers()
    try {
      const modsPath = makeModsTree()
      try {
        pathsState.modsPath = modsPath
        writeMod(modsPath, 'bikes', 'NovaMoto', { name: 'NovaMoto' })
        writeMod(modsPath, 'bikes', 'Vespa', { name: 'Vespa' })
        const watcher = await freshWatcher()
        await watcher.initModsWatcher(() => {})
        await vi.waitFor(() => expect(watcher.getModsSnapshot().ready).toBe(true))
        scanState.scanOneCalls.length = 0

        for (let i = 0; i < 50; i += 1) {
          chokidarState.allHandler?.('change', path.join(modsPath, 'bikes', 'NovaMoto', `a${i}.png`))
          chokidarState.allHandler?.('change', path.join(modsPath, 'bikes', 'Vespa', `b${i}.png`))
        }
        vi.advanceTimersByTime(300)
        await flushMicrotasks()

        expect(scanOneCallsFor('NovaMoto')).toBe(1)
        expect(scanOneCallsFor('Vespa')).toBe(1)
        await watcher.stopModsWatcher()
      } finally {
        fs.rmSync(modsPath, { recursive: true, force: true })
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
