import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconPlus, IconTrash, IconEdit, IconX } from '@tabler/icons-react'
import { Icon } from '../ui/icon'
import { useMessage } from '@renderer/components/shared/message-modal-context'
import type { MessagePayload } from '@renderer/components/shared/message-modal-context'
import MessageModal from '@renderer/components/shared/message-modal'
import { useMods } from '@renderer/hooks/useMods'
import { usePaths } from '@renderer/hooks/usePaths'
import { useSetups } from '@renderer/hooks/useSetups'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import ControlledSelect from '@renderer/components/setups/controlled-select'
import { clearCachedSetupIdIf, writeSetupFieldCaches } from '@renderer/lib/practice-cache'
import { cn } from '@renderer/lib/utils'
import type { PlayerSetup } from '../../../../types/setups'
import { setupNameSchema } from '../../../../types/setups'
import {
  SETUP_MODS_NOT_SET_MESSAGE,
  SETUP_MODS_NOT_SET_TITLE,
  SETUP_NAME_EMPTY_MESSAGE,
  SETUP_NAME_INVALID_MESSAGE,
  SETUP_NAME_TOO_LONG_MESSAGE
} from '../../lib/setup-errors'
import type { Bike, Rider, Helmet, RidingStyle } from '../../../../types/mods'

function getModOptions<T extends { id: string }>(items: T[], defaultValue: string): string[] {
  return [defaultValue, ...items.map((item) => item.id)]
}

// Shared gate for opening the setup editor (create and edit). Order:
// empty effective Mods Path always blocks (even with a stale snapshot),
// a missing snapshot opens nothing, confirmed invalid shows the shared
// modal, a scan in progress opens nothing, and only a confirmed valid
// ready snapshot opens the editor.
function canOpenSetupEditor(
  modsPath: string,
  modsLoaded: boolean,
  modsValid: boolean,
  modsReady: boolean,
  showMessage: (payload: MessagePayload) => void
): boolean {
  if (modsPath === '') {
    showMessage({
      title: SETUP_MODS_NOT_SET_TITLE,
      message: SETUP_MODS_NOT_SET_MESSAGE,
      type: 'error'
    })
    return false
  }
  if (!modsLoaded) return false
  if (!modsValid) {
    showMessage({
      title: SETUP_MODS_NOT_SET_TITLE,
      message: SETUP_MODS_NOT_SET_MESSAGE,
      type: 'error'
    })
    return false
  }
  if (!modsReady) return false
  return true
}

