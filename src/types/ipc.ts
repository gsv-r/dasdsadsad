// Renderer-to-main fire-and-forget channels. Only the window controls use
// these; anything else is rejected so a compromised renderer cannot send
// arbitrary channel names to the main process.
export const SEND_CHANNELS = [
  'minimize',
  'close',
  'window:maximize',
  'window:reload'
] as const

export type SendChannel = (typeof SEND_CHANNELS)[number]

export function isSendChannel(channel: unknown): channel is SendChannel {
  return typeof channel === 'string' && (SEND_CHANNELS as readonly string[]).includes(channel)
}

// Main-to-renderer window state event, broadcast on maximize/unmaximize and
// (un)full-screen so the renderer keeps the maximize/restore icon in sync.
export interface WindowStateMessage {
  maximized: boolean
}
