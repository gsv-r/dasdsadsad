import { beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import type { ModChangedMessage, ModDiff } from '../types/mods.js'

const electronState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  userData: '',
  windowOptions: null as unknown,
  windowInstance: null as unknown
}))

const chokidarState = vi.hoisted(() => ({
  watchCalls: 0,
  closeCalls: 0
}))

vi.mock('electron', () => {
  const appMock = {
    getPath: vi.fn((): string => electronState.userData),
    getVersion: vi.fn(() => '0.0.0-test'),
    whenReady: vi.fn((): Promise<void> => new Promise(() => {})),
    on: vi.fn()
  }
  const ipcMainMock = {
    handle: vi.fn((channel: string, listener: (...args: never[]) => unknown) => {
      electronState.handlers.set(channel, listener)
    }),
    on: vi.fn()
  }
  class BrowserWindowMock {
    constructor(options: unknown) {
      electronState.windowOptions = options
      electronState.windowInstance = this
    }
    static getAllWindows(): unknown[] {
      return []
    }
    isMaximized = vi.fn(() => false)
    isDestroyed = vi.fn(() => false)
    minimize = vi.fn()
    maximize = vi.fn()
    unmaximize = vi.fn()
    close = vi.fn()
    show = vi.fn()
    loadFile = vi.fn()
    loadURL = vi.fn()
    on = vi.fn((_name: string, _listener: () => void) => {})
    once = vi.fn((_name: string, _listener: () => void) => {})
    webContents = {
      send: vi.fn(),
      reload: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      once: vi.fn((_name: string, _listener: () => void) => {})
    }
  }
  const api = {
    app: appMock,
    shell: { openExternal: vi.fn() },
    BrowserWindow: BrowserWindowMock,
    ipcMain: ipcMainMock,
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    net: { fetch: vi.fn() }
  }
  return { __esModule: true, ...api, default: api }
})

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
  is: { dev: false }
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: { on: vi.fn(), once: vi.fn() } },
  autoUpdater: { on: vi.fn(), once: vi.fn() }
}))

vi.mock('chokidar', () => ({
  default: {
    watch: () => {
      chokidarState.watchCalls += 1
      return {
        on: () => {},
        close: async (): Promise<void> => {
          chokidarState.closeCalls += 1
        }
      }
    }
  }
}))

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const found = electronState.handlers.get(channel)
  if (!found) throw new Error(`No handler registered for ${channel}`)
  return found as (...args: unknown[]) => Promise<unknown>
}

function writeMod(modsPath: string, subdir: string, id: string): void {
  const dir = path.join(modsPath, subdir, id)
  fs.mkdirSync(path.join(dir, 'paints'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ id, name: id }))
}

// Full required mods structure (bikes, misc, rider, tracks, tires).
function makeValidModsTree(): string {
  const modsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-launch-'))
  for (const sub of ['bikes', 'misc', 'rider', 'tracks', 'tires']) {
    fs.mkdirSync(path.join(modsPath, sub), { recursive: true })
  }
  return modsPath
}

function isDiff(message: ModChangedMessage): message is ModDiff {
  return typeof (message as ModDiff).type === 'string'
}

const messages: ModChangedMessage[] = []
let scratch = ''
let validMods = ''
let gameDir = ''

beforeAll(async () => {
  electronState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-launch-store-'))
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-launch-scratch-'))
  validMods = makeValidModsTree()
  writeMod(validMods, 'bikes', 'bikeA')

  const steamExe = path.join(scratch, 'steam.exe')
  fs.writeFileSync(steamExe, 'fake')
  gameDir = path.join(scratch, 'game')
  fs.mkdirSync(gameDir, { recursive: true })
  fs.writeFileSync(path.join(gameDir, 'gpbikes.exe'), 'fake')

  await import('./index.js')
  const { store } = await import('./store.js')
  store.set('paths.steam', steamExe)
  store.set('paths.game', gameDir)
  store.set('paths.mods', validMods)

  const { initModsWatcher } = await import('./functions/modsWatcher.js')
  await initModsWatcher((message) => messages.push(message))
  await vi.waitFor(async () => {
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
  })
})