export default function SetupsCard(): React.JSX.Element {
  const { showMessage } = useMessage()
  const { setups, loading, create, update, delete: deleteSetup } = useSetups()
  const { values: pathValues } = usePaths()
  const {
    items: bikes,
    isLoading: bikesLoading,
    valid: modsValid,
    ready: modsReady,
    loaded: modsLoaded
  } = useMods<Bike>('bikes')
  const { items: riders, isLoading: ridersLoading } = useMods<Rider>('riders')
  const { items: helmets, isLoading: helmetsLoading } = useMods<Helmet>('helmets')
  const { items: styles, isLoading: stylesLoading } = useMods<RidingStyle>('ridingStyles')

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorData, setEditorData] = useState<Partial<PlayerSetup>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Paint options for the selected bike/helmet/rider, derived during render.
  // Pure derivation (no setState in effects): safe against the fresh array
  // identity useMods returns every render.
  const selectedBikePaints = useMemo(
    () => bikes.find((b) => b.id === editorData.bike_id)?.paints ?? [],
    [bikes, editorData.bike_id]
  )

  const selectedHelmetPaints = useMemo(
    () => helmets.find((h) => h.id === editorData.helmet)?.paints ?? [],
    [helmets, editorData.helmet]
  )

  const selectedRiderPaints = useMemo(
    () => riders.find((r) => r.id === editorData.rider)?.paints ?? [],
    [riders, editorData.rider]
  )

  // Handle creating a new setup (pre-fill with current practice state)
  const handleCreate = useCallback(async () => {
    if (!canOpenSetupEditor(pathValues.mods, modsLoaded, modsValid, modsReady, showMessage)) return
    let current: Record<string, unknown> | null = null
    try {
      current = await window.store.get<Record<string, unknown>>('practice.bike')
    } catch {
      current = null
    }
    const get = (key: string): string =>
      typeof current?.[key] === 'string' ? (current[key] as string) : ''
    setEditorData({
      name: '',
      bike_id: get('bike_id'),
      bike_paint: get('paint'),
      rider: get('rider'),
      helmet: get('helmet'),
      helmet_paint: get('helmet_paint'),
      suit_paint: get('suit_paint'),
      riding_style: get('riding_style')
    })
    setEditingId(null)
    setNameError(null)
    setEditorOpen(true)
  }, [modsReady, modsValid, modsLoaded, pathValues.mods, showMessage])

  // Handle editing an existing setup
  const handleEdit = useCallback(
    (setup: PlayerSetup) => {
      if (!canOpenSetupEditor(pathValues.mods, modsLoaded, modsValid, modsReady, showMessage)) return
      setEditorData({
        name: setup.name,
        bike_id: setup.bike_id,
        bike_paint: setup.bike_paint,
        rider: setup.rider,
        helmet: setup.helmet,
        helmet_paint: setup.helmet_paint,
        suit_paint: setup.suit_paint,
        riding_style: setup.riding_style
      })
      setEditingId(setup.id)
      setNameError(null)
      setEditorOpen(true)
    },
    [modsReady, modsValid, modsLoaded, pathValues.mods, showMessage]
  )

  // Handle saving (create or update)
  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const name = editorData.name?.trim() ?? ''
      const parsedName = setupNameSchema.safeParse(name)
      if (!parsedName.success) {
        if (parsedName.error.issues[0]?.code === 'too_small') {
          setNameError(SETUP_NAME_EMPTY_MESSAGE)
        } else if (parsedName.error.issues[0]?.code === 'too_big') {
          setNameError(SETUP_NAME_TOO_LONG_MESSAGE)
        } else {
          setNameError(SETUP_NAME_INVALID_MESSAGE)
        }
        return
      }
      setNameError(null)

      const data = {
        name,
        bike_id: editorData.bike_id ?? 'schwaben_m2_18',
        bike_paint: editorData.bike_paint ?? '',
        rider: editorData.rider ?? 'modern',
        helmet: editorData.helmet ?? 'default',
        helmet_paint: editorData.helmet_paint ?? '',
        suit_paint: editorData.suit_paint ?? '',
        riding_style: editorData.riding_style ?? 'modern'
      }

      let result
      if (editingId) {
        result = await update(editingId, data)
      } else {
        result = await create(data)
      }

      if (result.ok) {
        if ('applied' in result && result.applied) {
          writeSetupFieldCaches(result.applied)
        }
        setEditorOpen(false)
        setEditingId(null)
        setEditorData({})
        setNameError(null)
      } else if (result.reason === 'name-taken') {
        showMessage({
          title: 'Name taken',
          message: 'A setup with this name already exists.',
          type: 'error'
        })
      } else if (result.reason === 'invalid-name') {
        showMessage({ title: 'Invalid name', message: 'Enter a valid setup name.', type: 'error' })
      } else {
        showMessage({
          title: 'Save failed',
          message: 'Could not save the setup. Try again.',
          type: 'error'
        })
      }
    } finally {
      setSaving(false)
    }
  }, [editingId, editorData, create, update, saving, showMessage])

  // Handle delete with confirmation
  const handleDeleteClick = useCallback((id: string) => {
    setDeleteConfirmId(id)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmId) return
    const result = await deleteSetup(deleteConfirmId)
    if (!result.ok) {
      showMessage({
        title: 'Delete failed',
        message: 'Could not delete the setup. Try again.',
        type: 'error'
      })
    } else {
      clearCachedSetupIdIf(deleteConfirmId)
    }
    setDeleteConfirmId(null)
  }, [deleteConfirmId, deleteSetup, showMessage])

  const setupToDelete = deleteConfirmId
    ? (setups.find((s) => s.id === deleteConfirmId) ?? null)
    : null

  const bikeOptions = getModOptions(bikes, 'schwaben_m2_18')
  const riderOptions = getModOptions(riders, 'modern')
  const helmetOptions = getModOptions(helmets, 'default')
  const styleOptions = getModOptions(styles, 'modern')

  // Editor controls wait for mods; a seeded setups list never blanks because
  // a mods scan is still pending: the list is already confirmed.
  const busy = loading || bikesLoading || ridersLoading || helmetsLoading || stylesLoading

  return (
    <>
      <Card className="border-dashed border-border py-4">
        <CardHeader className="flex shrink-0 flex-row items-center gap-2 pb-0">
          <CardTitle className="flex-1 text-sm font-medium tracking-wide uppercase">
            Setups
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreate}
            className="shrink-0 uppercase"
            disabled={busy}
          >
            <Icon component={IconPlus} size={16} aria-hidden="true" />
            <span className="leading-none">create setup</span>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {/* Static guidance, always visible: true with or without setups. */}
          <p className="shrink-0 text-xs leading-relaxed text-muted-foreground">
            Create setups here and apply them from Practice.
          </p>

          <div
            className={
              setups.length > 4
                ? 'scroll flex flex-col gap-[var(--setup-gap)] max-h-[calc(4*var(--setup-row-h)+3*var(--setup-gap))] overflow-y-auto'
                : 'flex flex-col gap-[var(--setup-gap)] max-h-[calc(4*var(--setup-row-h)+3*var(--setup-gap))]'
            }
          >
            {setups.map((setup) => (
              <Card key={setup.id} className="h-[var(--setup-row-h)] shrink-0 border-dashed border-border py-2 overflow-hidden">
                <CardContent className="flex flex-row items-center justify-between gap-2 px-2">
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-sm font-medium tracking-wide uppercase truncate">
                      {setup.name}
                    </p>
                    <p className="truncate text-[10px] leading-relaxed text-muted-foreground select-text uppercase">
                      Bike: {setup.bike_id} | Rider: {setup.rider} | Helmet: {setup.helmet} | Riding Style:{' '}
                      {setup.riding_style}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEdit(setup)}
                      disabled={loading}
                      aria-label={`Edit ${setup.name}`}
                      className="shrink-0"
                    >
                      <Icon component={IconEdit} size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteClick(setup.id)}
                      disabled={loading}
                      aria-label={`Delete ${setup.name}`}
                      className="shrink-0 text-destructive hover:bg-destructive/10"
                    >
                      <Icon component={IconTrash} size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor Modal */}
      {editorOpen &&
        createPortal(
          <div
            data-slot="message-modal-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          >
            <Card
              data-slot="message-modal"
              role="dialog"
              aria-modal="true"
              aria-label={editingId ? 'Edit setup' : 'Create setup'}
              className="w-full max-w-lg gap-4 border-border py-4"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="flex flex-row items-center gap-2 pb-0">
                <CardTitle className="flex-1 text-sm font-medium tracking-wide uppercase">
                  {editingId ? 'Edit setup' : 'Create setup'}
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  disabled={saving}
                  onClick={() => {
                    setEditorOpen(false)
                    setEditingId(null)
                    setEditorData({})
                    setNameError(null)
                  }}
                  className="shrink-0"
                >
                  <Icon component={IconX} size={16} aria-hidden="true" />
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex w-full flex-col gap-1.5">
                    <Label htmlFor="setup-name">Name</Label>
                    <Input
                      id="setup-name"
                      value={editorData.name ?? ''}
                      spellCheck={false}
                      autoComplete="off"
                      maxLength={32}
                      aria-invalid={nameError ? true : undefined}
                      onChange={(e) => {
                        setEditorData((prev) => ({ ...prev, name: e.target.value }))
                        if (nameError) setNameError(null)
                      }}
                      placeholder="Setup name"
                      autoFocus
                      className={cn(nameError && 'border-destructive')}
                    />
                    {/* Name error on save attempt: no reserved height, appears inline. */}
                    <div aria-live="polite" className="empty:hidden">
                      {nameError ? (
                        <p className="text-xs leading-relaxed text-destructive select-text">
                          {nameError}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ControlledSelect
                    label="Bike"
                    inputId="setup-bike"
                    options={bikeOptions}
                    value={editorData.bike_id ?? 'schwaben_m2_18'}
                    defaultValue="schwaben_m2_18"
                    onChange={(v) =>
                      setEditorData((prev) => ({ ...prev, bike_id: v, bike_paint: '' }))
                    }
                    disabled={bikesLoading}
                  />
                  <ControlledSelect
                    label="Bike Paint"
                    inputId="setup-bike-paint"
                    options={['', ...selectedBikePaints]}
                    value={editorData.bike_paint ?? ''}
                    defaultValue=""
                    onChange={(v) => setEditorData((prev) => ({ ...prev, bike_paint: v }))}
                    disabled={bikesLoading || selectedBikePaints.length === 0}
                  />
                  <ControlledSelect
                    label="Rider"
                    inputId="setup-rider"
                    options={riderOptions}
                    value={editorData.rider ?? 'modern'}
                    defaultValue="modern"
                    onChange={(v) =>
                      setEditorData((prev) => ({ ...prev, rider: v, suit_paint: '' }))
                    }
                    disabled={ridersLoading}
                  />
                  <ControlledSelect
                    label="Suit Paint"
                    inputId="setup-suit-paint"
                    options={['', ...selectedRiderPaints]}
                    value={editorData.suit_paint ?? ''}
                    defaultValue=""
                    onChange={(v) => setEditorData((prev) => ({ ...prev, suit_paint: v }))}
                    disabled={ridersLoading || selectedRiderPaints.length === 0}
                  />
                  <ControlledSelect
                    label="Helmet"
                    inputId="setup-helmet"
                    options={helmetOptions}
                    value={editorData.helmet ?? 'default'}
                    defaultValue="default"
                    onChange={(v) =>
                      setEditorData((prev) => ({ ...prev, helmet: v, helmet_paint: '' }))
                    }
                    disabled={helmetsLoading}
                  />
                  <ControlledSelect
                    label="Helmet Paint"
                    inputId="setup-helmet-paint"
                    options={['', ...selectedHelmetPaints]}
                    value={editorData.helmet_paint ?? ''}
                    defaultValue=""
                    onChange={(v) => setEditorData((prev) => ({ ...prev, helmet_paint: v }))}
                    disabled={helmetsLoading || selectedHelmetPaints.length === 0}
                  />
                  <ControlledSelect
                    label="Riding Style"
                    inputId="setup-riding-style"
                    options={styleOptions}
                    value={editorData.riding_style ?? 'modern'}
                    defaultValue="modern"
                    onChange={(v) => setEditorData((prev) => ({ ...prev, riding_style: v }))}
                    disabled={stylesLoading}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      setEditorOpen(false)
                      setEditingId(null)
                      setEditorData({})
                      setNameError(null)
                    }}
                    className="shrink-0 uppercase"
                  >
                    cancel
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving} className="shrink-0 uppercase">
                    {editingId ? 'save' : 'create'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>,
          document.body
        )}

      {/* Delete confirmation modal */}
      <MessageModal
        open={deleteConfirmId !== null}
        title="Delete setup?"
        message={setupToDelete ? `Delete ${setupToDelete.name}? This cannot be undone.` : ''}
        type="error"
        confirmLabel="delete"
        confirmVariant="destructive"
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}
