/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App, { router } from './App'
import { stubResizeObserver } from './test-utils'

beforeEach(() => {
  Object.assign(window, {
    electron: { ipcRenderer: { send: vi.fn() } },
    api: {
      isRunning: () => Promise.resolve(false),
      launch: () => Promise.resolve(undefined),
      isMaximized: () => Promise.resolve(false)
    },
    store: { get: () => Promise.resolve(null), set: () => Promise.resolve({ ok: true }) },
    practice: {
      validate: () => Promise.resolve({ repaired: [], modsMissing: false }),
      sync: () => Promise.resolve(true),
      selectBike: () => Promise.resolve({ ok: true }),
      selectTrack: () => Promise.resolve(undefined),
      setBikePaint: () => Promise.resolve({ ok: true }),
      setTrackLayout: () => Promise.resolve(undefined),
      selectHelmet: () => Promise.resolve({ ok: true }),
      setHelmetPaint: () => Promise.resolve({ ok: true }),
      selectRider: () => Promise.resolve({ ok: true }),
      setSuitPaint: () => Promise.resolve({ ok: true }),
      selectRidingStyle: () => Promise.resolve({ ok: true })
    },
    paths: {
      detect: () =>
        Promise.resolve({ steamPath: null, gamePath: null, modsPath: null, profilePath: null })
    },
    profiles: {
      list: () => Promise.resolve([]),
      active: () => Promise.resolve(null),
      save: () => Promise.resolve({ ok: false, reason: 'write-failed' })
    },
    setups: {
      list: () => Promise.resolve([]),
      create: () => Promise.resolve({ ok: false, reason: 'write-failed' }),
      update: () => Promise.resolve({ ok: false, reason: 'write-failed' }),
      delete: () => Promise.resolve({ ok: false, reason: 'write-failed' }),
      select: () => Promise.resolve({ ok: true })
    },
    mods: {
      getAll: () => Promise.resolve({ valid: true, ready: true, mods: {} }),
      onChanged: () => () => undefined
    },
    validation: { validateApp: () => Promise.resolve({ valid: true, issues: [] }) },
    appInfo: { getVersion: () => Promise.resolve('0.1.4') },
    launcher: { reset: () => Promise.resolve(undefined) },
    updater: {
      checkForUpdates: () =>
        Promise.resolve({ currentVersion: '0.1.4', latestVersion: null, updateAvailable: false }),
      downloadUpdate: () => Promise.resolve(undefined),
      installUpdate: () => Promise.resolve(undefined),
      getStatus: () => Promise.resolve({ status: 'idle' }),
      onStatus: () => () => undefined
    },
    windowState: { onChange: () => () => undefined }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('App reload indicator', () => {
  it('boot sem flag não mostra o indicador', () => {
    render(<App reloadPending={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('boot com flag mostra o indicador no primeiro render', () => {
    render(<App reloadPending={true} />)
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Reloading')
  })
})

describe('App routes', () => {
  beforeEach(() => {
    stubResizeObserver()
    router.navigate('/')
  })

  it('opens on the Practice home route', () => {
    render(<App reloadPending={false} />)
    expect(screen.getByRole('heading', { name: 'practice' })).not.toBeNull()
  })

  it('has the practice link with correct href', () => {
    render(<App reloadPending={false} />)
    const practiceLink = screen.getByRole('link', { name: 'practice' })
    expect(practiceLink.getAttribute('href')).toBe('#/')
  })
})

describe('App reload indicator auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('remove o indicador após 1.5s', async () => {
    render(<App reloadPending={true} />)
    expect(screen.getByRole('status')).not.toBeNull()
    vi.advanceTimersByTime(1500)
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('não mostra nada quando reloadPending é false mesmo com timers', () => {
    render(<App reloadPending={false} />)
    expect(screen.queryByRole('status')).toBeNull()
    vi.advanceTimersByTime(1500)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
