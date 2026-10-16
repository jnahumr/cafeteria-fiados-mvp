import { describe, it, expect } from 'vitest'
import { calcularAviso, cuandoVence, enlacePago } from './suscripcion'

describe('cuandoVence', () => {
  it('usa hoy / mañana / en N días', () => {
    expect(cuandoVence(0)).toBe('hoy')
    expect(cuandoVence(1)).toBe('mañana')
    expect(cuandoVence(5)).toBe('en 5 días')
  })
})

describe('calcularAviso', () => {
  it('no muestra nada sin datos, lejos del vencimiento o ya vencida', () => {
    expect(calcularAviso(null)).toBeNull()
    expect(calcularAviso({ plan: 'prueba', dias_restantes: 20 })).toBeNull()
    expect(calcularAviso({ plan: 'prueba', dias_restantes: -1 })).toBeNull()
  })

  it('avisa en ámbar entre 4 y 7 días', () => {
    const a = calcularAviso({ plan: 'prueba', dias_restantes: 7 })
    expect(a.nivel).toBe('aviso')
    expect(a.texto).toBe('Su plan gratuito vence en 7 días, debe suscribirse a un plan de pago.')
  })

  it('pasa a urgente a 3 días o menos', () => {
    expect(calcularAviso({ plan: 'prueba', dias_restantes: 2 }).nivel).toBe('urgente')
    expect(calcularAviso({ plan: 'prueba', dias_restantes: 0 }).texto).toBe('Su plan gratuito vence hoy, debe suscribirse a un plan de pago.')
  })

  it('cambia el texto cuando el plan es pagado', () => {
    expect(calcularAviso({ plan: 'pagado', dias_restantes: 1 }).texto).toBe('Tu suscripción vence mañana, renová ahora.')
  })
})

describe('enlacePago', () => {
  it('devuelve null sin número', () => {
    expect(enlacePago({ telefono: '' })).toBeNull()
  })

  it('arma el enlace de WhatsApp con el negocio', () => {
    const url = enlacePago({ telefono: '+504 9999-0000', nombreNegocio: 'Infra', vencida: true })
    expect(url.startsWith('https://wa.me/50499990000?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hola, quiero reactivar mi suscripción de Control de Créditos para el negocio "Infra".')
  })
  it('usa "activar" y omite el negocio cuando no se indica', () => {
    const url = enlacePago({ telefono: '50499990000' })
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hola, quiero activar mi suscripción de Control de Créditos.')
  })
})
