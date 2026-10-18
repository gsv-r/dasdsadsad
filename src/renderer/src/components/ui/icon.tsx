import { cn } from '@renderer/lib/utils'

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>

export function Icon({
  component: Icon,
  size = 16,
  className,
  ...props
}: {
  component: IconComponent
  size?: number
  className?: string
} & React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <Icon
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={String(size)}
      height={String(size)}
      className={cn('currentColor', className)}
      {...props}
    />
  )
}
