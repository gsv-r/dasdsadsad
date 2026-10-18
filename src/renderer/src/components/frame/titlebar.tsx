import { IconArrowLeft, IconRefresh } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { useAppUpdate } from '@renderer/hooks/useAppUpdate'
import { useWindowState } from '@renderer/hooks/useWindowState'
import { Icon } from '@renderer/components/ui/icon'
import { cn } from '@renderer/lib/utils'
import { setReloadFlag } from '@renderer/lib/reload-flag'

const updateButtonClassName =
  'mr-4 flex cursor-pointer items-center rounded-none border border-primary bg-transparent px-3 py-1 text-xs font-medium tracking-wider text-primary uppercase transition-colors outline-none hover:bg-kd-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50'

const updateTextClassName =
  'mr-4 text-xs font-medium tracking-wider text-muted-foreground uppercase'

// Window-control buttons share one look: transparent, text in --kd-nav-text,
// subtle hover in --kd-surface, focus ring in --kd-lime. No hardcoded color.
// Fixed h-10 w-10 so they sit flush at the window edges.
const windowButtonClassName =
  'flex cursor-pointer items-center justify-center rounded-none bg-transparent w-10 h-10 text-xs font-medium tracking-wider text-nav-text uppercase transition-colors outline-none hover:bg-kd-surface-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 no-drag'

const windowCloseButtonClassName = cn(
  windowButtonClassName,
  'hover:bg-window-close hover:text-white dark:hover:bg-window-close dark:hover:text-white'
)

// Inline window-control glyphs: thin 10x10, stroke 1, crisp edges,
// currentColor, decorative. Minimize = line; Maximize = square;
// Restore = two overlapping squares; Close = X.
const GlyphMinimize = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    shapeRendering="crispEdges"
    aria-hidden="true"
  >
    <line x1="2" y1="5" x2="8" y2="5" />
  </svg>
)

const GlyphMaximize = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    shapeRendering="crispEdges"
    aria-hidden="true"
  >
    <rect x="2" y="2" width="6" height="6" />
  </svg>
)

const GlyphRestore = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    shapeRendering="crispEdges"
    aria-hidden="true"
  >
    <rect x="1" y="1" width="6" height="6" />
    <rect x="3" y="3" width="6" height="6" />
  </svg>
)

const GlyphClose = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    shapeRendering="crispEdges"
    aria-hidden="true"
  >
    <line x1="2" y1="2" x2="8" y2="8" />
    <line x1="8" y1="2" x2="2" y2="8" />
  </svg>
)

// The update UI stays silent unless there is something to do:
// the button appears only when a newer version is available, progress
// appears only while the one-click flow is running.
export default function TitleBar(): React.JSX.Element {
  const { status, version, percent, installedVersion, updateNow } = useAppUpdate()
  const { isMaximized } = useWindowState()
  const navigate = useNavigate()

  const showButton = status === 'available'
  const showProgress = status === 'downloading'
  const showInstalling = status === 'downloaded' || status === 'installing'

  function handleReload(): void {
    setReloadFlag()
    // Reset the route to the home (DevBlog) before reloading, so the app
    // reopens there instead of restoring the previous route from the hash.
    navigate('/')
    window.electron.ipcRenderer.send('window:reload')
  }

  function handleToggleMaximize(): void {
    window.electron.ipcRenderer.send('window:maximize')
  }

  return (
    // 100% width, no lateral padding/margin/max-width: the bar touches the
    // window edges. Drag region stays on the header; buttons are no-drag.
    <header
      data-slot="frame-titlebar"
      className="drag-region h-10 shrink-0 items-center border-b border-border bg-titlebar-bg grid grid-cols-[1fr_auto_1fr] z-[51]"
    >
      {/* Left: navigation (independent of the other groups' width) */}
      <div className="no-drag flex items-center gap-2 justify-self-start">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Back to Practice"
          className={cn(windowButtonClassName, 'h-10 w-10')}
        >
          <Icon component={IconArrowLeft} size={14} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleReload}
          aria-label="Reload"
          className={cn(windowButtonClassName, 'h-10 w-10')}
        >
          <Icon component={IconRefresh} size={14} aria-hidden="true" />
        </Button>
      </div>

      {/* Centro: logo (permanece centralizado independentemente dos lados) */}
      <div className="justify-self-center whitespace-nowrap">
        <p className="text-sm leading-none font-extrabold font-brand tracking-tighter text-foreground uppercase whitespace-nowrap">
          knee down
        </p>
      </div>

      {/* Right: update and window controls */}
      <div className="no-drag flex h-full items-center gap-1 justify-self-end">
        {showButton ? (
          <button
            type="button"
            title={
              version
                ? `Version ${version} available${installedVersion ? ` (installed ${installedVersion})` : ''}`
                : 'Download and install the new version'
            }
            onClick={updateNow}
            className={cn(updateButtonClassName, 'no-drag')}
          >
            New Version
          </button>
        ) : null}

        {showProgress ? (
          <span
            className={cn(updateTextClassName, 'no-drag')}
            title={version ? `Downloading version ${version}` : 'Downloading update'}
          >
            Downloading… {percent ?? 0}%
          </span>
        ) : null}

        {showInstalling ? (
          <span className={cn(updateTextClassName, 'no-drag')}>Installing…</span>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electron.ipcRenderer.send('minimize')}
          aria-label="Minimize"
          className={cn(windowButtonClassName, 'h-10 w-10')}
        >
          {GlyphMinimize}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          className={cn(windowButtonClassName, 'h-10 w-10')}
        >
          {isMaximized ? GlyphRestore : GlyphMaximize}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.electron.ipcRenderer.send('close')}
          aria-label="Close"
          className={windowCloseButtonClassName}
        >
          {GlyphClose}
        </Button>
      </div>
    </header>
  )
}
