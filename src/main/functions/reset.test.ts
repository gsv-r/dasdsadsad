import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => {
  const dirs = { appData: '', userData: '' }
  const appMock = {
    getPath: vi.fn((name: string) => (name === 'userData' ? dirs.userData : dirs.appData)),
    getVersion: vi.fn(() => '0.0.0-test')
  }
  const ipcMainMock = { on: vi.fn() }
  return { appMock, dirs, ipcMainMock }
})

vi.mock('electron', () => ({
  app: mocks.appMock,
  ipcMain: mocks.ipcMainMock,
  default: { app: mocks.appMock, ipcMain: mocks.ipcMainMock }
}))

async function freshReset(): Promise<typeof import('./reset.js')> {
  vi.resetModules()
  return import('./reset.js')
}

async function freshStore(): Promise<typeof import('../store.js')> {
  vi.resetModules()
  return import('../store.js')
}

function configPath(): string {
  return path.join(mocks.dirs.userData, 'config.json')
}

function cacheFile(): string {
  return path.join(mocks.dirs.userData, 'Cache', 'No_Vary_Search', 'journal.baj')
}

beforeAll(() => {
  // Fake Roaming profile: launcher-owned config.json plus Chromium-owned
  // Cache files that must be preserved by the reset.
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-reset-'))
  mocks.dirs.appData = appData
  mocks.dirs.userData = path.join(appData, 'knee-down-test')
  fs.mkdirSync(path.dirname(cacheFile()), { recursive: true })
  fs.writeFileSync(cacheFile(), 'locked-while-running')
})

afterAll(() => {
  fs.rmSync(mocks.dirs.appData, { recursive: true, force: true })
})

beforeEach(() => {
  mocks.appMock.getPath.mockImplementation((name: string) =>
    name === 'userData' ? mocks.dirs.userData : mocks.dirs.appData
  )
})

describe('resetLauncher', () => {
  it('full flow: restores defaults and deletes nothing without restarting', async () => {
    const initial = await freshStore()
    initial.store.set('practice.bike.bike_id', 'custom_bike')
    initial.store.set('practice.track.track_id', 'custom_track')
    initial.store.set('practice.track.track_layout', 'custom_layout')
    initial.store.set('paths.steam', 'C:\\custom\\steam.exe')
    initial.store.set('paths.profile', 'C:\\custom\\profiles')
    initial.store.set('pathsAuto.profile', 'C:\\custom\\auto-profiles')
    initial.store.set('profile.nationality', 'br')
    initial.store.set('setup.bike.name', 'Custom Bike')
    initial.store.set('setup.track.name', 'Custom Track')
    expect(initial.store.get('practice.bike.bike_id')).toBe('custom_bike')

    const { resetLauncher } = await freshReset()
    resetLauncher()

    // Every launcher-owned section is back to its initial default.
    const {
      store,
      DEFAULT_PRACTICE_STATE,
      DEFAULT_SETUP,
      DEFAULT_PATHS,
      DEFAULT_PATHS_AUTO,
      DEFAULT_PROFILE
    } = await import('../store.js')
    expect(store.get('practice')).toEqual(DEFAULT_PRACTICE_STATE)
    expect(store.get('setup')).toEqual(DEFAULT_SETUP)
    expect(store.get('paths')).toEqual(DEFAULT_PATHS)
    expect(store.get('pathsAuto')).toEqual(DEFAULT_PATHS_AUTO)
    expect(store.get('profile')).toEqual(DEFAULT_PROFILE)

    // Nothing was deleted: config file and Chromium files are intact.
    expect(fs.existsSync(configPath())).toBe(true)
    expect(fs.readFileSync(cacheFile(), 'utf-8')).toBe('locked-while-running')

    // A fresh store reads the persisted defaults, so the interface loads
    // initial values without restarting the app.
    const restarted = await freshStore()
    expect(restarted.store.get('practice')).toEqual(DEFAULT_PRACTICE_STATE)
    expect(restarted.store.get('paths.steam')).toBeNull()

    // Later writes never mutate the shared default constants.
    store.set('practice.bike.bike_id', 'another_bike')
    expect(DEFAULT_PRACTICE_STATE.bike.bike_id).toBe('schwaben_m2_18')
  })

  it('post-reset config matches a fresh install exactly', async () => {
    const savedAppData = mocks.dirs.appData
    const savedUserData = mocks.dirs.userData
    try {
      // Fresh install state: first Store creation with no config file yet.
      const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-reset-fresh-'))
      mocks.dirs.appData = freshDir
      mocks.dirs.userData = path.join(freshDir, 'user-data')
      await freshStore()
      const freshRaw = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as unknown

      // Used install state, then reset in a separate directory.
      const usedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-reset-used-'))
      mocks.dirs.appData = usedDir
      mocks.dirs.userData = path.join(usedDir, 'user-data')
      const used = await freshStore()
      used.store.set('practice.bike.bike_id', 'custom_bike')
      used.store.set('practice.track.track_id', 'custom_track')
      used.store.set('paths.steam', 'C:\\custom\\steam.exe')
      used.store.set('paths.profile', 'C:\\custom\\profiles')
      used.store.set('setup.bike.name', 'Custom Bike')
      used.store.set('setup.track.name', 'Custom Track')
      used.store.set('pathsAuto.mods', 'C:\\custom\\mods')
      used.store.set('pathsAuto.profile', 'C:\\custom\\auto-profiles')
      used.store.set('profile.nationality', 'br')
      const { resetLauncher } = await freshReset()
      resetLauncher()
      const resetRaw = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as unknown

      // The interface loads the same state as a first run, with initial values.
      expect(resetRaw).toEqual(freshRaw)

      fs.rmSync(freshDir, { recursive: true, force: true })
      fs.rmSync(usedDir, { recursive: true, force: true })
    } finally {
      // Restore the shared dirs for the remaining tests and afterAll cleanup.
      mocks.dirs.appData = savedAppData
      mocks.dirs.userData = savedUserData
    }
  })

  it('resets the active profile name and number on disk', async () => {
    const { store } = await freshStore()
    const treeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-reset-profile-'))
    const folder = path.join(treeDir, 'Unnamed Profile')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(
      path.join(folder, 'profile.ini'),
      '[info]\nname = Custom\nrace_number = 42\n',
      'utf-8'
    )
    try {
      store.set('paths.profile', treeDir)
      store.set('pathsAuto.profile', null)
      store.set('profile.nationality', 'br')
      const { resetLauncher } = await freshReset()
      resetLauncher()
      const { listProfilesIn } = await import('./profiles.js')
      const { DEFAULT_PROFILE } = await import('../store.js')
      expect(listProfilesIn(treeDir)).toEqual([
        { id: 'Unnamed Profile', name: 'Unnamed Profile', raceNumber: null }
      ])
      expect(store.get('profile')).toEqual(DEFAULT_PROFILE)
      expect(store.get('paths.profile')).toBeNull()
    } finally {
      fs.rmSync(treeDir, { recursive: true, force: true })
    }
  })

  it('surfaces storage errors', async () => {
    const { resetLauncher } = await freshReset()
    const storeMod = await import('../store.js')
    const holder = storeMod.store as unknown as Record<string, unknown>
    const originalClear = holder.clear
    holder.clear = (): void => {
      throw new Error('disk full')
    }
    try {
      expect(() => resetLauncher()).toThrow('Could not reset launcher settings')
    } finally {
      holder.clear = originalClear
    }
  })
})
