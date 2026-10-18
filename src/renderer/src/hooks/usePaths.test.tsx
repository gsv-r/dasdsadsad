/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { MessageModalProvider } from '../components/shared/message-modal-provider'
import {
  clearedAllErrors,
  clearedErrorForKey,
  commitErrorForKey,
  commitRejectionForKey,
  commitSettleOutcome,
  INVALID_MODS_MESSAGE,
  INVALID_PATH_MESSAGE,
  INVALID_PROFILE_MESSAGE,
  invalidFlagsForFirstIssue,
  isDuplicateCommit,
  normalizeCommitDraft,
  pathBlurOutcome,
  redetectModsError,
  redetectProfileError,
  SAVE_FAILED_MESSAGE,
  shouldResyncDraft
} from './usePaths.js'
import type { FieldErrors } from './usePaths.js'

// Hoisted mocks for tracking call order
const useModsMock = vi.hoisted(() => {
  const order: string[] = []
  return {
    invalidateModsHydration: vi.fn(() => order.push('invalidateModsHydration')),
    __order: order
  }
})

const profileCacheMock = vi.hoisted(() => {
  return {
    invalidateProfileCache: vi.fn()
  }
})

// Mock the dependencies BEFORE importing usePaths
vi.mock('./useMods.js', () => useModsMock)
vi.mock('../lib/profile-cache.js', () => profileCacheMock)

// Now import usePaths (mocks are applied)
import { usePaths } from './usePaths.js'
import { invalidateProfileCache } from '../lib/profile-cache.js'

const CLEAN: FieldErrors = { steam: null, game: null, mods: null, profile: null }

describe('invalidFlagsForFirstIssue', () => {
  it('flags only the field behind the first issue', () => {
    expect(invalidFlagsForFirstIssue([{ code: 'MODS_FOLDER_INVALID' }])).toEqual({
      steam: false,
      game: false,
      mods: true,
      profile: false
    })
  })

  it('lets the first issue mask later ones', () => {
    expect(
      invalidFlagsForFirstIssue([{ code: 'STEAM_PATH_MISSING' }, { code: 'MODS_FOLDER_INVALID' }])
    ).toEqual({ steam: true, game: false, mods: false, profile: false })
  })

  it('flags the game field on a missing game folder', () => {
    expect(invalidFlagsForFirstIssue([{ code: 'GAME_FOLDER_MISSING' }])).toEqual({
      steam: false,
      game: true,
      mods: false,
      profile: false
    })
  })

  it('never flags deeper launch requirements', () => {
    expect(invalidFlagsForFirstIssue([{ code: 'GAME_EXE_MISSING' }])).toEqual({
      steam: false,
      game: false,
      mods: false,
      profile: false
    })
    expect(invalidFlagsForFirstIssue([{ code: 'MOD_BIKE_MISSING' }])).toEqual({
      steam: false,
      game: false,
      mods: false,
      profile: false
    })
  })

  it('clears every flag once validation passes', () => {
    expect(invalidFlagsForFirstIssue([])).toEqual({
      steam: false,
      game: false,
      mods: false,
      profile: false
    })
    expect(invalidFlagsForFirstIssue(undefined)).toEqual({
      steam: false,
      game: false,
      mods: false,
      profile: false
    })
  })
})

describe('commit error state', () => {
  it('sets the fixed mods message on a rejected commit', () => {
    expect(commitErrorForKey(CLEAN, 'mods')).toEqual({ ...CLEAN, mods: INVALID_MODS_MESSAGE })
    expect(INVALID_MODS_MESSAGE).toMatch(/Invalid Mods folder/)
  })

  it('sets the fixed profile message on a rejected commit', () => {
    expect(commitErrorForKey(CLEAN, 'profile')).toEqual({
      ...CLEAN,
      profile: INVALID_PROFILE_MESSAGE
    })
    expect(INVALID_PROFILE_MESSAGE).toMatch(/Invalid Profile folder/)
  })

  it('sets the generic message for other fields', () => {
    expect(commitErrorForKey(CLEAN, 'steam')).toEqual({ ...CLEAN, steam: SAVE_FAILED_MESSAGE })
  })

  it('clears the error when the user edits after a failure', () => {
    const failed = commitErrorForKey(CLEAN, 'mods')
    expect(failed.mods).not.toBeNull()
    expect(clearedErrorForKey(failed, 'mods')).toEqual(CLEAN)
  })

  it('clears the error when a later commit succeeds', () => {
    const failed = commitErrorForKey(CLEAN, 'mods')
    expect(clearedErrorForKey(failed, 'mods').mods).toBeNull()
  })

  it('keeps the other fields untouched', () => {
    const failed = commitErrorForKey({ ...CLEAN, game: SAVE_FAILED_MESSAGE }, 'mods')
    expect(clearedErrorForKey(failed, 'mods')).toEqual({ ...CLEAN, game: SAVE_FAILED_MESSAGE })
  })
})

