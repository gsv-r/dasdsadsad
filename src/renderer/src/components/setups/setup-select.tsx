import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { AppliedSetupValues, PlayerSetup, SetupSelectResult } from '../../../../types/setups'

const NONE_VALUE = '__none__'
const NONE_LABEL = 'None'

// Dedicated setup selector. State lives in Practice (single useActiveSetup
// call): setupId/setups/applySetup arrive as props so the Practice `locked`
// flag updates in the same tick as the selection. Writes only via
// window.setups.select (through applySetup). No storeKey, no generic
// store:set/localStorage writes of its own. After a successful select with
// applied values, notifies Practice via onApplied so it can refresh the
// 7 practice fields synchronously.
export default function SetupSelect({
  setupId,
  setups,
  loading,
  applySetup,
  onApplied,
  disabled = false
}: {
  setupId: string | null
  setups: PlayerSetup[]
  loading: boolean
  applySetup: (id: string | null) => Promise<SetupSelectResult>
  onApplied?: (applied: AppliedSetupValues) => void
  disabled?: boolean
}): React.JSX.Element {
  const value = setupId ?? NONE_VALUE

  function handleChange(next: string): void {
    if (next === NONE_VALUE) {
      void applySetup(null)
      return
    }
    void applySetup(next).then((result) => {
      if (result.ok && 'applied' in result && result.applied) {
        onApplied?.(result.applied)
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor="practice-setup">Setup</Label>
      <Select value={value} onValueChange={handleChange} disabled={disabled || loading}>
        <SelectTrigger id="practice-setup" className="w-full uppercase">
          <SelectValue placeholder={NONE_LABEL} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE} className="uppercase">
            {NONE_LABEL}
          </SelectItem>
          {setups.map((setup) => (
            <SelectItem key={setup.id} value={setup.id} className="uppercase">
              {setup.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
