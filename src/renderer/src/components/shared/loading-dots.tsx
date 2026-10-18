import { cn } from '@renderer/lib/utils'

export function LoadingDots({ centered = false }: { centered?: boolean }): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Reloading"
      className={cn(
        'flex items-center gap-1 z-[51] pointer-events-none',
        centered ? '' : 'absolute top-0 left-1/2 -translate-x-1/2'
      )}
    >
      <span
        className="w-2.5 h-2.5 rounded-full bg-kd-lime animate-[bounce_0.6s_infinite_alternate]"
        style={{ animationDelay: '0s' }}
      />
      <span
        className="w-2.5 h-2.5 rounded-full bg-kd-lime animate-[bounce_0.6s_infinite_alternate]"
        style={{ animationDelay: '0.1s' }}
      />
      <span
        className="w-2.5 h-2.5 rounded-full bg-kd-lime animate-[bounce_0.6s_infinite_alternate]"
        style={{ animationDelay: '0.2s' }}
      />
    </div>
  )
}