describe('Go Ride with an invalid mods path', () => {
  it('fails launch with the current message and resets the mods cache', async () => {
    const invalidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-launch-invalid-'))
    const { store } = await import('./store.js')
    // Direct store write: bypasses the store:set IPC handler so only the
    // launch validation can trigger the reset.
    store.set('paths.mods', invalidDir)

    await expect(handler('launch')()).rejects.toThrow(/invalid.*Mods Path|Mods.*invalid/i)
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    expect(getModsSnapshot()).toEqual({ valid: false, ready: false, mods: {} })
    expect(store.get('modsCache')).toMatchObject({ valid: false, mods: {} })
    expect(messages).toContainEqual({ valid: false, ready: false, mods: {} })
    expect(chokidarState.closeCalls).toBeGreaterThan(0)

    fs.rmSync(invalidDir, { recursive: true, force: true })
  })
})

describe('Go Ride failing for another reason', () => {
  it('leaves a valid mods cache untouched', async () => {
    const { store } = await import('./store.js')
    store.set('paths.mods', validMods)
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    await vi.waitFor(() => {
      expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
    })
    const before = messages.length

    // Break the game instead of the mods path.
    fs.rmSync(path.join(gameDir, 'gpbikes.exe'), { force: true })
    try {
      await expect(handler('launch')()).rejects.toThrow(/was not found inside the configured Game Path/)
      expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeA'])
      expect(messages.slice(before).some((m) => !isDiff(m) && !m.valid)).toBe(false)
    } finally {
      fs.writeFileSync(path.join(gameDir, 'gpbikes.exe'), 'fake')
    }
  })
})

describe('mods path corrected in Settings', () => {
  it('restarts the watcher and repopulates the cache from empty', async () => {
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    expect(getModsSnapshot().valid).toBe(true)
    // Empty the cache through the store:set IPC handler with a fresh folder.
    const fresh = makeValidModsTree()
    writeMod(fresh, 'bikes', 'bikeB')
    try {
      await handler('store:set')(undefined, 'paths.mods', fresh)
      await vi.waitFor(() => {
        expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeB'])
      })
      expect(getModsSnapshot()).toMatchObject({ valid: true, ready: true })
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true })
    }
  })
})

describe('store:set refuses an invalid manual mods path', () => {
  it('keeps the stored value, the resolved path and the cache untouched', async () => {
    const { store } = await import('./store.js')
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    const { getResolvedModsPath } = await import('./functions/paths.js')
    // Restore a valid folder first: earlier suites leave varied state behind.
    // Direct store write: bypasses the store:set IPC handler on purpose.
    store.set('paths.mods', validMods)
    await vi.waitFor(() => {
      expect(getModsSnapshot()).toMatchObject({ valid: true, ready: true })
      expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toContain('bikeA')
    })
    const closesBefore = chokidarState.closeCalls

    // A partial keystroke must never persist. The handler reports the
    // refusal instead of throwing, before any write or watcher refresh.
    expect(handler('store:set')(undefined, 'paths.mods', `${validMods}-partial`)).toEqual({
      ok: false,
      reason: 'invalid-mods-folder'
    })
    expect(store.get('paths.mods')).toBe(validMods)
    expect(getResolvedModsPath()).toBe(validMods)
    expect(getModsSnapshot()).toMatchObject({ valid: true, ready: true })
    expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toContain('bikeA')
    expect(chokidarState.closeCalls).toBe(closesBefore)
  })

  it('persists a valid folder with a single watcher refresh', async () => {
    const { store } = await import('./store.js')
    const { getModsSnapshot } = await import('./functions/modsWatcher.js')
    const fresh = makeValidModsTree()
    writeMod(fresh, 'bikes', 'bikeC')
    try {
      const closesBefore = chokidarState.closeCalls
      expect(await handler('store:set')(undefined, 'paths.mods', fresh)).toEqual({ ok: true })
      await vi.waitFor(() => {
        expect((getModsSnapshot().mods.bikes ?? []).map((b) => b.id)).toEqual(['bikeC'])
      })
      expect(store.get('paths.mods')).toBe(fresh)
      expect(chokidarState.closeCalls - closesBefore).toBe(1)
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true })
    }
  })

  it('still allows clearing the manual value with null', async () => {
    const { store } = await import('./store.js')
    expect(await handler('store:set')(undefined, 'paths.mods', null)).toEqual({ ok: true })
    expect(store.get('paths.mods')).toBeNull()
  })
})

