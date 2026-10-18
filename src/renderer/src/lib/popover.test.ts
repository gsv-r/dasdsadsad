import { describe, expect, it } from 'vitest'
import { placePanel } from './popover'

describe('placePanel', () => {
  it('opens below the anchor when it fits', () => {
    expect(
      placePanel({ top: 100, bottom: 140, left: 20, width: 200 }, 800, 320)
    ).toEqual({ top: 144, left: 20, width: 200 })
  })

  it('opens above the anchor, bottom-anchored, when it does not fit below', () => {
    expect(
      placePanel({ top: 600, bottom: 640, left: 20, width: 200 }, 800, 320)
    ).toEqual({ bottom: 204, left: 20, width: 200 })
  })

  it('opens below when it fits exactly', () => {
    expect(placePanel({ top: 436, bottom: 476, left: 0, width: 100 }, 800, 320)).toEqual({
      top: 480,
      left: 0,
      width: 100
    })
  })
})
