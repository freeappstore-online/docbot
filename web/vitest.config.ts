import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone Vitest config so we don't pull tailwind + PWA plugins (and their
// build-time CSS pipelines) into the test environment. happy-dom for the
// DOM-touching tests (markdown rendering, localStorage round-trips). Tests
// in scripts/ live outside web/src but cover the KB crawler helpers.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      '../scripts/**/*.test.{mjs,js,ts}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/**/*.{ts,tsx}',
        '../scripts/kb-helpers.mjs',
      ],
      exclude: [
        'src/lib/**/*.test.{ts,tsx}',
      ],
    },
  },
})
