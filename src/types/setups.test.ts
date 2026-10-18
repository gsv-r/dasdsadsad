import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { setupCreateArgsSchema, setupNameSchema } from './setups.js'

// Oracle copied from validateSetupName as it was before the schema move.
// Any divergence between oracle and schema fails here.
function oldValidateSetupName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 32 && !/\p{Cc}/u.test(trimmed)
}

describe('setupNameSchema', () => {
  it.each(['Pista São João', 'a', 'a'.repeat(32), '🏁 night', '  padded  '])(
    'accepts %s like the old check (callers trim first)',
    (value) => {
      expect(setupNameSchema.safeParse(value.trim()).success).toBe(true)
      expect(oldValidateSetupName(value)).toBe(true)
    }
  )

  it.each(['', '   ', 'a'.repeat(33), 'name\x00', 'name\x1F', 'name\x7F', 'a\tb', 'a\nb'])(
    'rejects %s like the old check',
    (value) => {
      expect(setupNameSchema.safeParse(value.trim()).success).toBe(false)
      expect(oldValidateSetupName(value)).toBe(false)
    }
  )
})

// The renderer CSP has no 'unsafe-eval', so main.tsx sets
// `z.config({ jitless: true })`. Same expectations, JIT disabled.
describe('jitless parity (renderer CSP)', () => {
  beforeEach(() => {
    z.config({ jitless: true })
  })

  afterAll(() => {
    z.config({ jitless: false })
  })

  it.each(['Evening', 'a', 'a'.repeat(32)])('setupNameSchema accepts %s with jitless', (value) => {
    expect(setupNameSchema.safeParse(value.trim()).success).toBe(true)
  })

  it.each(['', '   ', 'a'.repeat(33), 'name\x00', 'a\tb'])(
    'setupNameSchema rejects %s with jitless',
    (value) => {
      expect(setupNameSchema.safeParse(value.trim()).success).toBe(false)
    }
  )
})

const fullArgs = {
  name: 'Evening',
  bike_id: 'bikeA',
  bike_paint: '',
  rider: 'modern',
  helmet: 'default',
  helmet_paint: '',
  suit_paint: '',
  riding_style: 'modern'
}

describe('setupCreateArgsSchema', () => {
  it('accepts a complete payload', () => {
    expect(setupCreateArgsSchema.safeParse(fullArgs).success).toBe(true)
  })

  it('rejects a missing or mistyped object like the old checks', () => {
    expect(setupCreateArgsSchema.safeParse(null).success).toBe(false)
    expect(setupCreateArgsSchema.safeParse(undefined).success).toBe(false)
    expect(setupCreateArgsSchema.safeParse('x').success).toBe(false)
    expect(setupCreateArgsSchema.safeParse({}).success).toBe(false)
    expect(setupCreateArgsSchema.safeParse({ ...fullArgs, bike_id: 7 }).success).toBe(false)
  })

  it('strips unknown keys like the old destructure did', () => {
    const parsed = setupCreateArgsSchema.safeParse({ ...fullArgs, hacked: true })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect('hacked' in parsed.data).toBe(false)
  })
})
