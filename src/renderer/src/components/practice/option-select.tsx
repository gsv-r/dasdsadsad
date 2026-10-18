import { useEffect, useMemo, useState } from 'react'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ensurePracticeValidated } from '../../lib/practice-validate'
import { isBaseSelection } from '../../lib/utils'
import { readCachedString, removeCachedKey, writeCachedString } from '../../lib/cache-utils'
import { resolveSyncedOption } from '../../lib/option-sync'
import { isSetupLockedResult, saveFailureMessage } from '../../lib/practice-save'
import { useMessage } from '../shared/message-modal-context'
import type { StoreReadKey } from '../../../../types/store'

type OptionSelectProps = {
  label: string
  inputId: string
  options: string[]
  storeKey: StoreReadKey
  defaultValue?: string
  onChange?: (value: string) => void
  save?: (value: string) => unknown
  disabled?: boolean
  refreshKey?: number
}

// Internal value shown when nothing is stored or the stored value is gone.
// Never written to the store; selecting it writes defaultValue instead.
const BASE_OPTION = 'default'

function readCachedDisplay(storeKey: string, defaultValue: string): string | null {
  const raw = readCachedString(storeKey)
  if (raw === null) return null
  if (isBaseSelection(raw) || raw === defaultValue) return BASE_OPTION
  return raw
}

function readCachedValue(storeKey: string): string | null {
  return readCachedString(storeKey)
}

function writeCachedValue(storeKey: string, value: string): void {
  writeCachedString(storeKey, value)
}

function isValidOption(value: string | null, options: string[], defaultValue: string): boolean {
  if (value === null) return false
  if (isBaseSelection(value) || value === defaultValue) return true
  return options.includes(value)
}

export default function OptionSelect({
  label,
  inputId,
  options,
  storeKey,
  defaultValue = '',
  onChange,
  save,
  disabled = false,
  refreshKey = 0
}: OptionSelectProps): React.JSX.Element {
  const { showMessage } = useMessage()
  // null = no cache and store not read yet. With cache, open directly on the saved value.
  const [value, setValue] = useState<string | null>(() => readCachedDisplay(storeKey, defaultValue))

  const baseLabel = defaultValue || 'default'
  const visibleOptions = useMemo(
    () => options.filter((o) => o !== BASE_OPTION && o !== defaultValue && o !== baseLabel),
    [options, defaultValue, baseLabel]
  )
  const optionsKey = visibleOptions.join('|')

  // A setup select writes the cache synchronously before bumping refreshKey.
  // Adopt the fresh cache during render (before paint): the next paint shows
  // the setup value instead of flashing the old local value. Never keep a
  // stale local value across a refresh.
  const [lastRefresh, setLastRefresh] = useState(refreshKey)
  if (lastRefresh !== refreshKey) {
    setLastRefresh(refreshKey)
    const fresh = readCachedDisplay(storeKey, defaultValue)
    if (fresh !== null && fresh !== value) {
      setValue(isValidOption(fresh, visibleOptions, defaultValue) ? fresh : BASE_OPTION)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (visibleOptions.length === 0) {
      setValue(BASE_OPTION)
      onChange?.(defaultValue)
      return
    }

    ensurePracticeValidated()
      .then(() => window.store.get(storeKey))
      .then((stored) => {
        if (cancelled) return

        const synced = resolveSyncedOption(
          stored,
          readCachedValue(storeKey),
          visibleOptions,
          defaultValue,
          BASE_OPTION
        )
        if (synced.cache !== null) {
          // Store-authoritative (only these branches repair the cache):
          // overwrite any stale display outright so a dead selection can
          // never survive by being a "still valid" previous value.
          writeCachedValue(storeKey, synced.cache)
          setValue(synced.display)
        } else {
          setValue((prev) =>
            prev !== null && isValidOption(prev, visibleOptions, defaultValue)
              ? prev
              : synced.display
          )
        }
        onChange?.(synced.notify)
      })
      .catch((error) => console.error(`Failed to sync select "${storeKey}":`, error))

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, defaultValue, optionsKey, refreshKey])

  function handleChange(next: string): void {
    const prev = value
    const prevCache = readCachedValue(storeKey)
    setValue(next)
    const mapped = next === BASE_OPTION ? defaultValue : next
    writeCachedString(storeKey, mapped)
    function revertToPrev(): void {
      if (prev === null) return
      setValue(prev)
      if (prevCache === null) {
        removeCachedKey(storeKey)
      } else {
        writeCachedString(storeKey, prevCache)
      }
      onChange?.(prev === BASE_OPTION ? defaultValue : prev)
    }
    const persist = save ?? ((v: string) => window.store.set(storeKey, v).then(() => window.practice.sync()))
    Promise.resolve()
      .then(() => persist(mapped))
      .then((result) => {
        // A setup-locked save never applies: drop the optimistic update and
        // restore the previous display, cache and parent notification. Any
        // other result keeps the existing behavior untouched.
        if (isSetupLockedResult(result)) {
          revertToPrev()
        }
      })
      .catch((error) => {
        console.error(`Failed to save select "${storeKey}":`, error)
        revertToPrev()
        showMessage({ title: 'Save failed', message: saveFailureMessage(label), type: 'error' })
      })
    onChange?.(mapped)
  }

  // Render the select immediately with a default value; the actual value
  // updates in place when the cache/store resolves.
  const displayValue = value ?? BASE_OPTION

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Select value={displayValue} onValueChange={handleChange} disabled={visibleOptions.length === 0 || disabled}>
        <SelectTrigger id={inputId} className="w-full uppercase">
          <SelectValue placeholder={baseLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BASE_OPTION} className="uppercase">
            {baseLabel}
          </SelectItem>
          {visibleOptions.map((option) => (
            <SelectItem key={option} value={option} className="uppercase">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
