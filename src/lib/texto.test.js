import { describe, it, expect } from 'vitest'
import { sinAcentos } from './texto'

describe('sinAcentos', () => {
  it('quita acentos y pasa a minúsculas', () => {
    expect(sinAcentos('María')).toBe('maria')
    expect(sinAcentos('JOSÉ PÉREZ')).toBe('jose perez')
  })

  it('maneja valores vacíos o nulos sin romper', () => {
    expect(sinAcentos(null)).toBe('')
    expect(sinAcentos(undefined)).toBe('')
    expect(sinAcentos('')).toBe('')
  })
})
