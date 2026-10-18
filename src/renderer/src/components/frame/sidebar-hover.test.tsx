/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MessageModalContext } from '@renderer/components/shared/message-modal-context'
import SidebarLeft from '@renderer/components/frame/sidebar-left'
import SidebarRight from '@renderer/components/frame/sidebar-right'

beforeEach(() => {
  Object.assign(window, {
    api: { isRunning: vi.fn((): Promise<boolean> => Promise.resolve(false)) },
    appInfo: { getVersion: vi.fn((): Promise<string> => Promise.resolve('0.1.4')) },
    open: vi.fn()
  })
})

afterEach(() => {
  cleanup()
})

describe('Sidebar hover', () => {
  it('SidebarLeft items use sidebar-accent hover', () => {
    render(
      <MemoryRouter>
        <MessageModalContext.Provider value={{ showMessage: () => undefined, closeMessage: () => undefined }}>
          <SidebarLeft />
        </MessageModalContext.Provider>
      </MemoryRouter>,
    )
    const practice = screen.getByRole('link', { name: 'practice' })
    expect(practice.className).toContain('hover:bg-sidebar-accent')
    expect(practice.className).not.toContain('lime')
    expect(practice.className).not.toContain('green')
  })

  it('SidebarRight avatar uses sidebar-accent hover', () => {
    render(
      <MemoryRouter>
        <MessageModalContext.Provider value={{ showMessage: () => undefined, closeMessage: () => undefined }}>
          <SidebarRight />
        </MessageModalContext.Provider>
      </MemoryRouter>,
    )
    const avatar = screen.getByLabelText('profile')
    expect(avatar.className).toContain('hover:bg-sidebar-accent')
    expect(avatar.className).not.toContain('lime')
    expect(avatar.className).not.toContain('green')
  })
})