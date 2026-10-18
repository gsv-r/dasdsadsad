import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => {
  const dirs = { userData: '' }
  const appMock = {
    getPath: vi.fn((): string => dirs.userData),
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

const roots: string[] = []

function freshUserData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-store-boot-'))
  roots.push(dir)
  mocks.dirs.userData = dir
  return dir
}

function configPath(): string {
  return path.join(mocks.dirs.userData, 'config.json')
}

async function freshStore(): Promise<typeof import('./store.js')> {
  vi.resetModules()
  return import('./store.js')
}

beforeEach(() => {
  freshUserData()
  vi.restoreAllMocks()
})

afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true })
})

describe('store boot with an unreadable config', () => {
  it('moves invalid JSON aside and starts with defaults', async () => {
    fs.writeFileSync(configPath(), '{not valid json', 'utf-8')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, DEFAULT_PRACTICE_STATE } = await freshStore()
    try {
      const backups = fs
        .readdirSync(mocks.dirs.userData)
        .filter((name) => name.startsWith('config.json.corrupt-'))
      expect(backups).toHaveLength(1)
      const backup = path.join(mocks.dirs.userData, backups[0] as string)
      expect(fs.readFileSync(backup, 'utf-8')).toBe('{not valid json')
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(String(errorSpy.mock.calls[0]?.[0] ?? '')).toContain(backup)
      expect(store.path).toBe(configPath())
      expect(store.get('practice.bike.bike_id')).toBe(DEFAULT_PRACTICE_STATE.bike.bike_id)
      expect(store.get('paths.mods')).toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('treats an empty file like invalid JSON', async () => {
    fs.writeFileSync(configPath(), '', 'utf-8')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, DEFAULT_PRACTICE_STATE } = await freshStore()
    try {
      expect(
        fs.readdirSync(mocks.dirs.userData).filter((name) => name.startsWith('config.json.corrupt-'))
      ).toHaveLength(1)
      expect(store.get('practice.bike.bike_id')).toBe(DEFAULT_PRACTICE_STATE.bike.bike_id)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it.each(['[]', '123', 'null', '"str"'])(
    'starts without crashing on top-level %s, keeping readable defaults',
    async (raw) => {
      fs.writeFileSync(configPath(), raw, 'utf-8')
      const { store, DEFAULT_PRACTICE_STATE } = await freshStore()
      expect(store.get('practice.bike.bike_id')).toBe(DEFAULT_PRACTICE_STATE.bike.bike_id)
      expect(
        fs.readdirSync(mocks.dirs.userData).filter((name) => name.startsWith('config.json.corrupt-'))
      ).toHaveLength(0)
    }
  )

  it('rethrows errors that are not a SyntaxError', async () => {
    fs.mkdirSync(configPath())
    await expect(freshStore()).rejects.toThrow()
    expect(fs.statSync(configPath()).isDirectory()).toBe(true)
    expect(
      fs.readdirSync(mocks.dirs.userData).filter((name) => name.startsWith('config.json.corrupt-'))
    ).toHaveLength(0)
  })

  it('rethrows when the backup move fails and keeps the corrupt file', async () => {
    fs.writeFileSync(configPath(), '{not valid json', 'utf-8')
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: operation not permitted')
    })
    try {
      await expect(freshStore()).rejects.toThrow('EPERM: operation not permitted')
      expect(fs.readFileSync(configPath(), 'utf-8')).toBe('{not valid json')
    } finally {
      renameSpy.mockRestore()
    }
  })

  it('derives the same path the constructor uses on a healthy store', async () => {
    const { store } = await freshStore()
    expect(store.path).toBe(path.join(mocks.dirs.userData, 'config.json'))
  })
})
