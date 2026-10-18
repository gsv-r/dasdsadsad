import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { Icon } from '../ui/icon'
import { invalidateSetupsSnapshot } from '@renderer/hooks/useSetups'
import { invalidateActiveSetupSnapshot } from '@renderer/hooks/useActiveSetup'
import { invalidateModsSnapshot } from '@renderer/hooks/useMods'
import { invalidateProfileScreenSnapshot } from '@renderer/lib/profile-cache'
import { clearCachedPractice } from '@renderer/lib/practice-cache'
import { clearCachedPaths } from '@renderer/lib/paths-cache'
import { clearCachedProfile } from '@renderer/lib/profile-cache'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useMessage } from '../shared/message-modal-context'
import * as z from 'zod'

export const LAUNCHER_RESET_CONFIRMATION = 'RESET MY LAUNCHER'

// Single definition of the reset confirmation rule: the typed value must
// match the instruction text exactly. Schema-backed so the check and the
// displayed text share one source.
const resetConfirmationSchema = z.literal(LAUNCHER_RESET_CONFIRMATION)

function isResetConfirmation(value: string): boolean {
  return resetConfirmationSchema.safeParse(value).success
}

export default function ResetTab(): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [resetting, setResetting] = useState(false)
  const { showMessage } = useMessage()
  const navigate = useNavigate()
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (modalOpen) overlayRef.current?.focus()
  }, [modalOpen])

  const confirmed = isResetConfirmation(confirmation)

  const handleClose = useCallback(() => {
    if (resetting) return
    setModalOpen(false)
    setConfirmation('')
  }, [resetting])

  const handleOpen = useCallback(() => {
    setConfirmation('')
    setModalOpen(true)
  }, [])

  async function handleConfirm(): Promise<void> {
    if (!confirmed || resetting) return
    setResetting(true)
    try {
      await window.launcher.reset()
      // The store (including the setups list and the practice fields) was
      // just cleared: drop the snapshots and the paint caches so the next
      // screens mount from the reset store instead of stale data.
      invalidateSetupsSnapshot()
      invalidateActiveSetupSnapshot()
      invalidateModsSnapshot()
      invalidateProfileScreenSnapshot()
      clearCachedPractice()
      // Same for the Settings paint cache: without this the next Settings
      // mount would seed its inputs from the pre-reset paths.
      clearCachedPaths()
      // Same for the Profile paint cache: without this the next Profile or
      // Settings mount would seed from the pre-reset pilot data.
      clearCachedProfile()
      // The Profile Path and nationality are cleared above: tell the mounted
      // Profile screen to reload (same explicit event as profiles:save).
      window.dispatchEvent(new Event('profiles:changed'))
      setResetting(false)
      setModalOpen(false)
      setConfirmation('')
      navigate('/')
    } catch (error) {
      console.error('Failed to reset launcher:', error)
      setResetting(false)
      setModalOpen(false)
      setConfirmation('')
      showMessage({
        title: 'Reset failed',
        message: 'Launcher configuration could not be reset. Try again.',
        type: 'error'
      })
    }
  }

  return (
    <>
      <Card className="border-dashed border-border py-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-0">
          <CardTitle className="text-sm font-medium tracking-wide uppercase">Reset</CardTitle>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleOpen}
            className="shrink-0 uppercase"
          >
            reset
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Restores all launcher settings to their initial values. Game files, game configs and
            installed mods are not affected.
          </p>
        </CardContent>
      </Card>
      {modalOpen ? (
        <div
          ref={overlayRef}
          data-slot="message-modal-overlay"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <Card
            data-slot="message-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Reset launcher?"
            className="w-full max-w-md gap-4 border-border py-4"
          >
            <CardHeader className="flex flex-row items-center gap-2 pb-0">
              <Icon component={IconAlertTriangle} size={16} aria-hidden="true" />
              <CardTitle className="flex-1 text-sm font-medium tracking-wide uppercase">
                Reset launcher?
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={handleClose}
                disabled={resetting}
                className="shrink-0"
              >
                <Icon component={IconX} size={16} aria-hidden="true" />
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-muted-foreground select-text">
                This restores all launcher settings to their initial values. Game files, game
                configs and installed mods are kept. Type
                {` ${LAUNCHER_RESET_CONFIRMATION} `}to confirm.
              </p>
              <Input
                id="launcher-reset-confirmation"
                value={confirmation}
                placeholder={LAUNCHER_RESET_CONFIRMATION}
                spellCheck={false}
                autoComplete="off"
                disabled={resetting}
                onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={resetting}
                  className="shrink-0 uppercase"
                >
                  cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleConfirm()}
                  disabled={!confirmed || resetting}
                  className="shrink-0 uppercase"
                >
                  {resetting ? 'resetting' : 'ok'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}
