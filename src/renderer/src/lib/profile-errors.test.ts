import { describe, expect, it } from 'vitest'
import {
  ENTER_PROFILE_NAME_MESSAGE,
  ENTER_RACE_NUMBER_MESSAGE,
  saveErrorField
} from './profile-errors.js'

describe('profile validation messages', () => {
  it('holds the exact user-facing text in one place', () => {
    expect(ENTER_PROFILE_NAME_MESSAGE).toBe('Enter a profile name.')
    expect(ENTER_RACE_NUMBER_MESSAGE).toBe('Enter a race number from 0 to 99.')
  })
})

describe('saveErrorField', () => {
  it('returns null without an error', () => {
    expect(saveErrorField(null)).toBeNull()
  })

  it('points at the name field', () => {
    expect(saveErrorField(ENTER_PROFILE_NAME_MESSAGE)).toBe('name')
  })

  it('points at the race number field', () => {
    expect(saveErrorField(ENTER_RACE_NUMBER_MESSAGE)).toBe('raceNumber')
  })

  it('points at no field for anything else', () => {
    expect(saveErrorField('A profile with this name already exists.')).toBeNull()
    expect(
      saveErrorField('The selected profile is no longer available. Reopen the Profile tab and try again.')
    ).toBeNull()
    expect(
      saveErrorField('Could not write the profile files. Close the game, check the Profile Path in Settings, and try again.')
    ).toBeNull()
    expect(saveErrorField('Profile not found. Check Profile Path in Settings.')).toBeNull()
    expect(saveErrorField('Could not save the profile. Check the values and try again.')).toBeNull()
    expect(saveErrorField('Could not save the nationality. Check the value and try again.')).toBeNull()
  })
})
