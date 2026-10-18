/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { MessageModalContext } from '@renderer/components/shared/message-modal-context'
import SidebarLeft from './sidebar-left'
import SidebarRight from './sidebar-right'

afterEach(() => {
  cleanup()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarRight />
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/profile" element={<p>profile page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

function PathProbe(): React.JSX.Element {
  const { pathname } = useLocation()
  return <p>path:{pathname}</p>
}

describe('SidebarRight', () => {
  it('renders the avatar button with the fixed profile aria-label', () => {
    renderAt('/')
    expect(screen.getByLabelText('profile')).not.toBeNull()
  })

  it('navigates to the Profile route when clicked', () => {
    renderAt('/')
    fireEvent.click(screen.getByLabelText('profile'))
    expect(screen.getByText('profile page')).not.toBeNull()
  })

  it('marks aria-current="page" on the Profile route', () => {
    renderAt('/profile')
    expect(screen.getByLabelText('profile').getAttribute('aria-current')).toBe('page')
  })

  // The left rail no longer owns the profile entry point: the avatar is the
  // only profile link and still navigates to the Profile route.
  it('keeps the profile entry point available next to the left rail', () => {
    Object.assign(window, {
      api: { isRunning: vi.fn((): Promise<boolean> => Promise.resolve(false)) },
      appInfo: { getVersion: vi.fn((): Promise<string> => Promise.resolve('0.1.4')) },
      open: vi.fn()
    })
    render(
      <MemoryRouter initialEntries={['/']}>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <SidebarLeft />
          <SidebarRight />
          <PathProbe />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )

    expect(screen.queryByRole('link', { name: 'practice' })).not.toBeNull()
    expect(screen.getAllByRole('link', { name: 'profile' })).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('profile'))
    expect(screen.getByText('path:/profile')).not.toBeNull()
  })
})
