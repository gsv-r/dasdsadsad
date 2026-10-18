import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    setupFiles: ['src/test-setup.ts'],
    // electron-store must be processed by Vite (not externalized) so that
    // `vi.mock('electron')` applies to its `import electron from 'electron'`.
    // Otherwise it resolves the real Electron stub outside the mock registry
    // and the store cannot be constructed in tests.
    server: {
      deps: {
        inline: ['electron-store']
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/renderer/src/test-utils.tsx',
        'src/renderer/src/assets/**'
      ]
    }
  }
})
