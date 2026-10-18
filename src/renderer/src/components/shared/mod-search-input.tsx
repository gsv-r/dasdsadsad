import { Input } from '../ui/input'

type ModSearchInputProps = {
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}

// Reusable search field for Bikes and Tracks. Always mounted by the
// parent; disabled while pending. No validation, no debounce.
export default function ModSearchInput({
  value,
  placeholder,
  disabled,
  onChange
}: ModSearchInputProps): React.JSX.Element {
  return (
    <Input
      type="search"
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="mod-search-input w-48 min-w-0 shrink"
    />
  )
}
