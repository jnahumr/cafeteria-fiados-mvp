# Tests E2E (Playwright)

Prueban el flujo principal como lo usaría una persona real, en un navegador:

1. Agregar un producto al catálogo.
2. Registrar un fiado para un **cliente nuevo** con ese producto (cantidad 2).
3. Verificar que el cliente aparece en Clientes con la deuda correcta (L 50.00).

Al terminar, el test **borra lo que creó** (cliente, fiado y producto), incluso
restos de corridas anteriores (todo lo que empiece con `E2E Cliente` / `E2E Producto`).

## Cuenta de prueba (obligatoria)

Los tests corren contra la base real de Supabase, así que usan una **cuenta y un
negocio exclusivos para pruebas**. Nunca uses una cuenta de un negocio real.

Agregá a tu `.env` (ya está en `.gitignore`, no se sube a GitHub):

```
E2E_EMAIL=correo-de-la-cuenta-de-prueba
E2E_PASSWORD=contraseña-de-la-cuenta-de-prueba
```

## Cómo correrlos

En Windows usan el **Microsoft Edge** instalado, así que no hay que descargar
navegadores. En Linux/CI: `npx playwright install chromium` la primera vez.

```bash
npm run e2e                       # corre los tests (levanta npm run dev solo)
npm run e2e:ui                    # modo visual, paso a paso
npm run e2e:reporte               # abre el reporte HTML de la última corrida
```

Para probar contra otro ambiente (por ejemplo, un preview de Vercel):

```bash
E2E_BASE_URL=https://tu-preview.vercel.app npm run e2e
```
