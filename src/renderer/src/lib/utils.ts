import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function toLocalFileUrl(filePath: string): string {
  return `local-file:///${encodeURI(filePath.replace(/\\/g, '/'))}`
}

const BASE_VALUES = new Set(['', 'default', '--base--'])

export function isBaseSelection(value: unknown): boolean {
  if (value == null) return true
  return BASE_VALUES.has(String(value))
}
