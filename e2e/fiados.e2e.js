// E2E: flujo principal de Control de Créditos.
// 1) Agregar un producto al catálogo.
// 2) Registrar un fiado para un cliente NUEVO con ese producto.
// 3) Verificar que el cliente aparece con la deuda correcta.
// Al final borra todo lo que creó (solo dentro del negocio de la cuenta E2E).
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const sufijo = Date.now().toString().slice(-6)
const PRODUCTO = `E2E Producto ${sufijo}`
const CLIENTE = `E2E Cliente ${sufijo}`

test.describe.configure({ mode: 'serial' })
test.skip(!EMAIL || !PASSWORD, 'Definí E2E_EMAIL y E2E_PASSWORD en tu archivo .env')

async function iniciarSesion(page) {
  await page.goto('/login')
  await page.getByPlaceholder('correo@ejemplo.com').fill(EMAIL)
  await page.getByPlaceholder('Mínimo 6 caracteres').fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('Registrar fiado', { exact: true })).toBeVisible()
}

test('agrega un producto al catálogo', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/app/productos')

  await page.getByPlaceholder('Nombre del producto').fill(PRODUCTO)
  await page.getByPlaceholder('Precio (L)').fill('25')
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()

  await expect(page.getByText(`${PRODUCTO} — L 25.00`)).toBeVisible()
})

test('registra un fiado para un cliente nuevo con ese producto', async ({ page }) => {
  await iniciarSesion(page)

  const tarjeta = page.locator('.card').filter({ hasText: 'Registrar fiado' })
  const selectCliente = tarjeta.locator('select').nth(0)
  const selectProducto = tarjeta.locator('select').nth(1)

  // Cliente nuevo
  await selectCliente.selectOption('nuevo')
  await page.getByPlaceholder('Nombre del cliente nuevo').fill(CLIENTE)

  // Producto del catálogo (esperamos a que cargue la lista)
  await expect(selectProducto.locator('option', { hasText: PRODUCTO })).toHaveCount(1)
  await selectProducto.selectOption({ label: `${PRODUCTO} (L 25.00)` })
  await tarjeta.getByRole('button', { name: 'Agregar', exact: true }).click()

  // Cantidad 2 -> total L 50.00
  await tarjeta.getByRole('button', { name: '+', exact: true }).click()
  await expect(tarjeta.getByText('Total: L 50.00')).toBeVisible()

  await tarjeta.getByRole('button', { name: 'Guardar fiado' }).click()
  await expect(page.getByText('Fiado registrado correctamente.')).toBeVisible()

  // El cliente aparece en Clientes con la deuda correcta
  await page.goto('/app/clientes')
  await page.getByPlaceholder('Buscar cliente…').fill(CLIENTE)
  await expect(page.locator('.client-card').filter({ hasText: CLIENTE })).toContainText('debe L 50.00')
})

// Limpieza: borra los datos de prueba (también restos de corridas anteriores).
// Usa la misma cuenta E2E, así que la RLS solo le deja tocar su propio negocio.
test.afterAll(async () => {
  if (!EMAIL || !PASSWORD) return
  try {
    await limpiarDatosDePrueba()
  } catch (e) {
    // En algunas redes (proxy corporativo) Node no puede conectarse a Supabase.
    // No hacemos fallar el test: los datos quedan en el negocio de pruebas y se
    // borran en la próxima corrida desde una red sin esa restricción.
    console.warn('Aviso: no se pudieron borrar los datos de prueba:', e.message)
  }
})

async function limpiarDatosDePrueba() {
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw error

  const { data: clientes } = await sb.from('clientes').select('id').like('nombre', 'E2E Cliente %')
  const idsClientes = (clientes || []).map((c) => c.id)
  if (idsClientes.length > 0) {
    const { data: movs } = await sb.from('movimientos').select('id').in('cliente_id', idsClientes)
    const idsMovs = (movs || []).map((m) => m.id)
    if (idsMovs.length > 0) {
      await sb.from('movimiento_detalle').delete().in('movimiento_id', idsMovs)
      await sb.from('movimientos').delete().in('id', idsMovs)
    }
    await sb.from('clientes').delete().in('id', idsClientes)
  }
  await sb.from('productos').delete().like('nombre', 'E2E Producto %')
  await sb.auth.signOut()
}
