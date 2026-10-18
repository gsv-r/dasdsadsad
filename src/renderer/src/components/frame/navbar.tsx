import { useLocation } from 'react-router-dom'
import { getRouteTitle } from './constants'

export default function NavBar(): React.JSX.Element {
  const { pathname } = useLocation()

  return (
    <header
      data-slot="frame-navbar"
      className="flex h-14 shrink-0 items-center justify-between px-4"
    >
      <h1 className="text-2xl leading-none font-semibold font-ui tracking-tight text-foreground uppercase">
        {getRouteTitle(pathname)}
      </h1>
    </header>
  )
}
