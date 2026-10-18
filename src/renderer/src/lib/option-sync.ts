import { isBaseSelection } from './utils'

interface SyncedOption {
  display: string
  notify: string
  cache: string | null
}

function isValidOption(value: string | null, options: string[], defaultValue: string): boolean {
  if (value === null) return false
  if (isBaseSelection(value) || value === defaultValue) return true
  return options.includes(value)
}

// Pure store-vs-cache decision for OptionSelect sync. The store is the source
// of truth: a stored default is authoritative config (not "no config"), so a
// stale cache must never override it. `cache` is the repair to persist, or
// null to keep the existing cache. Never writes the store; settings only
// change by explicit user action.
export function resolveSyncedOption(
  stored: unknown,
  cached: string | null,
  visibleOptions: string[],
  defaultValue: string,
  baseOption: string
): SyncedOption {
  if (typeof stored === 'string' && visibleOptions.includes(stored)) {
    return { display: stored, notify: stored, cache: stored }
  }

  if (typeof stored === 'string' && (isBaseSelection(stored) || stored === defaultValue)) {
    return { display: baseOption, notify: defaultValue, cache: stored }
  }

  // Unknown store value (e.g. mod removed): keep a valid cache, else base.
  if (cached !== null && isValidOption(cached, visibleOptions, defaultValue)) {
    const display = isBaseSelection(cached) ? baseOption : cached
    const notify = isBaseSelection(cached) ? defaultValue : cached
    return { display, notify, cache: null }
  }

  return { display: baseOption, notify: defaultValue, cache: null }
}
