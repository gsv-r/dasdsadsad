import { describe, expect, it } from 'vitest'
import {
  clearedErrorForKey,
  commitErrorForKey,
  invalidFlagsForFirstIssue,
  normalizeCommitDraft
} from './path-utils.js'
import * as hookReexports from '../hooks/usePaths.js'

// Locks the path-utils extraction: the hook keeps backward-compatible
// re-exports, but the single source of truth is lib/path-utils.ts.
describe('path-utils extraction', () => {
  it('re-exports the pure helpers from the hook path', () => {
    expect(hookReexports.invalidFlagsForFirstIssue).toBe(invalidFlagsForFirstIssue)
    expect(hookReexports.normalizeCommitDraft).toBe(normalizeCommitDraft)
    expect(hookReexports.clearedErrorForKey).toBe(clearedErrorForKey)
    expect(hookReexports.commitErrorForKey).toBe(commitErrorForKey)
  })

  it('keeps behavior identical through the new import path', () => {
    expect(normalizeCommitDraft('  C:\\mods  ')).toBe('C:\\mods')
    expect(invalidFlagsForFirstIssue([{ code: 'MODS_FOLDER_INVALID' }]).mods).toBe(true)
  })
})
