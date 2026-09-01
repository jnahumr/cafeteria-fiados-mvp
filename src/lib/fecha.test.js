import { describe, it, expect } from 'vitest'
import { formatFecha } from './fecha'

describe('formatFecha', () => {
  it('convierte una fecha UTC a la hora de Honduras', () => {
    // 15:30 UTC equivale a 09:30 en Tegucigalpa (UTC-6)
    const resultado = formatFecha('2026-08-01T15:30:00Z')
    expect(typeof resultado).toBe('string')
    expect(resultado).toContain('2026')
    expect(resultado).toContain('09') // la hora ya convertida
    expect(resultado).toContain('30') // los minutos
  })
})
