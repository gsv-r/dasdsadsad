import path from 'path'
import { PREVIEW_IMAGE_FILENAMES } from '../constants'

// Refusal reasons for a local-file request. Refusals map to 403, a
// missing file to 404; the raw path is never logged.
type LocalFileReason = 'no-root' | 'bad-url' | 'outside-root' | 'not-preview'

export type LocalFileDecision =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: LocalFileReason }

// Resolves a local-file pathname against the effective mods path using
// lexical containment only (no realpath): mods folders may be junctions
// to another drive and must keep serving previews. Pure: no disk access
// and no Electron imports, so it unit-tests without mocks.
export function resolveLocalFilePath(root: string | null, pathname: string): LocalFileDecision {
  if (typeof root !== 'string' || root === '' || path.win32.isAbsolute(root) === false) {
    return { ok: false, reason: 'no-root' }
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return { ok: false, reason: 'bad-url' }
  }
  if (decoded.includes('\0')) return { ok: false, reason: 'bad-url' }
  // On Windows the URL pathname keeps a leading slash before the drive
  // letter; strip it exactly like the previous handler did.
  const withoutDriveSlash = decoded.replace(/^\/([A-Za-z]:)/, '$1')
  const candidate = path.win32.resolve(root, withoutDriveSlash)
  const rel = path.win32.relative(root, candidate)
  if (rel === '' || rel === '..' || rel.startsWith('..\\') || path.win32.isAbsolute(rel)) {
    return { ok: false, reason: 'outside-root' }
  }
  if (!PREVIEW_IMAGE_FILENAMES.includes(path.win32.basename(candidate).toLowerCase())) {
    return { ok: false, reason: 'not-preview' }
  }
  // The resolved path keeps the original letter case; the handler serves
  // only this path, never the decoded string.
  return { ok: true, path: candidate }
}