describe('setup guard on practice handlers', () => {
  it('blocks the 7 setup fields with setup-locked and leaves track/layout free', async () => {
    const base = {
      name: 'Guard Test',
      bike_id: 'bikeA',
      bike_paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    }
    expect(await handler('setups:create')(undefined, base)).toEqual({ ok: true })
    const setups = (await handler('setups:list')()) as Array<{ id: string }>
    const id = setups[setups.length - 1].id
    expect(await handler('setups:select')(undefined, id)).toEqual({
      ok: true,
      applied: {
        bike_id: 'bikeA',
        bike_paint: '',
        rider: 'modern',
        helmet: 'default',
        helmet_paint: '',
        suit_paint: '',
        riding_style: 'modern'
      }
    })
    try {
      expect(await handler('practice:select-bike')(undefined, 'bikeA', [])).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:set-bike-paint')(undefined, '')).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:select-rider')(undefined, 'modern', [])).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:select-helmet')(undefined, 'default', [])).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:set-helmet-paint')(undefined, '')).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:set-suit-paint')(undefined, '')).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      expect(await handler('practice:select-riding-style')(undefined, 'modern')).toEqual({
        ok: false,
        reason: 'setup-locked'
      })
      // Track and layout stay free with an active setup.
      await handler('practice:select-track')(undefined, 'Adriatic', [])
      await handler('practice:set-track-layout')(undefined, '')
    } finally {
      await handler('setups:select')(undefined, null)
      await handler('setups:delete')(undefined, id)
    }
  })

  it('orphan setup_id does not block and gets cleared on guard check', async () => {
    const { store } = await import('./store.js')
    store.set('practice.setup_id', 'orphan-id')
    const result = (await handler('practice:select-bike')(undefined, 'bikeA', [])) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
    expect(store.get('practice.setup_id')).toBeNull()
  })
})

describe('setups IPC validation', () => {
  it('setups:create with non-string fields returns write-failed, not invalid-name', async () => {
    const bad = {
      name: 'Bad Types',
      bike_id: 123,
      bike_paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    }
    expect(await handler('setups:create')(undefined, bad)).toEqual({
      ok: false,
      reason: 'write-failed'
    })
  })

  it('setups:update with unknown id returns setup-not-found', async () => {
    expect(await handler('setups:update')(undefined, 'does-not-exist', { name: 'X' })).toEqual({
      ok: false,
      reason: 'setup-not-found'
    })
  })

  it('setups:update with non-string field returns write-failed, not invalid-name', async () => {
    const base = {
      name: 'Type Check',
      bike_id: 'bikeA',
      bike_paint: '',
      rider: 'modern',
      helmet: 'default',
      helmet_paint: '',
      suit_paint: '',
      riding_style: 'modern'
    }
    expect(await handler('setups:create')(undefined, base)).toEqual({ ok: true })
    const setups = (await handler('setups:list')()) as Array<{ id: string }>
    const id = setups[setups.length - 1].id
    try {
      expect(await handler('setups:update')(undefined, id, { bike_id: 123 })).toEqual({
        ok: false,
        reason: 'write-failed'
      })
    } finally {
      await handler('setups:delete')(undefined, id)
    }
  })

  it('setups:delete with unknown id returns setup-not-found', async () => {
    expect(await handler('setups:delete')(undefined, 'does-not-exist')).toEqual({
      ok: false,
      reason: 'setup-not-found'
    })
  })
})

