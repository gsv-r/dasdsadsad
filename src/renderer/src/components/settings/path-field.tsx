import { useEffect, useRef, useState } from 'react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '@renderer/lib/utils'
import { commitSettleOutcome, pathBlurOutcome, shouldResyncDraft } from '@renderer/lib/path-utils'

export default function PathField({
  label,
  inputId,
  value,
  placeholder,
  isManual,
  invalid,
  error,
  disabled,
  onDraftChange,
  onCommit,
  onReset
}: {
  label: string
  inputId: string
  value: string
  placeholder: string
  isManual: boolean
  invalid?: boolean
  error?: string | null
  disabled?: boolean
  onDraftChange?: () => void
  onCommit: (value: string) => Promise<boolean> | boolean
  onReset: () => void
}): React.JSX.Element {
  // Typed text stays a local draft: nothing persists per keystroke.
  // The draft commits on Enter or blur; an unchanged draft is a no-op.
  const [draft, setDraft] = useState(value)
  // Synchronous mirror of the draft: blur handlers read this instead of the
  // state closure, so a discard (Escape, Reset/Redetect) can never commit
  // the text it just threw away.
  const draftRef = useRef(value)
  // Set by Escape and consumed by the blur it triggers; also cleared on
  // focus, so a stale flag can never skip a later legitimate commit.
  const cancelRef = useRef(false)
  // Commit in flight (blur text). While set, the resync below stays off so
  // the blur render before the async rejection arrives cannot revert the
  // draft to the old value. Cleared on settle; explicit discards clear it.
  const pendingRef = useRef<string | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Latest error-clear callback, for the unmount cleanup below.
  const onDraftChangeRef = useRef(onDraftChange)

  function setDraftSync(next: string): void {
    draftRef.current = next
    setDraft(next)
  }

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange
  })

  // The draft dies with the field: drop its commit error too, so a remount
  // starts from the committed value with no orphaned error.
  useEffect(
    () => () => {
      onDraftChangeRef.current?.()
    },
    []
  )

  // Explicit updates (valid commit, Reset, Auto Detect, async store load)
  // replace the draft before paint, but never while the user is typing nor
  // while a rejection is displayed: the rejected text stays until the user
  // edits it or an explicit action clears the error first. Render-phase
  // adoption (same pattern as the practice selects) avoids the one-frame lag
  // of an effect resync, so the async value fill never flashes stale text.
  const [lastValue, setLastValue] = useState(value)
  if (lastValue !== value) {
    setLastValue(value)
    const hasCommitError = error !== null && error !== undefined
    if (pendingRef.current === null && shouldResyncDraft(focused, hasCommitError)) {
      draftRef.current = value
      setDraft(value)
    }
  }

  function commit(): void {
    const snapshot = draftRef.current
    if (snapshot === value) return
    const result = onCommit(snapshot)
    // A rejection keeps the typed text with its inline error: the draft is
    // never rewritten here. Acceptance flows back in through the value prop.
    // A settlement for text the user already edited past is stale and ignored.
    if (typeof result !== 'boolean') {
      pendingRef.current = snapshot
      void result.then(
        (ok) => {
          if (pendingRef.current === snapshot) pendingRef.current = null
          if (commitSettleOutcome(ok, snapshot, draftRef.current) === 'stale') return
        },
        () => {
          if (pendingRef.current === snapshot) pendingRef.current = null
        }
      )
    }
  }

  const showError = invalid || error

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <Badge
          variant="outline"
          className={
            isManual
              ? showError
                ? 'border-primary px-2 py-0 text-[10px] font-medium tracking-widest text-primary uppercase'
                : 'border-kd-lime px-2 py-0 text-[10px] font-medium tracking-widest text-kd-lime uppercase'
              : 'border-transparent px-0 text-[10px] font-medium tracking-widest text-muted-foreground uppercase'
          }
        >
          {isManual ? 'manual' : 'auto'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          ref={inputRef}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={showError ? true : undefined}
          onChange={(e) => {
            setDraftSync(e.target.value)
            onDraftChange?.()
          }}
          onFocus={() => {
            cancelRef.current = false
            setFocused(true)
          }}
          onBlur={(e) => {
            setFocused(false)
            // Reset/Redetect owns the interaction when focus moves to one of
            // its buttons (the blur from the click fires before onClick).
            const target = e.relatedTarget
            const actionFocused =
              target instanceof HTMLElement && target.closest('[data-skip-path-commit]') !== null
            // An Escape-cancelled draft is already discarded above: never
            // commit it back. The flag is consumed here and cleared on focus.
            if (pathBlurOutcome(cancelRef.current, actionFocused) === 'discard') {
              cancelRef.current = false
              pendingRef.current = null
              setDraftSync(value)
              // The discarded text takes its error with it.
              onDraftChange?.()
              return
            }
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') inputRef.current?.blur()
            if (e.key === 'Escape') {
              cancelRef.current = true
              pendingRef.current = null
              setDraftSync(value)
              // The discarded text takes its error with it.
              onDraftChange?.()
              inputRef.current?.blur()
            }
          }}
          className={cn('flex-1', showError && 'border-destructive')}
        />
        {isManual && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-skip-path-commit
            onClick={onReset}
            className="shrink-0 uppercase"
          >
            reset
          </Button>
        )}
      </div>
      {/* Error/hint slot: always mounted with aria-live so screen readers
          announce it; collapses to 0px when empty so it never adds gap
          between the path inputs. Error and hint enter the flow only when
          they exist. */}
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p className="text-xs leading-relaxed text-destructive select-text">{error}</p>
        ) : null}
        {!error && invalid ? (
          <p className="text-xs leading-relaxed text-destructive select-text">
            The saved path is invalid. Fix it above, or use reset / auto detect.
          </p>
        ) : null}
      </div>
    </div>
  )
}
