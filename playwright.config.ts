import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/dsp',
  webServer: {
    command: 'npx vite serve src/renderer --port 8788 --strictPort',
    url: 'http://localhost:8788/harness.html',
    reuseExistingServer: true
  },
  use: { baseURL: 'http://localhost:8788' }
})
