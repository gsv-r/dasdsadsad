import OptionSelect from './option-select'

type RiderProps = {
  helmets?: string[]
  helmetPaints?: string[]
  ridingStyles?: string[]
  suits?: string[]
  suitPaints?: string[]
  onHelmetChange?: (value: string) => void
  onSuitChange?: (value: string) => void
  onHelmetSave?: (value: string) => void | Promise<unknown>
  onSuitSave?: (value: string) => void | Promise<unknown>
  locked?: boolean
  refreshKey?: number
}

export default function Rider({
  helmets = [],
  helmetPaints = [],
  ridingStyles = [],
  suits = [],
  suitPaints = [],
  onHelmetChange,
  onSuitChange,
  onHelmetSave,
  onSuitSave,
  locked = false,
  refreshKey = 0
}: RiderProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      <OptionSelect
        label="Helmet"
        inputId="rider-helmet"
        options={helmets}
        storeKey="practice.bike.helmet"
        defaultValue="default"
        onChange={onHelmetChange}
        save={onHelmetSave}
        disabled={locked}
        refreshKey={refreshKey}
      />
      <OptionSelect
        label="Helmet Paint"
        inputId="rider-helmet-paint"
        options={helmetPaints}
        storeKey="practice.bike.helmet_paint"
        save={(v) => window.practice.setHelmetPaint(v)}
        disabled={locked}
        refreshKey={refreshKey}
      />
      <OptionSelect
        label="Rider"
        inputId="rider-suit"
        options={suits}
        storeKey="practice.bike.rider"
        defaultValue="modern"
        onChange={onSuitChange}
        save={onSuitSave}
        disabled={locked}
        refreshKey={refreshKey}
      />
      <OptionSelect
        label="Suit Paint"
        inputId="rider-suit-paint"
        options={suitPaints}
        storeKey="practice.bike.suit_paint"
        save={(v) => window.practice.setSuitPaint(v)}
        disabled={locked}
        refreshKey={refreshKey}
      />
      <OptionSelect
        label="Riding Style"
        inputId="rider-riding-style"
        options={ridingStyles}
        storeKey="practice.bike.riding_style"
        defaultValue="modern"
        save={(v) => window.practice.selectRidingStyle(v)}
        disabled={locked}
        refreshKey={refreshKey}
      />
    </div>
  )
}
