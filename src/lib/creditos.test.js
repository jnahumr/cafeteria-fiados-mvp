import { describe, expect, it } from 'vitest'
import { calcularSaldoCliente, buscarClienteExistente } from './creditos'

describe('calcularSaldoCliente', () => {
  it('resta los abonos de los fiados e ignora los movimientos eliminados', () => {
    // Arrange: un cliente con dos fiados, un abono y un fiado ya borrado
    // (borrado lógico) que no debería contar para el saldo.
    const movimientos = [
      { tipo: 'fiado', monto: 100, eliminado_en: null },
      { tipo: 'fiado', monto: 50, eliminado_en: null },
      { tipo: 'abono', monto: 30, eliminado_en: null },
      { tipo: 'fiado', monto: 999, eliminado_en: '2026-08-01T10:00:00.000Z' },
    ]

    // Act
    const saldo = calcularSaldoCliente(movimientos)

    // Assert: 100 + 50 - 30 = 120, sin contar el fiado eliminado
    expect(saldo).toBe(120)
  })
})

describe('buscarClienteExistente', () => {
  it('detecta un cliente ya registrado aunque el nombre tenga otras mayúsculas o espacios extra', () => {
    // Arrange
    const clientes = [
      { id: 1, nombre: 'Juan Pérez' },
      { id: 2, nombre: 'María López' },
    ]

    // Act
    const encontrado = buscarClienteExistente(clientes, '  juan pérez  ')

    // Assert: debe encontrar al mismo cliente para no crear un duplicado
    expect(encontrado).toEqual({ id: 1, nombre: 'Juan Pérez' })
  })
})
