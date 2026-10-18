import { describe, expect, it } from 'vitest'
import {
  practiceSelectBikeArgs,
  practiceSelectHelmetArgs,
  practiceSelectRiderArgs,
  practiceSelectRidingStyleArgs,
  practiceSelectTrackArgs,
  practiceSetBikePaintArgs,
  practiceSetHelmetPaintArgs,
  practiceSetSuitPaintArgs,
  practiceSetTrackLayoutArgs
} from './practiceArgs.js'

describe('practice arg ids', () => {
  it.each([
    ['bikeA'],
    ['Adriatic'],
    ['modern'],
    ['default'],
    ['schwaben_m2_18'],
    [''],
    ['bike with spaces'],
    ['name (2)']
  ])('accepts the real values callers send: %s', (value) => {
    expect(practiceSelectBikeArgs.safeParse({ bikeId: value, paints: [] }).success).toBe(true)
    expect(practiceSetBikePaintArgs.safeParse({ paint: value }).success).toBe(true)
  })

  it.each([['a/b'], ['a\\b'], ['a:b'], ['a*b'], ['a?b'], ['a<b'], ['a"b'], ['a|b'], ['a\nb']])(
    'rejects separators, reserved symbols and control characters: %s',
    (value) => {
      expect(practiceSelectBikeArgs.safeParse({ bikeId: value, paints: [] }).success).toBe(false)
      expect(practiceSetBikePaintArgs.safeParse({ paint: value }).success).toBe(false)
    }
  )

  it('rejects mistyped ids', () => {
    for (const value of [123, null, undefined, {}, []]) {
      expect(practiceSelectBikeArgs.safeParse({ bikeId: value, paints: [] }).success).toBe(false)
    }
  })
})

describe('practice paint lists', () => {
  it('accepts arrays, missing and null like the main process already does', () => {
    for (const paints of [['p1', 'p2'], [], undefined, null]) {
      expect(practiceSelectBikeArgs.safeParse({ bikeId: 'bikeA', paints }).success).toBe(true)
      expect(
        practiceSelectTrackArgs.safeParse({ trackId: 'trackA', layouts: paints }).success
      ).toBe(true)
      expect(practiceSelectHelmetArgs.safeParse({ helmetId: 'h', paints }).success).toBe(true)
      expect(practiceSelectRiderArgs.safeParse({ suitId: 's', paints }).success).toBe(true)
    }
  })

  it('rejects non-arrays and non-string elements', () => {
    for (const paints of ['p1', 123, {}, [123], [null]]) {
      expect(practiceSelectBikeArgs.safeParse({ bikeId: 'bikeA', paints }).success).toBe(false)
    }
  })
})

describe('practice single-value args', () => {
  it('accepts real values including empty reset', () => {
    expect(practiceSetBikePaintArgs.safeParse({ paint: '' }).success).toBe(true)
    expect(practiceSetTrackLayoutArgs.safeParse({ layout: '' }).success).toBe(true)
    expect(practiceSetHelmetPaintArgs.safeParse({ paint: 'p1' }).success).toBe(true)
    expect(practiceSetSuitPaintArgs.safeParse({ paint: 'p1' }).success).toBe(true)
    expect(practiceSelectRidingStyleArgs.safeParse({ styleId: 'modern' }).success).toBe(true)
  })

  it('rejects a missing value', () => {
    expect(practiceSetBikePaintArgs.safeParse({}).success).toBe(false)
    expect(practiceSelectRidingStyleArgs.safeParse({}).success).toBe(false)
  })
})