describe('commitRejectionForKey', () => {
  it('shows the fixed inline message for invalid-value', () => {
    expect(commitRejectionForKey(CLEAN, 'steam', 'invalid-value')).toEqual({
      ...CLEAN,
      steam: INVALID_PATH_MESSAGE
    })
    expect(INVALID_PATH_MESSAGE).toBe('Enter a valid path.')
  })

  it('shows no inline error for unknown-key', () => {
    expect(commitRejectionForKey(CLEAN, 'mods', 'unknown-key')).toEqual(CLEAN)
  })

  it('keeps the existing messages for mods and profile rejections', () => {
    expect(commitRejectionForKey(CLEAN, 'mods', 'invalid-mods-folder')).toEqual({
      ...CLEAN,
      mods: INVALID_MODS_MESSAGE
    })
    expect(commitRejectionForKey(CLEAN, 'profile', 'invalid-profile-folder')).toEqual({
      ...CLEAN,
      profile: INVALID_PROFILE_MESSAGE
    })
  })
})

describe('normalizeCommitDraft', () => {
  it('trims surrounding whitespace before persisting', () => {
    expect(normalizeCommitDraft('  C:\\mods  ')).toBe('C:\\mods')
  })

  it('keeps an already clean value as is', () => {
    expect(normalizeCommitDraft('C:\\mods')).toBe('C:\\mods')
  })

  it('maps empty text to a manual clear', () => {
    expect(normalizeCommitDraft('')).toBeNull()
    expect(normalizeCommitDraft('   ')).toBeNull()
  })
})

describe('normalizeCommitDraft equivalence', () => {
  it.each([
    ['\tindented\t', 'indented'],
    ['\nnew\nlines\n', 'new\nlines'],
    [' nbsp ', 'nbsp'],
    [' em ', 'em'],
    ['﻿bom', 'bom'],
    [' a  b ', 'a  b'],
    ['\r\ncrlf\r\n', 'crlf'],
    ['x', 'x']
  ])('maps %s exactly like String.prototype.trim with empty to null', (draft, expected) => {
    const trimmed = draft.trim()
    expect(normalizeCommitDraft(draft)).toBe(trimmed === '' ? null : trimmed)
    expect(normalizeCommitDraft(draft)).toBe(expected)
  })

  it('throws on non-string input like the manual version did', () => {
    expect(() => normalizeCommitDraft(123 as unknown as string)).toThrow()
  })
})

describe('isDuplicateCommit', () => {
  it('collapses a repeat confirmation while the commit is in flight', () => {
    expect(isDuplicateCommit({ key: 'mods', payload: 'C:\\mods' }, 'mods', 'C:\\mods')).toBe(true)
  })

  it('starts a new commit for a different payload or key', () => {
    expect(isDuplicateCommit({ key: 'mods', payload: 'C:\\a' }, 'mods', 'C:\\b')).toBe(false)
    expect(isDuplicateCommit({ key: 'mods', payload: 'C:\\a' }, 'game', 'C:\\a')).toBe(false)
  })

  it('releases the entry on settle, so retrying after a failure works', () => {
    expect(isDuplicateCommit(null, 'mods', 'C:\\mods')).toBe(false)
  })
})

describe('pathBlurOutcome', () => {
  it('discards an Escape-cancelled draft instead of committing it', () => {
    expect(pathBlurOutcome(true, false)).toBe('discard')
    expect(pathBlurOutcome(true, true)).toBe('discard')
  })

  it('discards the draft when focus moves into Reset/Redetect', () => {
    expect(pathBlurOutcome(false, true)).toBe('discard')
  })

  it('commits every other blur', () => {
    expect(pathBlurOutcome(false, false)).toBe('commit')
  })
})

