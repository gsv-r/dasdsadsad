import { useCallback, useEffect, useState } from 'react'
import Layout from '../components/frame/layout'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import NationalityField from '../components/profile/nationality-field'
import SetupsCard from '../components/setups/setups-card'
import { cn } from '@renderer/lib/utils'
import { normalizeNationality } from '@renderer/lib/countries'
import {
  readCachedActiveProfile,
  readCachedNationality,
  readProfileScreenSnapshot,
  writeCachedActiveProfile,
  writeCachedNationality,
  writeProfileScreenSnapshot
} from '@renderer/lib/profile-cache'
import {
  ENTER_PROFILE_NAME_MESSAGE,
  ENTER_RACE_NUMBER_MESSAGE,
  saveErrorField
} from '@renderer/lib/profile-errors'
import type { PlayerProfile } from '../../../types/profiles'
import { profileNameSchema, raceNumberSchema } from '../../../types/profiles'

function saveErrorMessage(reason: string): string {
  if (reason === 'invalid-name') return ENTER_PROFILE_NAME_MESSAGE
  if (reason === 'invalid-race-number') return ENTER_RACE_NUMBER_MESSAGE
  if (reason === 'name-taken') return 'A profile with this name already exists.'
  if (reason === 'invalid-id')
    return 'The selected profile is no longer available. Reopen the Profile tab and try again.'
  if (reason === 'write-failed')
    return 'Could not write the profile files. Close the game, check the Profile Path in Settings, and try again.'
  if (reason === 'profile-not-found') return 'Profile not found. Check Profile Path in Settings.'
  return 'Could not save the profile. Check the values and try again.'
}

// Race numbers are integers from 0 to 99: at most 2 digits.
function sanitizeRaceNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 2)
}

