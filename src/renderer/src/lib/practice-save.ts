// Decision helpers for OptionSelect saves, kept pure so they are
// unit-testable without a renderer harness (same rationale as option-sync).
// A setup-locked save never applies and reverts silently; any other
// rejection surfaces through showMessage instead.
export function isSetupLockedResult(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    (value as { ok: unknown }).ok === false
  )
}

export function saveFailureMessage(label: string): string {
  return `Could not save ${label}. Try again.`
}
