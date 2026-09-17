import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcovonly'],
      reportsDirectory: 'coverage',
      include: ['src/lib/**'],
      exclude: ['**/*.test.js', 'src/lib/api.js'],
    },
  },
})
