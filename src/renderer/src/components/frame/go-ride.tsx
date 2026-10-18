import { useEffect, useRef, useState } from 'react'
import { IconCirclePlay, IconLoader2 } from '@tabler/icons-react'
import { Icon } from '@renderer/components/ui/icon'
import { useMessage, type MessagePayload } from '@renderer/components/shared/message-modal-context'
import { useAppValidation } from '@renderer/hooks/useAppValidation'
import { isSetupActive } from '@renderer/lib/setup-active'
import { cn } from '@renderer/lib/utils'

type GoRideStatus = 'idle' | 'launch' | 'running' | 'stopping'

const POLL_INTERVAL_MS = 1000
const TRANSITION_DELAY_MS = 1900
// If the game never shows up (crash before the first poll, Steam closed, etc.),
// fall back to idle instead of hanging on Launching forever.
const LAUNCH_TIMEOUT_MS = 60_000
// Require N consecutive not-running polls before leaving running.
// Guard against a transient tasklist failure causing a false Stopping.
const EXIT_CONFIRM_COUNT = 2
// Absolute failsafe: never stay stuck in stopping longer than this.
const STOPPING_MAX_MS = 10_000

const STATUS_LABELS: Record<GoRideStatus, string> = {
  idle: 'go ride',
  launch: 'launching',
  running: 'running',
  stopping: 'stopping'
}

// Same geometry/typography as the other sidebar items (sidebar.tsx ITEM_CLASSES),
// but with the original primary blue and rounded corners to stand out.
// NOTE: the app theme forces --radius-* to 0rem, so rounded-md/lg resolve to 0.
// An arbitrary value bypasses the theme and actually renders rounded.
const ITEM_CLASSES =
  'flex w-full cursor-pointer flex-row items-center gap-2.5 rounded-none bg-primary px-4 py-3.5 text-sm font-medium tracking-wider text-primary-foreground uppercase transition-colors outline-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Raw exec output can be verbose: keep the modal readable.
const LAUNCH_DETAIL_MAX_LENGTH = 500

function truncateDetail(detail: string): string {
  const trimmed = detail.trim()
  return trimmed.length > LAUNCH_DETAIL_MAX_LENGTH
    ? `${trimmed.slice(0, LAUNCH_DETAIL_MAX_LENGTH)}…`
    : trimmed
}

