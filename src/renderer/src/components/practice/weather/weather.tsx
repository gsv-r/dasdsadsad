import type { ReactNode } from 'react'
import { Label } from '../../ui/label'
import { Checkbox } from '../../ui/checkbox'
import { Slider } from '../../ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import {
  CONDITION_OPTIONS,
  WIND_DIRECTION_OPTIONS,
  temperatureLabel,
  trackConditionLabel,
  windSpeedLabel
} from './weather-settings'
import { WEATHER_RANGES } from '../../../../../types/practice'
import { useWeatherSettings } from './use-weather-settings'

function Field({
  full = false,
  children
}: {
  full?: boolean
  children: ReactNode
}): React.JSX.Element {
  return <div className={full ? 'col-span-2 min-w-0' : 'min-w-0'}>{children}</div>
}

function RowSelect({
  label,
  inputId,
  value,
  options,
  disabled,
  onChange
}: {
  label: string
  inputId: string
  value: number
  options: { label: string; value: number }[]
  disabled?: boolean
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger id={inputId} className="w-full uppercase">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={String(option.value)} className="uppercase">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function RowSlider({
  label,
  inputId,
  value,
  min,
  max,
  disabled,
  formatValue,
  onChange
}: {
  label: string
  inputId: string
  value: number
  min: number
  max: number
  disabled?: boolean
  formatValue: (value: number) => string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-muted-foreground text-sm leading-none">{formatValue(value)}</span>
      </div>
      <Slider
        id={inputId}
        aria-label={label}
        className="h-9"
        value={[value]}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  )
}

export default function Weather(): React.JSX.Element {
  const {
    settings,
    idealLocked,
    locked,
    isTrackLocked,
    updateSetting,
    updateConditions,
    toggleIdeal
  } = useWeatherSettings()

  // Render all inputs immediately with default values; they update in place
  // when the store resolves.
  const s = settings ?? {
    conditions: 1,
    temperature: 20,
    windDirection: 0,
    windSpeed: 0,
    trackConditions: 50
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      <Field>
        <RowSelect
          label="Conditions"
          inputId="weather-conditions"
          value={s.conditions}
          options={CONDITION_OPTIONS}
          disabled={locked}
          onChange={updateConditions}
        />
      </Field>
      <Field>
        <RowSlider
          label="Temperature"
          inputId="weather-temperature"
          value={s.temperature}
          min={WEATHER_RANGES.temperature.min}
          max={WEATHER_RANGES.temperature.max}
          disabled={locked}
          formatValue={temperatureLabel}
          onChange={(value) => updateSetting('temperature', value)}
        />
      </Field>
      <Field>
        <RowSelect
          label="Wind direction"
          inputId="weather-wind-direction"
          value={s.windDirection}
          options={WIND_DIRECTION_OPTIONS}
          disabled={locked}
          onChange={(value) => updateSetting('windDirection', value)}
        />
      </Field>
      <Field>
        <RowSlider
          label="Wind speed"
          inputId="weather-wind-speed"
          value={s.windSpeed}
          min={WEATHER_RANGES.wind_speed.min}
          max={WEATHER_RANGES.wind_speed.max}
          disabled={locked}
          formatValue={windSpeedLabel}
          onChange={(value) => updateSetting('windSpeed', value)}
        />
      </Field>
      <Field>
        <RowSlider
          label="Track conditions"
          inputId="weather-track-conditions"
          value={s.trackConditions}
          min={WEATHER_RANGES.track_conditions.min}
          max={WEATHER_RANGES.track_conditions.max}
          disabled={isTrackLocked}
          formatValue={trackConditionLabel}
          onChange={(value) => updateSetting('trackConditions', value)}
        />
      </Field>
      <Field full>
        <div className="flex w-full items-center gap-2">
          <Checkbox
            id="weather-ideal"
            checked={idealLocked}
            onCheckedChange={(next) => toggleIdeal(next === true)}
          />
          <Label htmlFor="weather-ideal" className="cursor-pointer">
            Ideal conditions
          </Label>
        </div>
      </Field>
    </div>
  )
}