describe('store:get allowlist', () => {
  it('reads an allowlisted key', async () => {
    const { store } = await import('./store.js')
    expect(await handler('store:get')(undefined, 'practice.bike')).toEqual(
      store.get('practice.bike')
    )
  })

  it('throws a fixed message without echoing unknown or non-string keys', async () => {
    for (const key of ['modsCache', 'paths', 'pathsAuto', 'setups', 'nope']) {
      let error: unknown = null
      try {
        await handler('store:get')(undefined, key)
      } catch (thrown: unknown) {
        error = thrown
      }
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Invalid store key.')
      expect(String(error)).not.toContain(key)
    }
    let error: unknown = null
    try {
      await handler('store:get')(undefined, 123)
    } catch (thrown: unknown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Invalid store key.')
  })
})

describe('store:set allowlist and value schemas', () => {
  it('persists allowed keys with valid values and restores them', async () => {
    const { store } = await import('./store.js')
    const beforeSteam = store.get('paths.steam')
    const beforeTemp = store.get('practice.settings.temperature')
    try {
      expect(await handler('store:set')(undefined, 'paths.steam', 'C:\\steam')).toEqual({
        ok: true
      })
      expect(store.get('paths.steam')).toBe('C:\\steam')
      expect(await handler('store:set')(undefined, 'practice.settings.temperature', 20)).toEqual({
        ok: true
      })
      expect(store.get('practice.settings.temperature')).toBe(20)
      expect(await handler('store:set')(undefined, 'pathsAuto.mods', null)).toEqual({ ok: true })
    } finally {
      store.set('paths.steam', beforeSteam)
      store.set('practice.settings.temperature', beforeTemp)
    }
  })

  it.each([
    ['paths.steam', 123],
    ['paths.game', undefined],
    ['pathsAuto.game', {}],
    ['paths.mods', 123],
    ['paths.profile', {}],
    ['profile.nationality', 123],
    ['practice.settings.temperature', '25'],
    ['practice.settings.wind_speed', null]
  ])('rejects a mistyped value for %s with invalid-value', async (key, value) => {
    expect(await handler('store:set')(undefined, key, value)).toEqual({
      ok: false,
      reason: 'invalid-value'
    })
  })

  it.each([['paths'], ['pathsAuto'], ['modsCache'], ['setups'], ['practice'], ['nope']])(
    'rejects %s with unknown-key and writes nothing',
    async (key) => {
      expect(await handler('store:set')(undefined, key, { hacked: true })).toEqual({
        ok: false,
        reason: 'unknown-key'
      })
    }
  )

  it('rejects a non-string key with unknown-key', async () => {
    expect(await handler('store:set')(undefined, 123, 'x')).toEqual({
      ok: false,
      reason: 'unknown-key'
    })
  })

  it('keeps the mods and profile gates with their existing reasons', async () => {
    const invalidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-allowlist-'))
    try {
      expect(await handler('store:set')(undefined, 'paths.mods', invalidDir)).toEqual({
        ok: false,
        reason: 'invalid-mods-folder'
      })
      expect(await handler('store:set')(undefined, 'paths.profile', invalidDir)).toEqual({
        ok: false,
        reason: 'invalid-profile-folder'
      })
    } finally {
      fs.rmSync(invalidDir, { recursive: true, force: true })
    }
  })
})

describe('practice arg validation', () => {
  async function practiceState(): Promise<{ bike: unknown; track: unknown }> {
    const { store } = await import('./store.js')
    return {
      bike: JSON.parse(JSON.stringify(store.get('practice.bike'))),
      track: JSON.parse(JSON.stringify(store.get('practice.track')))
    }
  }

  async function restorePractice(bike: unknown, track: unknown): Promise<void> {
    const { store } = await import('./store.js')
    store.set('practice.bike', bike)
    store.set('practice.track', track)
  }

  async function invokeError(channel: string, ...args: unknown[]): Promise<unknown> {
    try {
      await handler(channel)(undefined, ...args)
    } catch (thrown: unknown) {
      return thrown
    }
    return null
  }

  const INVALID_CASES: Array<{ channel: string; message: string; args: unknown[]; raw: string }> = [
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: [987654, []], raw: '987654' },
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: [['zzArr9'], []], raw: 'zzArr9' },
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: ['../escape-1b', []], raw: 'escape-1b' },
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: ['bikeA', 'zzStr9'], raw: 'zzStr9' },
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: ['bikeA', [987654]], raw: '987654' },
    { channel: 'practice:select-bike', message: 'Invalid bike selection.', args: [], raw: 'undefined' },
    { channel: 'practice:select-track', message: 'Invalid track selection.', args: [987654, []], raw: '987654' },
    { channel: 'practice:select-track', message: 'Invalid track selection.', args: ['../escape-1b', []], raw: 'escape-1b' },
    { channel: 'practice:select-track', message: 'Invalid track selection.', args: ['trackA', [987654]], raw: '987654' },
    { channel: 'practice:select-track', message: 'Invalid track selection.', args: [], raw: 'undefined' },
    { channel: 'practice:set-bike-paint', message: 'Invalid bike paint selection.', args: [987654], raw: '987654' },
    { channel: 'practice:set-bike-paint', message: 'Invalid bike paint selection.', args: [], raw: 'undefined' },
    { channel: 'practice:set-bike-paint', message: 'Invalid bike paint selection.', args: ['a/b'], raw: 'a/b' },
    { channel: 'practice:set-track-layout', message: 'Invalid track layout selection.', args: [987654], raw: '987654' },
    { channel: 'practice:set-track-layout', message: 'Invalid track layout selection.', args: [], raw: 'undefined' },
    { channel: 'practice:select-helmet', message: 'Invalid helmet selection.', args: [987654, []], raw: '987654' },
    { channel: 'practice:select-helmet', message: 'Invalid helmet selection.', args: ['h', [987654]], raw: '987654' },
    { channel: 'practice:select-helmet', message: 'Invalid helmet selection.', args: [], raw: 'undefined' },
    { channel: 'practice:set-helmet-paint', message: 'Invalid helmet paint selection.', args: [987654], raw: '987654' },
    { channel: 'practice:set-helmet-paint', message: 'Invalid helmet paint selection.', args: [], raw: 'undefined' },
    { channel: 'practice:select-rider', message: 'Invalid rider selection.', args: [987654, []], raw: '987654' },
    { channel: 'practice:select-rider', message: 'Invalid rider selection.', args: ['s', [987654]], raw: '987654' },
    { channel: 'practice:select-rider', message: 'Invalid rider selection.', args: [], raw: 'undefined' },
    { channel: 'practice:set-suit-paint', message: 'Invalid suit paint selection.', args: [987654], raw: '987654' },
    { channel: 'practice:set-suit-paint', message: 'Invalid suit paint selection.', args: [], raw: 'undefined' },
    { channel: 'practice:select-riding-style', message: 'Invalid riding style selection.', args: [987654], raw: '987654' },
    { channel: 'practice:select-riding-style', message: 'Invalid riding style selection.', args: [], raw: 'undefined' },
    { channel: 'practice:select-riding-style', message: 'Invalid riding style selection.', args: ['a:b'], raw: 'a:b' }
  ]

  it.each(INVALID_CASES)(
    '$channel throws the fixed message without running or echoing ($raw)',
    async ({ channel, message, args, raw }) => {
      await handler('setups:select')(undefined, null)
      const before = await practiceState()
      const error = await invokeError(channel, ...args)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(message)
      expect(String(error)).not.toContain(raw)
      expect(await practiceState()).toEqual(before)
    }
  )

  it('passes real-form values through with the same args as before', async () => {
    const { store } = await import('./store.js')
    await handler('setups:select')(undefined, null)
    const before = await practiceState()
    try {
      expect(await handler('practice:select-bike')(undefined, 'pbBike1b', ['pbPaint1b'])).toEqual({
        ok: true
      })
      expect(store.get('practice.bike.bike_id')).toBe('pbBike1b')
      expect(await handler('practice:select-bike')(undefined, 'pbBike1b')).toEqual({ ok: true })
      expect(await handler('practice:select-bike')(undefined, 'pbBike1b', null)).toEqual({
        ok: true
      })
      expect(await handler('practice:select-track')(undefined, 'pbTrack1b', [])).toBeUndefined()
      expect(store.get('practice.track.track_id')).toBe('pbTrack1b')
      expect(await handler('practice:set-bike-paint')(undefined, '')).toEqual({ ok: true })
      expect(store.get('practice.bike.paint')).toBe('')
      expect(await handler('practice:set-bike-paint')(undefined, 'pbPaint1b')).toEqual({
        ok: true
      })
      expect(store.get('practice.bike.paint')).toBe('pbPaint1b')
      expect(await handler('practice:set-track-layout')(undefined, 'pbLayout1b')).toBeUndefined()
      expect(store.get('practice.track.track_layout')).toBe('pbLayout1b')
      expect(await handler('practice:select-helmet')(undefined, 'pbHelmet1b', [])).toEqual({
        ok: true
      })
      expect(store.get('practice.bike.helmet')).toBe('pbHelmet1b')
      expect(await handler('practice:set-helmet-paint')(undefined, 'pbHP1b')).toEqual({ ok: true })
      expect(store.get('practice.bike.helmet_paint')).toBe('pbHP1b')
      expect(await handler('practice:select-rider')(undefined, 'pbRider1b', [])).toEqual({
        ok: true
      })
      expect(store.get('practice.bike.rider')).toBe('pbRider1b')
      expect(await handler('practice:set-suit-paint')(undefined, 'pbSP1b')).toEqual({ ok: true })
      expect(store.get('practice.bike.suit_paint')).toBe('pbSP1b')
      expect(await handler('practice:select-riding-style')(undefined, 'pbStyle1b')).toEqual({
        ok: true
      })
      expect(store.get('practice.bike.riding_style')).toBe('pbStyle1b')
    } finally {
      await restorePractice(before.bike, before.track)
    }
  })
})