describe('redetectModsError', () => {
  it('keeps the error when Auto Detect finds no mods folder', () => {
    const failed = commitErrorForKey(CLEAN, 'mods')
    expect(failed.mods).not.toBeNull()
    expect(redetectModsError(failed, null)).toEqual(failed)
  })

  it('clears the error when Auto Detect finds a valid mods folder', () => {
    const failed = commitErrorForKey(CLEAN, 'mods')
    expect(redetectModsError(failed, 'C:\\mods').mods).toBeNull()
  })

  it('keeps the other fields untouched', () => {
    const failed = commitErrorForKey({ ...CLEAN, game: SAVE_FAILED_MESSAGE }, 'mods')
    expect(redetectModsError(failed, 'C:\\mods')).toEqual({
      ...CLEAN,
      game: SAVE_FAILED_MESSAGE
    })
  })
})

describe('redetectProfileError', () => {
  it('keeps the error when Auto Detect finds no profiles folder', () => {
    const failed = commitErrorForKey(CLEAN, 'profile')
    expect(failed.profile).not.toBeNull()
    expect(redetectProfileError(failed, null)).toEqual(failed)
  })

  it('clears the error when Auto Detect finds a valid profiles folder', () => {
    const failed = commitErrorForKey(CLEAN, 'profile')
    expect(redetectProfileError(failed, 'C:\\profiles').profile).toBeNull()
  })
})

describe('shouldResyncDraft', () => {
  it('replaces the draft on explicit value changes', () => {
    expect(shouldResyncDraft(false, false)).toBe(true)
  })

  it('never resyncs while the user is typing', () => {
    expect(shouldResyncDraft(true, false)).toBe(false)
  })

  it('does not resync the prop while a rejection is displayed', () => {
    expect(shouldResyncDraft(false, true)).toBe(false)
    expect(shouldResyncDraft(true, true)).toBe(false)
  })
})

describe('commitSettleOutcome', () => {
  it('keeps the draft on rejection', () => {
    expect(commitSettleOutcome(false, 'C:\\bad', 'C:\\bad')).toBe('rejected')
  })

  it('accepts a fresh successful settlement', () => {
    expect(commitSettleOutcome(true, 'C:\\mods', 'C:\\mods')).toBe('accepted')
  })

  it('ignores a stale rejection for edited text', () => {
    expect(commitSettleOutcome(false, 'C:\\bad', 'C:\\new')).toBe('stale')
  })

  it('ignores a stale success for edited text', () => {
    expect(commitSettleOutcome(true, 'C:\\old', 'C:\\new')).toBe('stale')
  })
})

describe('explicit discards', () => {
  it('Escape and Reset drop the error with the discarded draft', () => {
    const failed = commitErrorForKey(CLEAN, 'mods')
    expect(failed.mods).not.toBeNull()
    expect(clearedErrorForKey(failed, 'mods')).toEqual(CLEAN)
  })

  it('Auto Detect drops every pending commit error', () => {
    const failed = { ...commitErrorForKey(CLEAN, 'mods'), steam: SAVE_FAILED_MESSAGE }
    expect(clearedAllErrors(failed)).toEqual(CLEAN)
  })

  it('keeps a clean state untouched', () => {
    expect(clearedAllErrors(CLEAN)).toBe(CLEAN)
  })
})

// --- Order assertion tests (added) ---

// Type for the dispatchEvent mock
type DispatchEventMock = (event: Event) => boolean

// Mock window APIs
const mockStoreGet = vi.fn()
const mockStoreSet = vi.fn()
const mockPathsDetect = vi.fn()
const mockProfilesList = vi.fn()
const mockValidationValidateApp = vi.fn()

const mockDispatchEvent = vi.fn<DispatchEventMock>(() => true)
const mockAddEventListener = vi.fn()
const mockRemoveEventListener = vi.fn()

