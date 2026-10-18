/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Button } from './button'

afterEach(() => {
  cleanup()
})

describe('Button primitive hover', () => {
  it('default variant exposes hover classes', () => {
    render(<Button>click</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('hover:bg-primary/90')
  })

  it('outline variant uses accent hover', () => {
    render(<Button variant="outline">click</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('hover:bg-accent')
  })

  it('ghost variant uses accent hover', () => {
    render(<Button variant="ghost">click</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('hover:bg-accent')
  })

  it('secondary variant uses accent hover (not secondary/80)', () => {
    render(<Button variant="secondary">click</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('hover:bg-accent')
    expect(btn.className).not.toContain('hover:bg-secondary/80')
  })

  it('disabled button has no hover reaction (pointer-events-none)', () => {
    render(<Button disabled>click</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('disabled:pointer-events-none')
  })

  it('no hover uses lime or green', () => {
    render(
      <>
        <Button>default</Button>
        <Button variant="outline">outline</Button>
        <Button variant="ghost">ghost</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="destructive">destructive</Button>
      </>
    )
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn.className).not.toContain('lime')
      expect(btn.className).not.toContain('green')
    }
  })
})
