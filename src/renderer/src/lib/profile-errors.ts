// Single source for the profile form validation messages. The form, the
// reason mapping and the field mapping all read these constants, so the
// user-facing text exists in exactly one place.
export const ENTER_PROFILE_NAME_MESSAGE = 'Enter a profile name.'
export const ENTER_RACE_NUMBER_MESSAGE = 'Enter a race number from 0 to 99.'

// Maps the profile form error text to the field it implicates, so the
// invalid state lands on exactly one input. Matches the fixed messages set
// by the form and by saveErrorMessage, which are identical for the same
// problem on either side of the save.
export function saveErrorField(saveError: string | null): 'name' | 'raceNumber' | null {
  if (saveError === ENTER_PROFILE_NAME_MESSAGE) return 'name'
  if (saveError === ENTER_RACE_NUMBER_MESSAGE) return 'raceNumber'
  return null
}
