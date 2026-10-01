// Lógica pura de la suscripción (sin React ni Supabase) para poder probarla.
// La fuente de verdad del bloqueo es la base (mi_negocio_id); esto solo decide
// qué aviso mostrar en la barra.

export const DIAS_AVISO = 7    // desde cuántos días antes se muestra la barra
export const DIAS_URGENTE = 3  // desde cuántos días antes se pone roja

// Número de WhatsApp para suscribirse (variable VITE_WHATSAPP_SOPORTE en Vercel / .env.local).
export const WHATSAPP_SOPORTE = import.meta.env.VITE_WHATSAPP_SOPORTE || ''

// Texto relativo: "hoy", "mañana", "en 5 días".
export function cuandoVence(dias) {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

// Devuelve null (no mostrar nada) o { nivel: 'aviso' | 'urgente', texto }.
// suscripcion = respuesta de mi_suscripcion(): { plan, dias_restantes, ... }
export function calcularAviso(suscripcion) {
  if (!suscripcion || typeof suscripcion.dias_restantes !== 'number') return null
  const dias = suscripcion.dias_restantes
  if (dias < 0 || dias > DIAS_AVISO) return null
  const que = suscripcion.plan === 'pagado' ? 'Tu suscripción vence' : 'Tu prueba vence'
  const accion = suscripcion.plan === 'pagado' ? 'renová ahora' : 'suscribite ahora'
  return {
    nivel: dias <= DIAS_URGENTE ? 'urgente' : 'aviso',
    texto: `${que} ${cuandoVence(dias)} — ${accion}`,
  }
}

// Enlace de WhatsApp para pedir la suscripción (mientras no haya pago en línea).
// Devuelve null si no hay número configurado.
export function enlacePago({ telefono, nombreNegocio, vencida = false }) {
  const numero = String(telefono || '').replace(/\D/g, '')
  if (!numero) return null
  const negocio = nombreNegocio ? ` para el negocio "${nombreNegocio}"` : ''
  const motivo = vencida ? 'reactivar' : 'activar'
  const texto = `Hola, quiero ${motivo} mi suscripción de Control de Créditos${negocio}.`
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
