/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MessageModalContext } from '@renderer/components/shared/message-modal-context'
import TitleBar from '@renderer/components/frame/titlebar'

beforeEach(() => {
  Object.assign(window, {
    electron: { ipcRenderer: { send: vi.fn() } },
    api: { isMaximized: vi.fn((): Promise<boolean> => Promise.resolve(false)) },
    windowState: { onChange: vi.fn((): (() => void) => () => undefined) }
  })
})

afterEach(() => {
  cleanup()
})

describe('TitleBar hover', () => {
  it('all buttons use kd-surface-hover, close uses window-close', () => {
    render(
      <MemoryRouter>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <TitleBar />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )

    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      const ariaLabel = btn.getAttribute('aria-label')
      if (ariaLabel === 'Close') {
        expect(btn.className).toContain('hover:bg-window-close')
      } else {
        expect(btn.className).toContain('hover:bg-kd-surface-hover')
      }
      expect(btn.className).not.toContain('lime')
      expect(btn.className).not.toContain('green')
    }
  })
})
