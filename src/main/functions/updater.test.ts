import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void
  class FakeEmitter {
    private handlers = new Map<string, Listener[]>()
    on(event: string, listener: Listener): this {
      const list = this.handlers.get(event) ?? []
      list.push(listener)
      this.handlers.set(event, list)
      return this
    }
    once(event: string, listener: Listener): this {
      const wrapper: Listener = (...args) => {
        this.removeListener(event, wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }
    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(this.handlers.get(event) ?? [])]) listener(...args)
    }
    removeAllListeners(): void {
      this.handlers.clear()
    }
    listenerCount(event: string): number {
      return this.handlers.get(event)?.length ?? 0
    }
    private removeListener(event: string, listener: Listener): void {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((l) => l !== listener)
      )
    }
  }
  const emitter = new FakeEmitter()
  const autoUpdaterMock = {
    emitter,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      emitter.on(event, listener)
      return emitter
    }),
    once: vi.fn((event: string, listener: Listener) => {
      emitter.once(event, listener)
      return emitter
    })
  }
  const appMock = {
    isPackaged: true,
    getVersion: vi.fn(() => '0.1.4')
  }
  return { emitter, autoUpdaterMock, appMock }
})

vi.mock('electron', () => ({
  app: mocks.appMock,
  BrowserWindow: class {}
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mocks.autoUpdaterMock },
  autoUpdater: mocks.autoUpdaterMock
}))

interface SentMessage {
  channel: string
  payload: unknown
}

interface FakeWindow {
  win: BrowserWindow
  sent: SentMessage[]
  didFinishLoadHandlers: Array<() => void>
  emitDidFinishLoad: () => void
  webContentsSend: ReturnType<typeof vi.fn>
}

function createFakeWindow(): FakeWindow {
  const sent: SentMessage[] = []
  const didFinishLoadHandlers: Array<() => void> = []
  const webContentsSend = vi.fn((channel: string, payload: unknown) => {
    sent.push({ channel, payload })
  })
  const win = {
    webContents: {
      send: webContentsSend,
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'did-finish-load') didFinishLoadHandlers.push(handler)
      })
    },
    once: vi.fn(),
    isDestroyed: () => false
  } as unknown as BrowserWindow
  return {
    win,
    sent,
    didFinishLoadHandlers,
    emitDidFinishLoad: () => {
      for (const handler of didFinishLoadHandlers) handler()
    },
    webContentsSend
  }
}

function lastPayloadOf(sent: SentMessage[], channel: string): unknown {
  const found = [...sent].reverse().find((m) => m.channel === channel)
  return found?.payload
}

async function freshUpdater(): Promise<typeof import('./updater.js')> {
  vi.resetModules()
  return import('./updater.js')
}

beforeEach(() => {
  mocks.emitter.removeAllListeners()
  mocks.appMock.isPackaged = true
  mocks.autoUpdaterMock.autoDownload = true
  mocks.autoUpdaterMock.autoInstallOnAppQuit = false
  mocks.autoUpdaterMock.checkForUpdates.mockReset()
  mocks.autoUpdaterMock.downloadUpdate.mockReset()
  mocks.autoUpdaterMock.quitAndInstall.mockReset()
  mocks.autoUpdaterMock.checkForUpdates.mockResolvedValue(null)
  mocks.autoUpdaterMock.downloadUpdate.mockResolvedValue([])
  vi.useRealTimers()
})

describe('registerUpdater', () => {
  it('configures manual download mode and attaches listeners once', async () => {
    const updater = await freshUpdater()
    const first = createFakeWindow()
    const second = createFakeWindow()

    updater.registerUpdater(first.win)
    updater.registerUpdater(second.win)

    expect(mocks.autoUpdaterMock.autoDownload).toBe(false)
    expect(mocks.autoUpdaterMock.autoInstallOnAppQuit).toBe(true)
    expect(mocks.emitter.listenerCount('update-available')).toBe(1)
    expect(mocks.emitter.listenerCount('error')).toBe(1)
  })

  it('waits for the renderer before the first check (race fix)', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)

    expect(mocks.autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()

    fake.emitDidFinishLoad()
    await vi.waitFor(() => {
      expect(mocks.autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1)
    })
    updater.stopUpdaterChecks()
  })

  it('never auto-checks in dev', async () => {
    const updater = await freshUpdater()
    mocks.appMock.isPackaged = false
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)
    fake.emitDidFinishLoad()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })
})

describe('status replay for late subscribers', () => {
  it('exposes the last status via getUpdaterStatus', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)

    expect(updater.getUpdaterStatus()).toEqual({ status: 'idle' })

    mocks.emitter.emit('update-available', { version: '0.2.0' })
    expect(updater.getUpdaterStatus()).toEqual({ status: 'available', version: '0.2.0' })

    const late = createFakeWindow()
    updater.registerUpdater(late.win)
    // Late window can catch up by asking for the last status (used by the
    // renderer hook on mount, fixing the startup race).
    expect(updater.getUpdaterStatus()).toEqual({ status: 'available', version: '0.2.0' })
  })
})

