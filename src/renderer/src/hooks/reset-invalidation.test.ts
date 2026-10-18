import { describe, expect, it } from 'vitest'
import { invalidateActiveSetupSnapshot } from './useActiveSetup.js'
import { invalidateModsSnapshot } from './useMods.js'
import { invalidateProfileScreenSnapshot } from '../lib/profile-cache.js'
import { clearCachedPractice } from '../lib/practice-cache.js'
import { invalidateSetupsSnapshot } from './useSetups.js'

describe('reset invalidation', () => {
  it('clears every module snapshot without throwing, so post-reset mounts load from the store', () => {
    expect(() => {
      invalidateSetupsSnapshot()
      invalidateActiveSetupSnapshot()
      invalidateModsSnapshot()
      invalidateProfileScreenSnapshot()
      clearCachedPractice()
    }).not.toThrow()
  })
})
