import type { MessageAction, MessagePayload } from '../components/shared/message-modal-context'
import { isSetupActive } from './setup-active'

export interface AppValidationIssue {
  code: string
  title: string
  message: string
}

export interface AppValidationResult {
  valid: boolean
  issues: AppValidationIssue[]
}

function fallbackIssue(code: string): AppValidationIssue {
  return {
    code,
    title: 'Validation failed',
    message: 'Application validation could not run. Check Settings and try again.'
  }
}

async function fetchValidation(): Promise<AppValidationResult> {
  try {
    const result = await window.validation.validateApp()
    if (result && typeof result.valid === 'boolean' && Array.isArray(result.issues)) {
      return result
    }
    return { valid: false, issues: [fallbackIssue('VALIDATION_MALFORMED')] }
  } catch (error) {
    console.error('Failed to validate application:', error)
    return { valid: false, issues: [fallbackIssue('VALIDATION_UNAVAILABLE')] }
  }
}

const ACTION_BY_CODE: Record<string, MessageAction> = {
  STEAM_PATH_MISSING: { label: 'Resolve', to: '/settings' },
  STEAM_EXE_MISSING: { label: 'Resolve', to: '/settings' },
  GAME_PATH_MISSING: { label: 'Resolve', to: '/settings' },
  GAME_FOLDER_MISSING: { label: 'Resolve', to: '/settings' },
  GAME_EXE_MISSING: { label: 'Resolve', to: '/settings' },
  GAME_FOLDER_NOT_WRITABLE: { label: 'Resolve', to: '/settings' },
  MODS_PATH_MISSING: { label: 'Resolve', to: '/settings' },
  MODS_FOLDER_INVALID: { label: 'Resolve', to: '/settings' },
  MODS_FOLDER_MISSING: { label: 'Resolve', to: '/settings' },
  PROFILE_PATH_MISSING: { label: 'Resolve', to: '/settings' },
  PROFILE_FOLDER_INVALID: { label: 'Resolve', to: '/settings' },
  PROFILE_FOLDER_MISSING: { label: 'Resolve', to: '/settings' },
  PROFILE_INI_MISSING: { label: 'Resolve', to: '/settings' },
  PROFILE_NOT_FOUND: { label: 'Resolve', to: '/settings' },
  PROFILE_NAME_MISSING: { label: 'Resolve', to: '/profile' },
  PROFILE_RACE_NUMBER_MISSING: { label: 'Resolve', to: '/profile' },
  PROFILE_NATIONALITY_MISSING: { label: 'Resolve', to: '/profile' },
  MOD_BIKE_MISSING: { label: 'Resolve', to: '/bikes' },
  MOD_BIKE_PAINT_MISSING: { label: 'Resolve', to: '/bikes' },
  MOD_TRACK_MISSING: { label: 'Resolve', to: '/tracks' },
  MOD_TRACK_LAYOUT_MISSING: { label: 'Resolve', to: '/tracks' },
  MOD_RIDER_MISSING: { label: 'Resolve', to: '/' },
  MOD_SUIT_PAINT_MISSING: { label: 'Resolve', to: '/' },
  MOD_HELMET_MISSING: { label: 'Resolve', to: '/' },
  MOD_HELMET_PAINT_MISSING: { label: 'Resolve', to: '/' },
  MOD_RIDING_STYLE_MISSING: { label: 'Resolve', to: '/' },
  PRACTICE_BIKE_MISSING: { label: 'Resolve', to: '/bikes' },
  PRACTICE_TRACK_MISSING: { label: 'Resolve', to: '/tracks' },
  PRACTICE_SETTINGS_INVALID: { label: 'Resolve', to: '/' },
  PRACTICE_CONFIG_UNREADABLE: { label: 'Resolve', to: '/settings' }
}

// Setup-locked mod codes resolve to /profile when a valid setup is active.
const SETUP_CODES = new Set([
  'MOD_BIKE_MISSING',
  'MOD_BIKE_PAINT_MISSING',
  'MOD_RIDER_MISSING',
  'MOD_SUIT_PAINT_MISSING',
  'MOD_HELMET_MISSING',
  'MOD_HELMET_PAINT_MISSING',
  'MOD_RIDING_STYLE_MISSING',
  'PRACTICE_BIKE_MISSING'
])

function resolveActionForCode(code: string, setupActive = false): MessageAction | undefined {
  if (setupActive && SETUP_CODES.has(code)) return { label: 'Resolve', to: '/profile' }
  return ACTION_BY_CODE[code]
}

function toPayload(result: AppValidationResult, setupActive = false): MessagePayload {
  const [first, ...rest] = result.issues
  const issue = first ?? fallbackIssue('VALIDATION_EMPTY')
  const action = resolveActionForCode(issue.code, setupActive)
  return {
    title: issue.title,
    message:
      rest.length > 0 ? `${issue.message} (${rest.length} more issue(s) to fix.)` : issue.message,
    type: 'error',
    ...(action ? { action } : {})
  }
}

// Central reusable gate for any flow that requires a valid configuration.
// Returns true when the action may continue, false when it must be blocked.
// On failure the error modal is shown with exactly what must be fixed, so
// callers only need: `if (!(await validateAppOrNotify(showMessage))) return`.
// Launch (Go Ride) is the exclusive display point: no screen shows this
// modal on navigation or section access.
export async function validateAppOrNotify(
  showMessage: (payload: MessagePayload) => void
): Promise<boolean> {
  const result = await fetchValidation()
  if (result.valid) return true
  const setupActive = await isSetupActive()
  showMessage(toPayload(result, setupActive))
  return false
}
