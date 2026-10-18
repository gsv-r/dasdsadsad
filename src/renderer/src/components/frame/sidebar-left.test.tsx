/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import SidebarLeft from './sidebar-left'
import { renderWithProviders } from '../../test-utils'

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

describe('SidebarLeft buttons', () => {
  // The Go Ride CTA matches the nav buttons in size, spacing, label font and
  // icon size; only its accent color/shape stay specific.
  it('gives the Go Ride button the same size classes and icon size as a nav button', () => {
    renderWithProviders(<SidebarLeft />)

    const goRide = screen.getByLabelText('go ride')
    const nav = screen.getByRole('link', { name: 'practice' })

    for (const sizeClass of ['py-3.5', 'px-4', 'gap-2.5', 'text-sm']) {
      expect(goRide.className).toContain(sizeClass)
      expect(nav.className).toContain(sizeClass)
    }

    const goRideIcon = goRide.querySelector('svg')!
    const navIcon = nav.querySelector('svg')!
    expect(goRideIcon.getAttribute('width')).toBe(navIcon.getAttribute('width'))
    expect(goRideIcon.getAttribute('height')).toBe(navIcon.getAttribute('height'))
    expect(goRideIcon.getAttribute('width')).toBe('24')
  })

  // The profile entry point moved to the SidebarRight avatar: the left rail
  // must not render a profile item anymore.
  it('does not render the profile item in the left rail', () => {
    renderWithProviders(<SidebarLeft />)
    expect(screen.queryByRole('link', { name: 'profile' })).toBeNull()
    expect(screen.queryByLabelText('profile')).toBeNull()
  })

  it('keeps the practice link pointing at its own route', () => {
    renderWithProviders(<SidebarLeft />)
    const practice = screen.getByRole('link', { name: 'practice' })
    expect(practice.getAttribute('href')).toBe('/')
  })
})
