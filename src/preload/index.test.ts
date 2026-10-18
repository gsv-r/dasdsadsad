import { describe, expect, it, vi } from 'vitest'
import { ipcRenderer } from 'electron'

const preloadState = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  sent: [] as Array<{ channel: string; args: unknown[] }>
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, value: unknown) => {
      preloadState.exposed.set(key, value)
    })
  },
  ipcRenderer: {
    send: vi.fn((channel: string, ...args: unknown[]) => {
      preloadState.sent.push({ channel, args })
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    invoke: vi.fn()
  }
}))

function electronApi(): { ipcRenderer: { send: (channel: string, ...args: unknown[]) => void } } {
  const api = preloadState.exposed.get('electron') as
    { ipcRenderer: { send: (channel: string, ...args: unknown[]) => void } } | undefined
  if (!api) throw new Error('electron bridge was not exposed')
  return api
}

describe('electron bridge send allowlist', () => {
  it('forwards minimize and close to ipcRenderer', async () => {
    await import('./index.js')
    const { send } = electronApi().ipcRenderer
    send('minimize')
    send('close')
    expect(preloadState.sent).toContainEqual({ channel: 'minimize', args: [] })
    expect(preloadState.sent).toContainEqual({ channel: 'close', args: [] })
  })

  it('throws a fixed message for a channel outside the allowlist', async () => {
    await import('./index.js')
    const { send } = electronApi().ipcRenderer
    expect(() => send('quit')).toThrow('Invalid IPC channel.')
    expect(() => send('launch')).toThrow('Invalid IPC channel.')
    expect(preloadState.sent.some((entry) => entry.channel === 'quit')).toBe(false)
  })
})

describe('mods bridge', () => {
  it('exposes mods.refresh invoking mods:refresh and returning a promise', async () => {
    await import('./index.js')
    const mods = preloadState.exposed.get('mods') as { refresh: unknown }
    expect(typeof mods.refresh).toBe('function')

    vi.mocked(ipcRenderer.invoke).mockClear()
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined)

    const result = mods.refresh as () => Promise<void>
    const returned = result()
    expect(returned).toBeInstanceOf(Promise)
    await returned
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('mods:refresh')
  })
})

describe('window-control channels and window-state bridge', () => {
  it('forwards window:maximize and window:reload to ipcRenderer', async () => {
    await import('./index.js')
    const { send } = electronApi().ipcRenderer
    send('window:maximize')
    send('window:reload')
    expect(preloadState.sent).toContainEqual({ channel: 'window:maximize', args: [] })
    expect(preloadState.sent).toContainEqual({ channel: 'window:reload', args: [] })
  })

  it('rejects channels outside the allowlist, including the state event name', async () => {
    await import('./index.js')
    const { send } = electronApi().ipcRenderer
    expect(() => send('window:state')).toThrow('Invalid IPC channel.')
    expect(preloadState.sent.some((entry) => entry.channel === 'window:state')).toBe(false)
  })

  it('exposes api.isMaximized and windowState.onChange with unsubscribe', async () => {
    await import('./index.js')
    const api = preloadState.exposed.get('api') as { isMaximized: unknown }
    expect(typeof api.isMaximized).toBe('function')

    const windowState = preloadState.exposed.get('windowState') as
      | {
          onChange: (callback: (message: unknown) => void) => () => void
        }
      | undefined
    expect(typeof windowState?.onChange).toBe('function')
    const callback = vi.fn()
    vi.mocked(ipcRenderer.on).mockClear()
    vi.mocked(ipcRenderer.removeListener).mockClear()
    const off = windowState!.onChange(callback)
    expect(ipcRenderer.on).toHaveBeenCalledWith('window:state', expect.any(Function))
    expect(typeof off).toBe('function')
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('window:state', expect.any(Function))
  })
})
