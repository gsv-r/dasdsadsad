import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { GAME_PROCESS_NAME } from '../constants'

const execAsync = promisify(exec)

export async function launch(steamExe: string, appId: string, args: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`"${steamExe}" -applaunch ${appId} ${args}`)
  // steam.exe writes to stderr even on success, so this is informational only.
  if (stderr) console.log('Launch stderr:', stderr.trim())
  return stdout
}

export function isRunning(): boolean {
  const target = GAME_PROCESS_NAME.toLowerCase()
  // Filtering by IMAGENAME is cheaper and avoids substring false positives
  // from other tasklist columns/rows.
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${GAME_PROCESS_NAME}" /FO CSV /NH`, {
      windowsHide: true
    })
      .toString()
      .toLowerCase()
    if (out.includes(target)) return true
    // Reaches here when the filter finds nothing ("No tasks..."): process exited.
    return false
  } catch {
    // Fallback: full tasklist (e.g. filter unavailable on some Windows setups).
    try {
      return execSync('tasklist', { windowsHide: true }).toString().toLowerCase().includes(target)
    } catch {
      return false
    }
  }
}