// Test wrapper with MessageModalProvider
const wrapper = ({ children }: { children: ReactNode }) => (
  <MessageModalProvider>{children}</MessageModalProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  useModsMock.__order.length = 0
  profileCacheMock.invalidateProfileCache.mockClear()

  vi.stubGlobal('dispatchEvent', mockDispatchEvent)
  vi.stubGlobal('addEventListener', mockAddEventListener)
  vi.stubGlobal('removeEventListener', mockRemoveEventListener)

  // Mock window.store
  vi.stubGlobal('store', {
    get: mockStoreGet,
    set: mockStoreSet
  })

  // Mock window.paths
  vi.stubGlobal('paths', {
    detect: mockPathsDetect
  })

  // Mock window.profiles
  vi.stubGlobal('profiles', {
    list: mockProfilesList
  })

  // Mock window.validation
  vi.stubGlobal('validation', {
    validateApp: mockValidationValidateApp
  })

  // Mock window.mods (for revalidate event listener)
  vi.stubGlobal('mods', {
    onChanged: vi.fn(() => () => {}),
    getAll: vi.fn(() => Promise.resolve({ valid: true, ready: true, mods: {} }))
  })

  // Reset mock implementations
  mockStoreGet.mockResolvedValue(null)
  mockStoreSet.mockResolvedValue({ ok: true })
  mockPathsDetect.mockResolvedValue({
    steamPath: null,
    gamePath: null,
    modsPath: null,
    profilePath: null
  })
  mockProfilesList.mockResolvedValue([])
  mockValidationValidateApp.mockResolvedValue({ valid: true, issues: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePaths order assertions', () => {
  it('commitPath("mods") calls invalidateModsHydration before dispatchEvent("mods:revalidate")', async () => {
    mockDispatchEvent.mockImplementation((event: Event) => {
      if (event.type === 'mods:revalidate') {
        useModsMock.__order.push('dispatchEvent:mods:revalidate')
      }
      return true
    })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await result.current.commitPath('mods', 'C:\\mods')

    await waitFor(() => {
      expect(useModsMock.__order).toEqual(['invalidateModsHydration', 'dispatchEvent:mods:revalidate'])
    })
  })

  it('redetect() calls invalidateModsHydration before dispatchEvent("mods:revalidate")', async () => {
    mockDispatchEvent.mockImplementation((event: Event) => {
      if (event.type === 'mods:revalidate') {
        useModsMock.__order.push('dispatchEvent:mods:revalidate')
      }
      return true
    })

    mockPathsDetect.mockResolvedValue({
      steamPath: 'C:\\steam',
      gamePath: 'C:\\game',
      modsPath: 'C:\\mods',
      profilePath: 'C:\\profiles'
    })
    mockStoreSet.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await result.current.redetect()

    await waitFor(() => {
      expect(useModsMock.__order).toEqual(['invalidateModsHydration', 'dispatchEvent:mods:revalidate'])
    })
  })

  it('resetPath("mods") calls invalidateModsHydration before dispatchEvent("mods:revalidate")', async () => {
    mockDispatchEvent.mockImplementation((event: Event) => {
      if (event.type === 'mods:revalidate') {
        useModsMock.__order.push('dispatchEvent:mods:revalidate')
      }
      return true
    })

    mockStoreSet.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    result.current.resetPath('mods')

    await waitFor(() => {
      expect(useModsMock.__order).toEqual(['invalidateModsHydration', 'dispatchEvent:mods:revalidate'])
    })
  })

  it('commitPath("profile") calls invalidateProfileCache', async () => {
    mockProfilesList.mockResolvedValue([{ id: 'profile1', name: 'Profile 1', raceNumber: '1' }])
    mockStoreSet.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await result.current.commitPath('profile', 'C:\\profiles')

    expect(invalidateProfileCache).toHaveBeenCalled()
  })

  it('redetect() calls invalidateProfileCache', async () => {
    mockPathsDetect.mockResolvedValue({
      steamPath: 'C:\\steam',
      gamePath: 'C:\\game',
      modsPath: 'C:\\mods',
      profilePath: 'C:\\profiles'
    })
    mockStoreSet.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    await result.current.redetect()

    expect(invalidateProfileCache).toHaveBeenCalled()
  })

  it('resetPath("profile") calls invalidateProfileCache', async () => {
    mockStoreSet.mockResolvedValue({ ok: true })

    const { result } = renderHook(() => usePaths(), { wrapper })

    await waitFor(() => expect(result.current.loaded).toBe(true))

    result.current.resetPath('profile')

    await waitFor(() => expect(invalidateProfileCache).toHaveBeenCalled())
  })
})