import { useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { Icon } from '../ui/icon'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import PathField from './path-field'
import MessageModal from '../shared/message-modal'
import { usePaths } from '@renderer/hooks/usePaths'

export default function PathsTab(): React.JSX.Element {
  const {
    values,
    isManual,
    invalid,
    fieldErrors,
    detecting,
    commitPath,
    clearFieldError,
    resetPath,
    redetect
  } = usePaths()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const hasManual = isManual.steam || isManual.game || isManual.mods || isManual.profile

  function handleDetectClick(): void {
    if (detecting) return
    if (hasManual) {
      setConfirmOpen(true)
      return
    }
    void redetect()
  }

  function handleConfirmDetect(): void {
    setConfirmOpen(false)
    void redetect()
  }

  return (
    <>
      <Card className="border-dashed border-border py-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-0">
          <CardTitle className="text-sm font-medium tracking-wide uppercase">Paths</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={detecting}
            data-skip-path-commit
            onClick={handleDetectClick}
            className="shrink-0 uppercase"
          >
            <Icon component={IconRefresh} size={16} aria-hidden="true" />
            {detecting ? 'detecting' : 'auto detect'}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Render inputs immediately from the sync paint cache; the async
              store read reconciles each field in place without swapping the tree. */}
          <div className="flex flex-col gap-4">
            <PathField
              label="Steam Path"
              inputId="settings-steam-path"
              value={values.steam}
              placeholder="Steam not found"
              isManual={isManual.steam}
              invalid={invalid.steam}
              error={fieldErrors.steam}
              disabled={detecting}
              onDraftChange={() => clearFieldError('steam')}
              onCommit={(draft) => commitPath('steam', draft)}
              onReset={() => resetPath('steam')}
            />
            <PathField
              label="Game Path"
              inputId="settings-game-path"
              value={values.game}
              placeholder="Game folder not found"
              isManual={isManual.game}
              invalid={invalid.game}
              error={fieldErrors.game}
              disabled={detecting}
              onDraftChange={() => clearFieldError('game')}
              onCommit={(draft) => commitPath('game', draft)}
              onReset={() => resetPath('game')}
            />
            <PathField
              label="Mods Path"
              inputId="settings-mods-path"
              value={values.mods}
              placeholder="Mods folder not found"
              isManual={isManual.mods}
              invalid={invalid.mods}
              error={fieldErrors.mods}
              disabled={detecting}
              onDraftChange={() => clearFieldError('mods')}
              onCommit={(draft) => commitPath('mods', draft)}
              onReset={() => resetPath('mods')}
            />
            <PathField
              label="Profile Path"
              inputId="settings-profile-path"
              value={values.profile}
              placeholder="Profile folder not found"
              isManual={isManual.profile}
              invalid={invalid.profile}
              error={fieldErrors.profile}
              disabled={detecting}
              onDraftChange={() => clearFieldError('profile')}
              onCommit={(draft) => commitPath('profile', draft)}
              onReset={() => resetPath('profile')}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Paths are loaded from saved settings. Automatic detection only runs when you
              click auto detect, and it overwrites the saved values. Edited text saves when
              you press Enter or leave the field; an invalid Mods or Profile folder is
              rejected.
            </p>
          </div>
        </CardContent>
      </Card>
      <MessageModal
        open={confirmOpen}
        title="Run automatic detection?"
        message="Automatic detection will reset your manually configured paths. Do you want to continue?"
        type="warning"
        confirmLabel="auto detect"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDetect}
      />
    </>
  )
}
