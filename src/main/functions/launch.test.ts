import { beforeEach, describe, expect, it, vi } from 'vitest'

const execMock = vi.fn()
const execSyncMock = vi.fn()

vi.mock('util', () => ({
  promisify: () => (cmd: string) => execMock(cmd)
}))
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: (...args: unknown[]) => execSyncMock(...args)
}))

import { isRunning, launch } from './launch.js'

describe('launch', () => {
  beforeEach(() => {
    execMock.mockReset()
    execSyncMock.mockReset()
  })

  it('calls steam with applaunch and returns stdout', async () => {
    execMock.mockResolvedValue({ stdout: 'ok', stderr: 'info' })
    const out = await launch('C:/steam/steam.exe', '123', '-foo')
    expect(execMock).toHaveBeenCalledWith('"C:/steam/steam.exe" -applaunch 123 -foo')
    expect(out).toBe('ok')
  })

  it('logs stderr without failing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    execMock.mockResolvedValue({ stdout: '', stderr: 'warn' })
    await launch('s', '1', '')
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('isRunning', () => {
  beforeEach(() => execSyncMock.mockReset())

  it('returns true when tasklist contains the game process', () => {
    execSyncMock.mockReturnValue(Buffer.from('gpbikes.exe'))
    expect(isRunning()).toBe(true)
  })

  it('returns false when tasklist does not contain the game process', () => {
    execSyncMock.mockReturnValue(Buffer.from('no tasks'))
    expect(isRunning()).toBe(false)
  })

  it('uses fallback tasklist when filtered call throws', () => {
    let calls = 0
    execSyncMock.mockImplementation(() => {
      calls++
      if (calls === 1) throw new Error('filter unavailable')
      return Buffer.from('gpbikes.exe')
    })
    expect(isRunning()).toBe(true)
  })
})
