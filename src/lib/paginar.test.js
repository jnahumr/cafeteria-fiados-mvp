import { describe, it, expect } from 'vitest'
import { traerTodo } from './paginar'

// Simula una consulta de Supabase que respeta .range(desde, hasta).
function consultaFalsa(filas, { errorEn = null } = {}) {
  const rangos = []
  const construir = () => ({
    range: async (desde, hasta) => {
      rangos.push([desde, hasta])
      if (errorEn !== null && desde === errorEn) return { data: null, error: { message: 'falló' } }
      return { data: filas.slice(desde, hasta + 1), error: null }
    },
  })
  return { construir, rangos }
}

const crearFilas = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

describe('traerTodo', () => {
  it('trae más de un bloque completo (el bug de las 1000 filas)', async () => {
    const { construir, rangos } = consultaFalsa(crearFilas(1039))
    const { data, error } = await traerTodo(construir)
    expect(error).toBeNull()
    expect(data).toHaveLength(1039)
    expect(rangos).toEqual([[0, 999], [1000, 1999]])
  })

  it('hace una sola consulta si hay menos filas que el bloque', async () => {
    const { construir, rangos } = consultaFalsa(crearFilas(5))
    const { data } = await traerTodo(construir)
    expect(data).toHaveLength(5)
    expect(rangos).toHaveLength(1)
  })

  it('pide un bloque extra cuando el total es múltiplo exacto del bloque', async () => {
    const { construir, rangos } = consultaFalsa(crearFilas(4))
    const { data } = await traerTodo(construir, 2)
    expect(data).toHaveLength(4)
    expect(rangos).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('descarta filas repetidas entre bloques', async () => {
    const filas = [{ id: 1 }, { id: 2 }, { id: 2 }, { id: 3 }]
    const { construir } = consultaFalsa(filas)
    const { data } = await traerTodo(construir, 2)
    expect(data.map((f) => f.id)).toEqual([1, 2, 3])
  })

  it('devuelve el error de Supabase sin datos parciales', async () => {
    const { construir } = consultaFalsa(crearFilas(10), { errorEn: 2 })
    const { data, error } = await traerTodo(construir, 2)
    expect(data).toBeNull()
    expect(error).toEqual({ message: 'falló' })
  })

  it('tolera data null en una respuesta sin error', async () => {
    const construir = () => ({ range: async () => ({ data: null, error: null }) })
    const { data, error } = await traerTodo(construir)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
