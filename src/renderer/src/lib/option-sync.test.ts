import { describe, expect, it } from 'vitest'
import { resolveSyncedOption } from './option-sync'

const STYLES = ['style_1', 'style_2', 'style_3', 'style_4', 'Style 5']
const BASE_OPTION = 'default'

describe('resolveSyncedOption', () => {
  it('stored default beats a stale cache (bike selection must not flip riding style)', () => {
    // Store holds the default 'modern'; localStorage still has 'Style 5'
    // from an earlier explicit pick. The dead selection must not win.
    expect(resolveSyncedOption('modern', 'Style 5', STYLES, 'modern', BASE_OPTION)).toEqual({
      display: 'default',
      notify: 'modern',
      cache: 'modern'
    })
  })

  it('stored custom selection in options wins and repairs the cache', () => {
    expect(resolveSyncedOption('Style 5', 'style_1', STYLES, 'modern', BASE_OPTION)).toEqual({
      display: 'Style 5',
      notify: 'Style 5',
      cache: 'Style 5'
    })
  })

  it('stored base selection settles base and repairs the cache', () => {
    expect(resolveSyncedOption('', 'Style 5', STYLES, 'modern', BASE_OPTION)).toEqual({
      display: 'default',
      notify: 'modern',
      cache: ''
    })
  })

  it('unknown store value (mod removed) keeps a valid cache without touching the store', () => {
    expect(
      resolveSyncedOption('removed_style', 'Style 5', STYLES, 'modern', BASE_OPTION)
    ).toEqual({
      display: 'Style 5',
      notify: 'Style 5',
      cache: null
    })
  })

  it('unknown store value without cache falls back to base', () => {
    expect(resolveSyncedOption('removed_style', null, STYLES, 'modern', BASE_OPTION)).toEqual({
      display: 'default',
      notify: 'modern',
      cache: null
    })
    expect(resolveSyncedOption(undefined, null, STYLES, 'modern', BASE_OPTION)).toEqual({
      display: 'default',
      notify: 'modern',
      cache: null
    })
  })

  it('base cache maps to base display', () => {
    expect(resolveSyncedOption('removed_style', 'default', STYLES, 'modern', BASE_OPTION)).toEqual(
      {
        display: 'default',
        notify: 'modern',
        cache: null
      }
    )
  })
})
