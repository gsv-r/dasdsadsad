import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveLocalFilePath } from './localFile.js'

const ROOT = 'C:\\mods'

// Builds a URL pathname exactly like the renderer (toLocalFileUrl) and the
// handler (new URL(url).pathname) do, so accepted cases pin the real
// round-trip instead of a hand-written string.
function urlPathname(filePath: string): string {
  return new URL(`local-file:///${encodeURI(filePath.replace(/\\/g, '/'))}`).pathname
}

function previewPath(root: string, subdir: string, id: string, name: string): string {
  return path.win32.join(root, subdir, id, name)
}

describe('resolveLocalFilePath accepted', () => {
  it.each([
    ['bikes', 'bikeA', 'preview.png'],
    ['bikes', 'bikeA', 'preview.jpg'],
    ['bikes', 'bikeA', 'preview.jpeg'],
    ['tracks', 'trackA', 'preview.png'],
    [path.win32.join('rider', 'riders'), 'riderA', 'preview.png'],
    [path.win32.join('rider', 'helmets'), 'helmetA', 'preview.jpg'],
    [path.win32.join('rider', 'animations'), 'styleA', 'preview.jpeg']
  ])('serves %s of %s/%s', (subdir, id, name) => {
    const full = previewPath(ROOT, subdir, id, name)
    const decision = resolveLocalFilePath(ROOT, urlPathname(full))
    expect(decision).toEqual({ ok: true, path: full })
  })

  it('allows dot segments that stay inside the root', () => {
    const decision = resolveLocalFilePath(ROOT, '/C:/mods/bikes/../tracks/t/preview.jpg')
    expect(decision).toEqual({
      ok: true,
      path: path.win32.join(ROOT, 'tracks', 't', 'preview.jpg')
    })
  })

  it('allows preview names in a different letter case', () => {
    const full = previewPath(ROOT, 'bikes', 'bikeA', 'Preview.PNG')
    const decision = resolveLocalFilePath(ROOT, urlPathname(full))
    expect(decision).toEqual({ ok: true, path: full })
  })

  it('allows mixed separators', () => {
    const decision = resolveLocalFilePath(ROOT, '/C:/mods\\bikes/bikeA\\preview.png')
    expect(decision).toEqual({ ok: true, path: previewPath(ROOT, 'bikes', 'bikeA', 'preview.png') })
  })

  it('ignores drive letter case between root and request', () => {
    const decision = resolveLocalFilePath('C:\\MODS', '/c:/mods/bikes/bikeA/preview.png')
    expect(decision.ok).toBe(true)
  })

  it('serves a real file under a folder with accents, spaces and emoji', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pasta com ação 🎸-'))
    try {
      const dir = path.join(root, 'bikes', 'bikeA')
      fs.mkdirSync(dir, { recursive: true })
      const full = path.join(dir, 'preview.png')
      fs.writeFileSync(full, 'fake-png')
      const decision = resolveLocalFilePath(root, urlPathname(full))
      expect(decision).toEqual({ ok: true, path: full })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('never decodes twice: an encoded dot segment stays literal', () => {
    const decision = resolveLocalFilePath(ROOT, '/C:/mods/%252e%252e/preview.png')
    expect(decision.ok).toBe(true)
    if (decision.ok) expect(decision.path).toContain('%2e%2e')
  })
})

describe('resolveLocalFilePath refused', () => {
  it.each([
    ['escaping dot segments', '/C:/mods/../Windows/x/preview.png'],
    ['a different drive', '/D:/other/preview.png'],
    ['a UNC path', '//server/share/preview.png'],
    ['a device path', '/\\\\?\\C:\\secret\\preview.png'],
    ['an alternate data stream', '/C:/mods/bikes/a/preview.png:stream'],
    ['a trailing dot', '/C:/mods/bikes/a/preview.png.'],
    ['a short name', '/C:/mods/bikes/a/PREVIE~1.PNG'],
    ['a nul byte', '/C:/mods/bikes/a/%00preview.png'],
    ['a malformed escape', '/C:/mods/bikes/a/%zzpreview.png'],
    ['a non-preview file', '/C:/mods/bikes/a/metadata.json'],
    ['a mod archive', '/C:/mods/bikes/a/bike.pkz'],
    ['the root itself', '/C:/mods']
  ])('refuses %s', (_label, pathname) => {
    const decision = resolveLocalFilePath(ROOT, pathname)
    expect(decision.ok).toBe(false)
  })

  it('refuses a trailing space', () => {
    const decision = resolveLocalFilePath(ROOT, '/C:/mods/bikes/a/preview.png%20')
    expect(decision).toEqual({ ok: false, reason: 'not-preview' })
  })

  it('refuses double-encoded dot segments aimed outside the root', () => {
    const decision = resolveLocalFilePath(ROOT, '/C:/secret/%252e%252e/preview.png')
    expect(decision).toEqual({ ok: false, reason: 'outside-root' })
  })

  it('refuses a null or empty root', () => {
    expect(resolveLocalFilePath(null, '/C:/mods/bikes/a/preview.png')).toEqual({
      ok: false,
      reason: 'no-root'
    })
    expect(resolveLocalFilePath('', '/C:/mods/bikes/a/preview.png')).toEqual({
      ok: false,
      reason: 'no-root'
    })
  })

  it('refuses a relative root', () => {
    expect(resolveLocalFilePath('mods', '/mods/bikes/a/preview.png')).toEqual({
      ok: false,
      reason: 'no-root'
    })
  })

  it('accepts a preview through a junction without resolving it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-localfile-root-'))
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'knee-down-localfile-target-'))
    try {
      const targetPreview = path.join(target, 'preview.png')
      fs.writeFileSync(targetPreview, 'fake-png')
      const link = path.join(root, 'linked')
      fs.symlinkSync(target, link, 'junction')
      const throughLink = path.join(link, 'preview.png')
      const decision = resolveLocalFilePath(root, urlPathname(throughLink))
      expect(decision.ok).toBe(true)
      // Lexical: the served path goes through the link, while realpath
      // would point at the target outside the root.
      if (decision.ok) expect(decision.path).toBe(throughLink)
      expect(fs.realpathSync(throughLink)).not.toBe(throughLink)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(target, { recursive: true, force: true })
    }
  })
})
