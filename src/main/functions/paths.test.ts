import { describe, expect, it, vi } from 'vitest'
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

describe('sameModsPath', () => {
  it('ignores trailing separators and dot segments', async () => {
    const { sameModsPath } = await import('./paths.js')
    const base = path.join(os.tmpdir(), 'knee-down-mods')
    expect(sameModsPath(base, base + path.sep)).toBe(true)
    expect(sameModsPath(base, path.join(base, 'bikes', '..'))).toBe(true)
    expect(sameModsPath(base, path.join(os.tmpdir(), 'other-mods'))).toBe(false)
  })

  it('treats null as equal only to null', async () => {
    const { sameModsPath } = await import('./paths.js')
    const base = path.join(os.tmpdir(), 'knee-down-mods')
    expect(sameModsPath(null, null)).toBe(true)
    expect(sameModsPath(base, null)).toBe(false)
    expect(sameModsPath(null, base)).toBe(false)
  })

  it('compares letter case only on Windows', async () => {
    const { sameModsPath } = await import('./paths.js')
    const lower = path.join(os.tmpdir(), 'knee-down-mods')
    const upper = lower.toUpperCase()
    if (process.platform === 'win32') {
      expect(sameModsPath(lower, upper)).toBe(true)
    } else {
      expect(sameModsPath(lower, upper)).toBe(false)
    }
  })
})

describe('isValidManualModsValue', () => {
  async function makeValidModsTree(): Promise<string> {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-paths-guard-'))
    for (const sub of ['bikes', 'misc', 'rider', 'tracks', 'tires']) {
      await fs.promises.mkdir(path.join(dir, sub), { recursive: true })
    }
    return dir
  }

  it('accepts a valid folder, with trailing separator or quotes', async () => {
    const { isValidManualModsValue } = await import('./paths.js')
    const dir = await makeValidModsTree()
    try {
      expect(isValidManualModsValue(dir)).toBe(true)
      expect(isValidManualModsValue(dir + path.sep)).toBe(true)
      expect(isValidManualModsValue(`"${dir}"`)).toBe(true)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects partial and empty values like the resolver does', async () => {
    const { isValidManualModsValue } = await import('./paths.js')
    const dir = await makeValidModsTree()
    try {
      // A partial keystroke describes no real folder, exactly as
      // getResolvedModsPath reports it (null).
      expect(isValidManualModsValue(`${dir}-partial`)).toBe(false)
      expect(isValidManualModsValue('')).toBe(false)
      expect(isValidManualModsValue('   ')).toBe(false)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  })

  it('tolerates surrounding whitespace exactly like the resolver', async () => {
    // stripSurroundingQuotes returns the trimmed value, so both the guard
    // and readStored accept a padded path (the UI trims before persisting).
    const { isValidManualModsValue } = await import('./paths.js')
    const dir = await makeValidModsTree()
    try {
      expect(isValidManualModsValue(`  ${dir}  `)).toBe(true)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  })

  it('allows null (manual clear) and rejects non-strings', async () => {
    const { isValidManualModsValue } = await import('./paths.js')
    expect(isValidManualModsValue(null)).toBe(true)
    expect(isValidManualModsValue(undefined)).toBe(false)
    expect(isValidManualModsValue(123)).toBe(false)
  })
})

describe('getResolvedModsPath', () => {
  it('returns null for an invalid manual path without falling back to auto', async () => {
    const { getResolvedModsPath, getStoredModsPath } = await import('./paths.js')
    const { store } = await import('../store.js')
    const valid = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-paths-valid-'))
    for (const sub of ['bikes', 'misc', 'rider', 'tracks', 'tires']) {
      await fs.promises.mkdir(path.join(valid, sub), { recursive: true })
    }
    const invalid = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'knee-down-paths-invalid-'))
    const prevManual = store.get('paths.mods')
    const prevAuto = store.get('pathsAuto.mods')
    try {
      store.set('paths.mods', invalid)
      store.set('pathsAuto.mods', valid)
      // Stored distinguishes "configured but invalid" from "not configured".
      expect(getStoredModsPath()).toBe(invalid)
      // An invalid manual shadows a valid auto-detection: no fallback.
      expect(getResolvedModsPath()).toBeNull()
    } finally {
      store.set('paths.mods', prevManual)
      store.set('pathsAuto.mods', prevAuto)
      await fs.promises.rm(valid, { recursive: true, force: true })
      await fs.promises.rm(invalid, { recursive: true, force: true })
    }
  })
})