// Maps a main-process launch failure to the corresponding modal. The main
// process revalidates before launching (defense in depth) and throws the
// exact validation message on any pending requirement, so surface it with
// the matching title and Resolve target instead of a generic failure.
// Only invoked from the click handler below: never on navigation.
function toLaunchErrorPayload(detail: string, setupActive: boolean): MessagePayload {
  const message = truncateDetail(detail) || 'Could not launch the game.'

  const setupRoute = setupActive ? '/profile' : '/'

  const errorMap: Array<{
    match: RegExp
    title: string | ((msg: string) => string)
    message?: string
    to?: string
  }> = [
    {
      match: /Check Steam Path in Settings|Steam not found/,
      title: 'Steam not found',
      message: 'Steam executable was not found. Check Steam Path in Settings.',
      to: '/settings'
    },
    {
      match: /Check Game Path in Settings|Game folder not found/,
      title: (msg) =>
        msg.includes('was not found inside')
          ? 'Game executable not found'
          : 'Game folder not found',
      message: 'Game folder was not found. Check Game Path in Settings.',
      to: '/settings'
    },
    {
      match: /Check Mods Path in Settings/,
      title: (msg) => (msg.includes('invalid') ? 'Invalid Mods folder' : 'Mods folder not found'),
      to: '/settings'
    },
    {
      match:
        /Check Profile Path in Settings|Profile folder not found|Invalid Profile folder|profile\.ini/,
      title: (msg) =>
        msg.includes('invalid')
          ? 'Invalid Profile folder'
          : msg.includes('profile.ini')
            ? 'Profile configuration missing'
            : 'Profile folder not found',
      to: '/settings'
    },
    {
      match: /Profile folder not found|No profile is available/,
      title: 'Profile not found',
      to: '/settings'
    },
    { match: /Profile name is empty/, title: 'Profile name not configured', to: '/profile' },
    {
      match: /Profile race number is empty/,
      title: 'Profile race number not configured',
      to: '/profile'
    },
    {
      match: /Profile nationality is not selected/,
      title: 'Profile nationality not configured',
      to: '/profile'
    },
    {
      match: /Bike (paint|".*was not found)/,
      title: (msg) => (msg.includes('paint') ? 'Bike paint not found' : 'Bike mod not found'),
      to: setupActive ? '/profile' : '/bikes'
    },
    {
      match: /Track (layout|".*was not found)/,
      title: (msg) => (msg.includes('layout') ? 'Track layout not found' : 'Track mod not found'),
      to: '/tracks'
    },
    {
      match: /Rider suit|Suit paint/,
      title: (msg) =>
        msg.includes('Suit paint') ? 'Suit paint not found' : 'Rider suit mod not found',
      to: setupRoute
    },
    {
      match: /Helmet (paint|".*was not found)/,
      title: (msg) => (msg.includes('paint') ? 'Helmet paint not found' : 'Helmet mod not found'),
      to: setupRoute
    },
    { match: /Riding style/, title: 'Riding style mod not found', to: setupRoute },
    {
      match: /Select a bike/,
      title: 'Bike not configured',
      to: setupActive ? '/profile' : '/bikes'
    },
    { match: /Select a track/, title: 'Track not configured', to: '/tracks' },
    {
      match: /Practice weather settings|Practice settings invalid/,
      title: 'Practice settings invalid',
      to: '/'
    },
    {
      match: /Practice configuration could not be read/,
      title: 'Configuration unreadable',
      to: '/settings'
    },
    { match: /Check folder permissions|EACCES|EPERM/, title: 'Game folder not writable' }
  ]

  for (const { match, title, message: fallback, to } of errorMap) {
    if (match.test(message)) {
      return {
        title: typeof title === 'function' ? title(message) : title,
        message: fallback && !message.includes('Check') ? fallback : message,
        type: 'error',
        ...(to ? { action: { label: 'Resolve', to } } : {})
      }
    }
  }

  return { title: 'Launch failed', message, type: 'error' }
}

export default function GoRide(): React.JSX.Element {
  const [status, setStatus] = useState<GoRideStatus>('idle')
  const statusRef = useRef<GoRideStatus>(status)
  const { showMessage } = useMessage()
  const { ensureValid } = useAppValidation()

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Recover on mount: if the renderer reloads with the game already open,
  // go straight to running instead of allowing a second launch.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const running = await window.api.isRunning()
        if (!cancelled && running) {
          setStatus((prev) => (prev === 'idle' ? 'running' : prev))
        }
      } catch (error) {
        console.error('Failed to check initial game status:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status === 'idle') return
    let cancelled = false
    let notRunningCount = 0
    let transitionTimeout: ReturnType<typeof setTimeout> | undefined
    let failsafeTimeout: ReturnType<typeof setTimeout> | undefined
    const startedAt = Date.now()

    const clearTimers = (): void => {
      if (transitionTimeout !== undefined) clearTimeout(transitionTimeout)
      if (failsafeTimeout !== undefined) clearTimeout(failsafeTimeout)
      transitionTimeout = undefined
      failsafeTimeout = undefined
    }

    if (status === 'stopping') {
      // "stopping" is a fixed-length transient state. After the grace
      // period, confirm the process really exited and go back to idle.
      // Without this, the old state got stuck because no poll handled
      // status === 'stopping' and the scheduled setStatus('idle') from the
      // 'running' effect was cancelled by the state-change cleanup.
      transitionTimeout = setTimeout(() => {
        void (async () => {
          if (cancelled) return
          try {
            const running = await window.api.isRunning()
            if (cancelled) return
            setStatus(running ? 'running' : 'idle')
          } catch (error) {
            console.error('Failed to confirm game exit:', error)
            if (!cancelled) setStatus('idle')
          }
        })()
      }, TRANSITION_DELAY_MS)

      // Absolute failsafe: never get stuck in stopping, even if IPC fails.
      failsafeTimeout = setTimeout(() => {
        if (!cancelled && statusRef.current === 'stopping') {
          console.warn('Stopping failsafe: forcing idle')
          setStatus('idle')
        }
      }, STOPPING_MAX_MS)
    }

    const interval = setInterval(() => {
      void (async () => {
        let running: boolean
        try {
          running = await window.api.isRunning()
        } catch (error) {
          console.error('Failed to poll game status:', error)
          return
        }
        if (cancelled) return
        const current = statusRef.current
        if (current === 'launch') {
          if (running) {
            clearInterval(interval)
            if (transitionTimeout !== undefined) clearTimeout(transitionTimeout)
            // Short visual delay before showing Running.
            // If the game closes in that window, the 'running' effect
            // catches the exit and moves through stopping to idle as usual.
            transitionTimeout = setTimeout(() => {
              if (!cancelled) setStatus('running')
            }, TRANSITION_DELAY_MS)
          } else if (Date.now() - startedAt > LAUNCH_TIMEOUT_MS) {
            clearInterval(interval)
            setStatus('idle')
          }
        } else if (current === 'running') {
          if (running) {
            notRunningCount = 0
          } else {
            notRunningCount += 1
            if (notRunningCount >= EXIT_CONFIRM_COUNT) {
              clearInterval(interval)
              setStatus('stopping')
            }
          }
        } else if (current === 'stopping') {
          if (running) {
            // Game reappeared during stopping (fast restart).
            clearTimers()
            clearInterval(interval)
            setStatus('running')
          }
          // Otherwise wait for the grace timer above, which leads to idle.
        }
      })()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimers()
    }
  }, [status])

  async function handleGoRide(): Promise<void> {
    if (status !== 'idle') return
    // Exclusive display point for launch validation: checks every launch
    // requirement, shows the error modal with what must be fixed and blocks
    // the launch on any pending issue. No validation modal is shown when
    // navigating between pages or opening any section.
    if (!(await ensureValid())) return
    try {
      // If the process is already running (e.g. Alt+F4 did not kill it, reload with
      // game open), just reflect the state instead of launching again.
      if (await window.api.isRunning()) {
        setStatus('running')
        return
      }
      setStatus('launch')
      await delay(TRANSITION_DELAY_MS)
      await window.api.launch()
    } catch (error) {
      console.error(error)
      setStatus('idle')
      const detail = error instanceof Error ? error.message : String(error)
      const setupActive = await isSetupActive()
      showMessage(toLaunchErrorPayload(detail, setupActive))
    }
  }

  return (
    <button
      type="button"
      aria-label={STATUS_LABELS[status]}
      data-slot="sidebar-menu-button"
      onClick={() => void handleGoRide()}
      disabled={status !== 'idle'}
      className={cn(ITEM_CLASSES)}
    >
      {status !== 'idle' ? (
        <Icon component={IconLoader2} size={24} aria-hidden="true" className="animate-spin" />
      ) : (
        <Icon component={IconCirclePlay} size={24} aria-hidden="true" />
      )}
      <span className="leading-none">{STATUS_LABELS[status]}</span>
    </button>
  )
}
