export const DISCORD_INVITE_URL = 'https://discord.gg/SGGnWN7a6Y'

export const SUPPORT_URL = 'https://ko-fi.com/gsvr'

const ROUTE_TITLES: Record<string, string> = {
  '/': 'practice',
  '/bikes': 'bikes',
  '/tracks': 'tracks',
  '/profile': 'profile',
  '/settings': 'settings'
}

export function getRouteTitle(pathname: string): string {
  return ROUTE_TITLES[pathname] ?? 'practice'
}