export default function Profile(): React.JSX.Element {
  // Seed every field from the sync paint cache so frame zero already shows
  // the saved profile instead of flashing empty inputs (same rationale as
  // the paths paint cache). profile.ini + the store stay the source of
  // truth: the loader below reconciles in place. The seeded values double
  // as the born-filled edit draft: typing mutates this same state.
  // The module snapshot wins over localStorage: it remembers a confirmed
  // empty (null) across navigation, so re-entry never blanks then pops.
  const [initialActive] = useState<PlayerProfile | null>(() => {
    const snapshot = readProfileScreenSnapshot()
    return snapshot !== undefined ? snapshot : readCachedActiveProfile()
  })
  const [initialNationality] = useState<string | null>(() => readCachedNationality())
  const [active, setActive] = useState<PlayerProfile | null>(initialActive)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(
    () => readProfileScreenSnapshot() === undefined && initialActive === null
  )
  const [name, setName] = useState(() => initialActive?.name ?? '')
  const [raceNumber, setRaceNumber] = useState(() => initialActive?.raceNumber ?? '')
  const [storedNationality, setStoredNationality] = useState<string | null>(initialNationality)
  const [nationality, setNationality] = useState<string | null>(initialNationality)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Single loader for mount and explicit outside updates (profiles:save,
  // Reset My Launcher): the store/file stay the source of truth, like every
  // other launcher input.
  const loadProfile = useCallback((): Promise<void> => {
    return Promise.all([window.profiles.active(), window.store.get('profile.nationality')]).then(
      ([found, rawNationality]) => {
        setActive(found)
        // Confirmed result feeds both the paint cache and the module
        // snapshot: the next mount seeds from it without a loading flash.
        writeProfileScreenSnapshot(found)
        // Keep the paint cache warm from the source of truth so the next
        // mount seeds from current data.
        writeCachedActiveProfile(found)
        setName(found?.name ?? '')
        setRaceNumber(found?.raceNumber ?? '')
        // Without a stored nationality nothing is pre-selected: the field
        // shows a neutral placeholder until the user picks an option.
        const validNationality = normalizeNationality(rawNationality)
        setStoredNationality(validNationality)
        setNationality(validNationality)
        writeCachedNationality(validNationality)
        setLoadError(null)
      }
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadProfile()
      .catch((error) => {
        console.error('Failed to load the profile:', error)
        if (cancelled) return
        setLoadError('Could not load the profile. Check Profile Path in Settings.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadProfile])

  // A global reset clears the profile store keys and the active profile.ini
  // while this screen may stay mounted: reload on the same explicit event
  // profiles:save emits, so name/number/nationality
  // never show stale values. No focus reload here: unlike the display-only
  // consumers, these inputs hold unsaved typing that a focus fetch would
  // clobber.
  useEffect(() => {
    const onProfilesChanged = (): void => {
      void loadProfile().catch((error) => {
        console.error('Failed to reload the profile:', error)
      })
    }
    window.addEventListener('profiles:changed', onProfilesChanged)
    return () => window.removeEventListener('profiles:changed', onProfilesChanged)
  }, [loadProfile])

  const dirty =
    name !== active?.name ||
    raceNumber !== (active?.raceNumber ?? '') ||
    nationality !== storedNationality

  // Fields are enabled only after loading completes successfully with a valid profile.
  const fieldsEnabled = !loading && loadError === null && active !== null

  function handleNameChange(value: string): void {
    setName(value)
    setSaveError(null)
    setSaved(false)
  }

  function handleRaceChange(value: string): void {
    setRaceNumber(sanitizeRaceNumber(value))
    setSaveError(null)
    setSaved(false)
  }

  function handleNationalityChange(code: string): void {
    setNationality(code)
    setSaveError(null)
    setSaved(false)
  }

  function handleSave(): void {
    const current = active
    if (saving || !dirty || current === null) return
    if (!profileNameSchema.safeParse(name.trim()).success) {
      setSaveError(ENTER_PROFILE_NAME_MESSAGE)
      return
    }
    if (!raceNumberSchema.safeParse(raceNumber).success) {
      setSaveError(ENTER_RACE_NUMBER_MESSAGE)
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    const snapshot = { id: current.id, name, raceNumber }
    const nextNationality = nationality
    void window.profiles
      .save(snapshot)
      .then((result) => {
        if (!result.ok) {
          console.error('Profile save rejected:', result.reason)
          setSaveError(saveErrorMessage(result.reason))
          return false
        }
        return window.store.set('profile.nationality', nextNationality).then((storeResult) => {
          if (!storeResult.ok) {
            setSaveError('Could not save the nationality. Check the value and try again.')
            return false
          }
          return true
        })
      })
      .then((ok) => {
        if (!ok) return
        // A rejection keeps the typed text; acceptance flows back into the
        // saved values so the form is clean again. The main process renames
        // the profile folder to the new name, so the selection follows the
        // committed name (the new folder id), not the stale one.
        const nextName = name.trim()
        const nextRace = raceNumber.trim()
        setActive({ id: nextName, name: nextName, raceNumber: nextRace })
        // The accepted values are the new paint cache so a remount before
        // any reload still seeds from them.
        writeProfileScreenSnapshot({ id: nextName, name: nextName, raceNumber: nextRace })
        writeCachedActiveProfile({ id: nextName, name: nextName, raceNumber: nextRace })
        setName(nextName)
        setRaceNumber(nextRace)
        setStoredNationality(nextNationality)
        writeCachedNationality(nextNationality)
        setSaved(true)
        window.dispatchEvent(new Event('profiles:changed'))
      })
      .catch((error) => {
        console.error('Failed to save the profile:', error)
        setSaveError('Could not save the profile. Check the values and try again.')
      })
      .finally(() => setSaving(false))
  }

  return (
    <Layout>
      <div className="scroll flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <Card className="shrink-0 border-dashed border-border py-4">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium tracking-wide uppercase">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Confirmed load error only: the inputs show the active
                profile. No reserved height for user-action save error — it
                appears inline without shift. */}
              <div aria-live="polite" className="empty:hidden">
                {loadError ? (
                  <p className="text-xs leading-relaxed text-muted-foreground select-text">
                    {loadError}
                  </p>
                ) : null}
                {!loadError && saveError ? (
                  <p className="text-xs leading-relaxed text-destructive select-text">
                    {saveError}
                  </p>
                ) : null}
              </div>
              {/* Static guidance, always visible: true with or without a profile. */}
              <p className="text-xs leading-relaxed text-muted-foreground select-text">
                The active profile is read from Profile Path in Settings.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex w-full flex-col gap-1.5">
                  <Label htmlFor="profile-name">Name</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    placeholder="Profile name"
                    spellCheck={false}
                    autoComplete="off"
                    disabled={saving || !fieldsEnabled}
                    aria-invalid={saveErrorField(saveError) === 'name' ? true : undefined}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className={cn(saveErrorField(saveError) === 'name' && 'border-destructive')}
                  />
                </div>
                <NationalityField
                  value={nationality}
                  disabled={saving || !fieldsEnabled}
                  onChange={handleNationalityChange}
                />
                <div className="flex w-full flex-col gap-1.5">
                  <Label htmlFor="profile-race-number">Race number</Label>
                  <Input
                    id="profile-race-number"
                    value={raceNumber}
                    placeholder="Race number"
                    spellCheck={false}
                    autoComplete="off"
                    inputMode="numeric"
                    disabled={saving || !fieldsEnabled}
                    aria-invalid={saveErrorField(saveError) === 'raceNumber' ? true : undefined}
                    onChange={(e) => handleRaceChange(e.target.value)}
                    className={cn(
                      saveErrorField(saveError) === 'raceNumber' && 'border-destructive'
                    )}
                  />
                </div>
              </div>
              {/* Save feedback shares the button row: the row height comes from
                the button, so a single-line message never moves layout. */}
              <div className="flex items-center justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!dirty || saving || !fieldsEnabled}
                  onClick={handleSave}
                  className="shrink-0 uppercase"
                >
                  {saving ? 'saving' : 'save'}
                </Button>
                {!loadError && !saveError && saved ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">Saved.</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
        <SetupsCard />
      </div>
    </Layout>
  )
}
