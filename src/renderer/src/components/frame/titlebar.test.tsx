/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import TitleBar from './titlebar'
import { MessageModalContext } from '../shared/message-modal-context'
import { renderWithProviders } from '../../test-utils'

beforeEach(() => {
  Object.assign(window, {
    electron: { ipcRenderer: { send: vi.fn() } },
    api: { isMaximized: vi.fn((): Promise<boolean> => Promise.resolve(false)) },
    windowState: { onChange: vi.fn((): (() => void) => () => undefined) }
  })
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('TitleBar', () => {
  it('renders the 5 buttons with fixed aria-labels', () => {
    renderWithProviders(<TitleBar />)
    expect(screen.getByLabelText('Back to Practice')).not.toBeNull()
    expect(screen.getByLabelText('Reload')).not.toBeNull()
    expect(screen.getByLabelText('Minimize')).not.toBeNull()
    expect(screen.getByLabelText('Maximize')).not.toBeNull()
    expect(screen.getByLabelText('Close')).not.toBeNull()
  })

  it('clique em Recarregar grava a flag no sessionStorage e invoca o canal window:reload', () => {
    const { send } = window.electron.ipcRenderer as { send: ReturnType<typeof vi.fn> }
    renderWithProviders(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Reload'))
    expect(send).toHaveBeenCalledWith('window:reload')
    expect(sessionStorage.getItem('kd:reload-pending')).toBe('1')
  })

  it('clique em Minimizar invoca o canal minimize', () => {
    const { send } = window.electron.ipcRenderer as { send: ReturnType<typeof vi.fn> }
    renderWithProviders(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Minimize'))
    expect(send).toHaveBeenCalledWith('minimize')
  })

  it('clique em Maximizar/Restaurar invoca o canal window:maximize', () => {
    const { send } = window.electron.ipcRenderer as { send: ReturnType<typeof vi.fn> }
    renderWithProviders(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Maximize'))
    expect(send).toHaveBeenCalledWith('window:maximize')
  })

  it('clique em Fechar invoca o canal close', () => {
    const { send } = window.electron.ipcRenderer as { send: ReturnType<typeof vi.fn> }
    renderWithProviders(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(send).toHaveBeenCalledWith('close')
  })

  it('clique em Voltar a partir de / navega para a home', () => {
    function Probe() {
      const { pathname } = useLocation()
      return <p>path:{pathname}</p>
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <TitleBar />
          <Probe />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Back to Practice'))
    expect(screen.getByText('path:/')).not.toBeNull()
  })

  it('clique em Voltar a partir de /settings navega para a home', () => {
    function Probe() {
      const { pathname } = useLocation()
      return <p>path:{pathname}</p>
    }
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <TitleBar />
          <Probe />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Back to Practice'))
    expect(screen.getByText('path:/')).not.toBeNull()
  })

  it('clique em Recarregar reseta a rota para a home antes do reload', () => {
    function Probe() {
      const { pathname } = useLocation()
      return <p>path:{pathname}</p>
    }
    render(
      <MemoryRouter initialEntries={['/']}>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <TitleBar />
          <Probe />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )
    const { send } = window.electron.ipcRenderer as { send: ReturnType<typeof vi.fn> }
    fireEvent.click(screen.getByLabelText('Reload'))
    expect(screen.getByText('path:/')).not.toBeNull()
    expect(send).toHaveBeenCalledWith('window:reload')
  })

  it('clique em Voltar navega para a home', () => {
    render(
      <MemoryRouter initialEntries={['/bikes']}>
        <MessageModalContext.Provider
          value={{ showMessage: () => undefined, closeMessage: () => undefined }}
        >
          <TitleBar />
          <PathProbe />
        </MessageModalContext.Provider>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Back to Practice'))
    expect(screen.getByText('path:/')).not.toBeNull()
  })

  function PathProbe(): React.JSX.Element {
    const { pathname } = useLocation()
    return <p>path:{pathname}</p>
  }

  it('initial state: shows Maximize when the window is restored', () => {
    renderWithProviders(<TitleBar />)
    expect(screen.getByLabelText('Maximize')).not.toBeNull()
    expect(screen.queryByLabelText('Restore')).toBeNull()
  })

  it('consulta o estado inicial no mount e exibe Restaurar quando maximizada', async () => {
    Object.assign(window, {
      api: { isMaximized: vi.fn((): Promise<boolean> => Promise.resolve(true)) }
    })
    renderWithProviders(<TitleBar />)
    expect(screen.queryByLabelText('Maximize')).not.toBeNull()
    await waitFor(() => expect(screen.getByLabelText('Restore')).not.toBeNull())
  })

  it('reconciles window:state events and unsubscribes on unmount', async () => {
    let stateCallback: ((message: { maximized: boolean }) => void) | undefined
    let removed = false
    const unsubscribe = () => {
      removed = true
    }
    Object.assign(window, {
      windowState: {
        onChange: vi.fn((callback: (message: { maximized: boolean }) => void) => {
          stateCallback = callback
          return unsubscribe
        })
      }
    })
    const ui = renderWithProviders(<TitleBar />)

    expect(screen.getByLabelText('Maximize')).not.toBeNull()
    await waitFor(() => expect(stateCallback).toBeDefined())

    stateCallback!({ maximized: true })
    await waitFor(() => expect(screen.getByLabelText('Restore')).not.toBeNull())

    stateCallback!({ maximized: false })
    await waitFor(() => expect(screen.getByLabelText('Maximize')).not.toBeNull())

    ui.unmount()
    expect(removed).toBe(true)
  })

  it('keeps New Version visible without overlapping the logo', async () => {
    Object.assign(window, {
      updater: {
        getStatus: vi.fn((): Promise<{ status: string; version?: string }> =>
          Promise.resolve({ status: 'available', version: '1.2.3' })
        ),
        onStatus: vi.fn((): (() => void) => () => undefined)
      },
      appInfo: { getVersion: vi.fn((): Promise<string> => Promise.resolve('0.1.4')) }
    })
    renderWithProviders(<TitleBar />)
    await waitFor(() => expect(screen.getByText('New Version')).not.toBeNull())
    expect(screen.getByLabelText('Back to Practice')).not.toBeNull()
    expect(screen.getByLabelText('Maximize')).not.toBeNull()
  })
})
