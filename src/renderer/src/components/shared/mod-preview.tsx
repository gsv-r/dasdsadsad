import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { cn, toLocalFileUrl } from '../../lib/utils'

type ModPreviewProps = {
  src?: string | null
  name: string
  badge?: string
  cover?: boolean
  to?: string
  onSelect?: () => void | Promise<unknown>
  className?: string
  disabled?: boolean
}

export default function ModPreview({
  src,
  name,
  badge,
  cover = false,
  to,
  onSelect,
  className,
  disabled = false
}: ModPreviewProps): React.JSX.Element {
  const previewUrl = src ? toLocalFileUrl(src) : undefined
  const navigate = useNavigate()

  // Wait for the async store save before navigating so Practice reads the new value.
  async function handleClick(e: React.MouseEvent): Promise<void> {
    if (!onSelect) return
    e.preventDefault()
    try {
      await onSelect()
    } catch (error) {
      console.error('Failed to select mod:', error)
    }
    if (to !== undefined) navigate(to)
  }

  const content = (
    <>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={name}
          className={cn('bg-card h-full w-full', cover ? 'object-cover' : 'object-contain')}
        />
      ) : (
        <div className="bg-card flex h-full w-full items-center justify-center">
          <p className="text-muted-foreground text-sm">no preview</p>
        </div>
      )}
      <Badge
        variant="secondary"
        className="absolute right-2 bottom-2 left-2 justify-start truncate tracking-wide uppercase"
      >
        {name}
      </Badge>
      {badge !== undefined && badge !== '' && (
        <Badge
          variant="secondary"
          className="absolute top-2 left-2 justify-start tracking-wide uppercase"
        >
          {badge}
        </Badge>
      )}
    </>
  )

  const frameClass = 'relative block aspect-[4/3] max-h-full w-full overflow-hidden transition-opacity hover:opacity-90'

  return (
    <Card className={cn('gap-0 overflow-hidden border-border bg-card py-0', className)}>
      {disabled ? (
        <div className={cn(frameClass, 'cursor-not-allowed opacity-50')} aria-disabled="true">
          {content}
        </div>
      ) : to !== undefined || onSelect !== undefined ? (
        <Link to={to ?? '/'} onClick={(e): void => void handleClick(e)} className={frameClass}>
          {content}
        </Link>
      ) : (
        <div className={frameClass}>{content}</div>
      )}
    </Card>
  )
}
