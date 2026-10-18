import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  isValidProfileFolderName,
  profileNameSchema,
  profileSaveArgsSchema,
  raceNumberSchema
} from './profiles.js'

// Oracle copied from the code before the move: the regex as it was in
// saveProfileInfo, and isValidProfileFolderName as it was in
// functions/profiles.ts. Any divergence between oracle and schema fails here.
function oldIsValidRaceNumber(value: string): boolean {
  return /^\d{1,2}$/.test(value)
}

function oldHasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) return true
  }
  return false
}

const OLD_RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

function oldIsValidProfileFolderName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return false
  if (/[/\\]/.test(name)) return false
  if (/[<>:"|?*]/.test(name)) return false
  if (oldHasControlChar(name)) return false
  if (name.endsWith('.')) return false
  if (OLD_RESERVED.has(name.split('.')[0].toUpperCase())) return false
  return true
}

describe('raceNumberSchema', () => {
  it.each(['0', '00', '7', '99'])('accepts %s like the old check', (value) => {
    expect(raceNumberSchema.safeParse(value).success).toBe(true)
    expect(oldIsValidRaceNumber(value)).toBe(true)
  })

  it.each(['', '100', '-1', 'a1', '1 ', ' 7', '１', '1.5'])('rejects %s like the old check', (value) => {
    expect(raceNumberSchema.safeParse(value).success).toBe(false)
    expect(oldIsValidRaceNumber(value)).toBe(false)
  })
})

describe('isValidProfileFolderName', () => {
  it.each([
    'Rider',
    'My Rider 01',
    'São João',
    'Pista São João',
    'name with spaces',
    'a'.repeat(64),
    '🏍rider',
    'name.with.dots'
  ])('accepts %s like before the move', (value) => {
    expect(isValidProfileFolderName(value)).toBe(true)
    expect(oldIsValidProfileFolderName(value)).toBe(true)
  })

  it.each([
    '',
    '.',
    '..',
    'a/b',
    'a\\b',
    'a<b',
    'a>b',
    'a:b',
    'a"b',
    'a|b',
    'a?b',
    'a*b',
    'name\n',
    'na\rme',
    'name\t',
    'trailing.',
    'CON',
    'con',
    'Prn',
    'AUX',
    'nul',
    'COM1',
    'com9',
    'LPT1',
    'lpt9',
    'CON.txt'
  ])('rejects %s like before the move', (value) => {
    expect(isValidProfileFolderName(value)).toBe(false)
    expect(oldIsValidProfileFolderName(value)).toBe(false)
  })
})

describe('profileSaveArgsSchema', () => {
  it('accepts a well-formed save', () => {
    expect(
      profileSaveArgsSchema.safeParse({ id: 'Rider', name: 'Rider', raceNumber: '7' }).success
    ).toBe(true)
  })

  it.each([[123], [null], [undefined], [[]]])('rejects non-string fields', (value) => {
    expect(
      profileSaveArgsSchema.safeParse({ id: value, name: 'Rider', raceNumber: '7' }).success
    ).toBe(false)
    expect(
      profileSaveArgsSchema.safeParse({ id: 'Rider', name: value, raceNumber: '7' }).success
    ).toBe(false)
    expect(
      profileSaveArgsSchema.safeParse({ id: 'Rider', name: 'Rider', raceNumber: value }).success
    ).toBe(false)
  })

  it('rejects a missing object', () => {
    expect(profileSaveArgsSchema.safeParse(null).success).toBe(false)
    expect(profileSaveArgsSchema.safeParse(undefined).success).toBe(false)
    expect(profileSaveArgsSchema.safeParse('x').success).toBe(false)
  })
})

describe('profileNameSchema', () => {
  it('rejects an empty name', () => {
    expect(profileNameSchema.safeParse('').success).toBe(false)
  })

  it('rejects a name that is only whitespace', () => {
    // Call sites trim before validating; the schema sees the trimmed value.
    expect(profileNameSchema.safeParse('   ').success).toBe(true)
  })

  it('accepts a non-empty name', () => {
    expect(profileNameSchema.safeParse('Rider').success).toBe(true)
  })

  it('accepts a single character', () => {
    expect(profileNameSchema.safeParse('A').success).toBe(true)
  })
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

  it.each(['0', '7', '99'])('raceNumberSchema accepts %s with jitless', (value) => {
    expect(raceNumberSchema.safeParse(value).success).toBe(true)
  })

  it.each(['', '100', 'a1'])('raceNumberSchema rejects %s with jitless', (value) => {
    expect(raceNumberSchema.safeParse(value).success).toBe(false)
  })

  it('profileNameSchema validates the same with jitless', () => {
    expect(profileNameSchema.safeParse('').success).toBe(false)
    expect(profileNameSchema.safeParse('Rider').success).toBe(true)
    expect(profileNameSchema.safeParse('A').success).toBe(true)
  })
})