describe('checkForUpdates', () => {
  it('maps an available update to the preload contract', async () => {
    const updater = await freshUpdater()
    mocks.autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '0.2.0' }
    })
    const result = await updater.checkForUpdates()

    expect(result).toEqual({
      currentVersion: '0.1.4',
      latestVersion: '0.2.0',
      updateAvailable: true
    })
  })

  it('maps no update and null results', async () => {
    const updater = await freshUpdater()
    mocks.autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '0.1.4' }
    })
    await expect(updater.checkForUpdates()).resolves.toEqual({
      currentVersion: '0.1.4',
      latestVersion: '0.1.4',
      updateAvailable: false
    })

    const fresh = await freshUpdater()
    mocks.autoUpdaterMock.checkForUpdates.mockResolvedValue(null)
    await expect(fresh.checkForUpdates()).resolves.toEqual({
      currentVersion: '0.1.4',
      latestVersion: null,
      updateAvailable: false
    })
  })

  it('broadcasts error status and throws a readable error', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)
    mocks.autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error('net failed'))

    await expect(updater.checkForUpdates()).rejects.toThrow('net failed')
    expect(lastPayloadOf(fake.sent, 'updater:status')).toEqual({
      status: 'error',
      message: 'net failed'
    })
  })

  it('rejects concurrent checks instead of overlapping them', async () => {
    const updater = await freshUpdater()
    let release!: (value: unknown) => void
    mocks.autoUpdaterMock.checkForUpdates.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )

    const first = updater.checkForUpdates()
    await expect(updater.checkForUpdates()).rejects.toThrow('already in progress')
    release({ isUpdateAvailable: false, updateInfo: { version: '0.1.4' } })
    await first
  })

  it('reports no update in dev instead of throwing', async () => {
    const updater = await freshUpdater()
    mocks.appMock.isPackaged = false
    await expect(updater.checkForUpdates()).resolves.toEqual({
      currentVersion: '0.1.4',
      latestVersion: null,
      updateAvailable: false
    })
  })
})

describe('downloadUpdate guards', () => {
  it('requires a known available update', async () => {
    const updater = await freshUpdater()
    await expect(updater.downloadUpdate()).rejects.toThrow('No update available')
  })

  it('rejects double download and re-download after success', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)
    mocks.emitter.emit('update-available', { version: '0.2.0' })

    let release!: (value: unknown) => void
    mocks.autoUpdaterMock.downloadUpdate.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )

    const first = updater.downloadUpdate()
    await expect(updater.downloadUpdate()).rejects.toThrow('already in progress')
    release([])
    await first

    mocks.emitter.emit('update-downloaded', { version: '0.2.0' })
    await expect(updater.downloadUpdate()).rejects.toThrow('already downloaded')
  })

  it('is disabled in dev', async () => {
    const updater = await freshUpdater()
    mocks.appMock.isPackaged = false
    await expect(updater.downloadUpdate()).rejects.toThrow('packaged builds')
  })
})

describe('installUpdate guards', () => {
  it('refuses to quit without a downloaded update', async () => {
    const updater = await freshUpdater()
    expect(() => updater.installUpdate()).toThrow('No downloaded update')
    expect(mocks.autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installs after update-downloaded', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)
    mocks.emitter.emit('update-downloaded', { version: '0.2.0' })
    updater.installUpdate()
    expect(mocks.autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(1)
    // Restarts the app after install (full reboot flow).
    expect(mocks.autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})

describe('error event', () => {
  it('forwards updater errors to the renderer', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)

    mocks.emitter.emit('error', new Error('feed 404'))

    expect(lastPayloadOf(fake.sent, 'updater:status')).toEqual({
      status: 'error',
      message: 'feed 404'
    })
  })
})

describe('full update flow', () => {
  it('check -> available -> download -> progress -> downloaded -> install', async () => {
    const updater = await freshUpdater()
    const fake = createFakeWindow()
    updater.registerUpdater(fake.win)

    mocks.autoUpdaterMock.checkForUpdates.mockImplementation(async () => {
      mocks.emitter.emit('update-available', { version: '0.2.0' })
      return { isUpdateAvailable: true, updateInfo: { version: '0.2.0' } }
    })
    mocks.autoUpdaterMock.downloadUpdate.mockImplementation(async () => {
      mocks.emitter.emit('download-progress', {
        percent: 50.4,
        bytesPerSecond: 100,
        transferred: 50,
        total: 100
      })
      mocks.emitter.emit('update-downloaded', { version: '0.2.0' })
      return ['/tmp/update.exe']
    })

    const check = await updater.checkForUpdates()
    expect(check.updateAvailable).toBe(true)

    await updater.downloadUpdate()
    updater.installUpdate()

    const statuses = fake.sent
      .filter((m) => m.channel === 'updater:status')
      .map((m) => m.payload as { status: string; percent?: number })
      .map((p) => p.status)
    expect(statuses).toContain('checking')
    expect(statuses).toContain('available')
    expect(statuses).toContain('downloading')
    expect(statuses).toContain('downloaded')
    expect(mocks.autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(mocks.autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(false, true)
    updater.stopUpdaterChecks()
  })
})
