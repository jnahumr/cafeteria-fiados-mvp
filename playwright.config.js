import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Carga las variables del .env (E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_*)
// sin pisar las que ya existan en el entorno (por ejemplo, en CI).
process.env = { ...loadEnv('', process.cwd(), ''), ...process.env }

// Por defecto prueba contra el servidor local; con E2E_BASE_URL se puede
// apuntar a otro ambiente (por ejemplo, un preview de Vercel).
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173'

// En Windows usamos el Microsoft Edge ya instalado (no hace falta descargar
// navegadores, útil en redes corporativas que bloquean la descarga).
// Se puede forzar otro con E2E_CHANNEL=chrome, o E2E_CHANNEL=chromium para
// usar el Chromium descargado por Playwright (lo normal en CI/Linux).
const canalPorDefecto = process.platform === 'win32' ? 'msedge' : 'chromium'
const channel = process.env.E2E_CHANNEL || canalPorDefecto

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-HN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
