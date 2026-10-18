import { describe, expect, it } from 'vitest'
import { SEND_CHANNELS, isSendChannel } from './ipc.js'

describe('send channel allowlist', () => {
  it('locks the exact channel list', () => {
    expect([...SEND_CHANNELS]).toEqual(['minimize', 'close', 'window:maximize', 'window:reload'])
  })

  it('accepts only the listed channels', () => {
    expect(isSendChannel('minimize')).toBe(true)
    expect(isSendChannel('close')).toBe(true)
    expect(isSendChannel('window:maximize')).toBe(true)
    expect(isSendChannel('window:reload')).toBe(true)
    for (const channel of ['quit', 'launch', '', 'MINIMIZE', 'minimize ']) {
      expect(isSendChannel(channel)).toBe(false)
    }
    for (const channel of [123, null, undefined, {}, []]) {
      expect(isSendChannel(channel)).toBe(false)
    }
  })
})