describe('profiles:save validation', () => {
  it.each([[123], [null], [[]]])(
    'rejects a mistyped id with invalid-id: %s',
    async (id) => {
      expect(await handler('profiles:save')(undefined, { id, name: 'Rider', raceNumber: '7' })).toEqual({
        ok: false,
        reason: 'invalid-id'
      })
    }
  )

  it.each([[123], [null], [[]]])('rejects a mistyped name with invalid-name: %s', async (name) => {
    expect(await handler('profiles:save')(undefined, { id: 'Rider', name, raceNumber: '7' })).toEqual(
      {
        ok: false,
        reason: 'invalid-name'
      }
    )
  })

  it.each([[123], [null], [[]]])(
    'rejects a mistyped race number with invalid-race-number: %s',
    async (raceNumber) => {
      expect(
        await handler('profiles:save')(undefined, { id: 'Rider', name: 'Rider', raceNumber })
      ).toEqual({ ok: false, reason: 'invalid-race-number' })
    }
  )

  it.each([[undefined], [null], ['x'], [[]], [{}]])('rejects a missing object: %s', async (args) => {
    expect(await handler('profiles:save')(undefined, args)).toEqual({
      ok: false,
      reason: 'invalid-id'
    })
  })

  it('applies field priority id, then name, then race number', async () => {
    expect(await handler('profiles:save')(undefined, { id: 1, name: 2, raceNumber: 3 })).toEqual({
      ok: false,
      reason: 'invalid-id'
    })
    expect(
      await handler('profiles:save')(undefined, { id: 'Rider', name: 2, raceNumber: 3 })
    ).toEqual({ ok: false, reason: 'invalid-name' })
    expect(
      await handler('profiles:save')(undefined, { id: 'Rider', name: 'Rider', raceNumber: 3 })
    ).toEqual({ ok: false, reason: 'invalid-race-number' })
  })
})

