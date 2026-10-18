import { useEffect, useMemo, useState } from 'react'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { isBaseSelection } from '../../lib/utils'

// Controlled select for the Setups editor: no store persistence, no cache sync.
type ControlledSelectProps = {
  label: string
  inputId: string
  options: string[]
  value: string
  onChange: (value: string) => void
  defaultValue?: string
  disabled?: boolean
}

const BASE_OPTION = 'default'

export default function ControlledSelect({
  label,
  inputId,
  options,
  value,
  onChange,
  defaultValue = '',
  disabled = false
}: ControlledSelectProps): React.JSX.Element {
  const baseLabel = defaultValue || 'default'
  const visibleOptions = useMemo(
    () => options.filter((o) => o !== BASE_OPTION && o !== defaultValue && o !== baseLabel),
    [options, defaultValue, baseLabel]
  )

  // Initial value from cache or passed value
  const [displayValue, setDisplayValue] = useState<string>(() => {
    // For controlled component, we use the passed value directly
    if (isBaseSelection(value) || value === defaultValue || value === '') return BASE_OPTION
    // A value missing from the scanned mods still shows as its own id
    // marked "(missing)" instead of silently falling back to default.
    return value
  })

  // Keep displayValue in sync with controlled value prop
  useEffect(() => {
    if (isBaseSelection(value) || value === defaultValue || value === '') {
      setDisplayValue(BASE_OPTION)
    } else {
      setDisplayValue(value)
    }
  }, [value, defaultValue, visibleOptions])

  function handleChange(next: string): void {
    // The "(missing)" entry is display-only: picking a real option (or the
    // base) replaces it; it can never be written back as a new value.
    if (next !== BASE_OPTION && !visibleOptions.includes(next)) return
    setDisplayValue(next)
    const mapped = next === BASE_OPTION ? defaultValue : next
    onChange(mapped)
  }

  // A stored id with no scanned mod behind it: shown verbatim with a marker.
  const showMissing = displayValue !== BASE_OPTION && !visibleOptions.includes(displayValue)

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Select
        value={displayValue}
        onValueChange={handleChange}
        disabled={disabled || visibleOptions.length === 0}
      >
        <SelectTrigger id={inputId} className="w-full uppercase">
          <SelectValue placeholder={baseLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BASE_OPTION} className="uppercase">
            {baseLabel}
          </SelectItem>
          {showMissing && (
            <SelectItem value={displayValue} className="uppercase">
              {displayValue} (missing)
            </SelectItem>
          )}
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