describe('setups:create/update validation', () => {
  const fullArgs = {
    name: 'Schema Valid 2b',
    bike_id: 'bikeA',
    bike_paint: '',
    rider: 'modern',
    helmet: 'default',
    helmet_paint: '',
    suit_paint: '',
    riding_style: 'modern'
  }

  async function listIds(): Promise<string[]> {
    const list = (await handler('setups:list')()) as Array<{ id: string }>
    return list.map((s) => s.id)
  }

  async function cleanupNew(before: string[]): Promise<void> {
    for (const id of await listIds()) {
      if (!before.includes(id)) await handler('setups:delete')(undefined, id)
    }
  }

  it('creates with valid args and drops unknown keys', async () => {
    const before = await listIds()
    try {
      expect(
        await handler('setups:create')(undefined, { ...fullArgs, hacked: true })
      ).toEqual({ ok: true })
      const after = (await handler('setups:list')()) as Array<Record<string, unknown>>
      const created = after.find((s) => !before.includes(s['id'] as string))
      expect(created).toBeDefined()
      expect('hacked' in (created ?? {})).toBe(false)
    } finally {
      await cleanupNew(before)
    }
  })

  it.each([[null], ['x']])('rejects a mistyped object with write-failed: %s', async (args) => {
    expect(await handler('setups:create')(undefined, args)).toEqual({
      ok: false,
      reason: 'write-failed'
    })
  })

  it('reports invalid-name for an array, like the old destructure did', async () => {
    expect(await handler('setups:create')(undefined, [])).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
  })

  it('rejects a missing or mistyped name with invalid-name', async () => {
    const { name: _dropped, ...rest } = fullArgs
    expect(await handler('setups:create')(undefined, rest)).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
    expect(await handler('setups:create')(undefined, { ...fullArgs, name: 7 })).toEqual({
      ok: false,
      reason: 'invalid-name'
    })
  })

  it('rejects a mistyped field with write-failed', async () => {
    expect(await handler('setups:create')(undefined, { ...fullArgs, bike_id: 7 })).toEqual({
      ok: false,
      reason: 'write-failed'
    })
  })

  it('updates with valid partial args and keeps the contract', async () => {
    const before = await listIds()
    try {
      expect(await handler('setups:create')(undefined, fullArgs)).toEqual({ ok: true })
      const id = (await listIds()).find((candidate) => !before.includes(candidate)) as string
      expect(await handler('setups:update')(undefined, id, { bike_id: 'bikeB' })).toEqual({
        ok: true
      })
      expect(await handler('setups:update')(undefined, id, {})).toEqual({ ok: true })
      expect(await handler('setups:update')(undefined, id, { bike_id: undefined })).toEqual({
        ok: false,
        reason: 'write-failed'
      })
      expect(await handler('setups:update')(undefined, id, { bike_id: 7 })).toEqual({
        ok: false,
        reason: 'write-failed'
      })
      expect(await handler('setups:update')(undefined, id, 'x')).toEqual({
        ok: false,
        reason: 'write-failed'
      })
      expect(await handler('setups:update')(undefined, 'missing-id', { bike_id: 'x' })).toEqual({
        ok: false,
        reason: 'setup-not-found'
      })
      expect(await handler('setups:update')(undefined, 7, { bike_id: 'x' })).toEqual({
        ok: false,
        reason: 'setup-not-found'
      })
    } finally {
      await cleanupNew(before)
    }
  })

  it('accepts arrays like the previous gate did, without changing the result', async () => {
    const before = await listIds()
    try {
      expect(await handler('setups:create')(undefined, fullArgs)).toEqual({ ok: true })
      const id = (await listIds()).find((candidate) => !before.includes(candidate)) as string
      expect(await handler('setups:update')(undefined, id, [])).toEqual({ ok: true })
      expect(await handler('setups:update')(undefined, 'missing-id', [])).toEqual({
        ok: false,
        reason: 'setup-not-found'
      })
      expect(await handler('setups:update')(undefined, id, new Date(0))).toEqual({ ok: true })
    } finally {
      await cleanupNew(before)
    }
  })
})
