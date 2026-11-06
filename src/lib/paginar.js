// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta.
// Si una tabla crece más allá de eso, la consulta se corta sin avisar y la app
// calcula saldos con datos incompletos. Este helper pide la consulta por bloques
// hasta traer todas las filas.
//
// construirConsulta: función que devuelve una consulta NUEVA de Supabase
// (con su select/order) cada vez que se llama; aquí solo se le agrega .range().
// Devuelve { data, error } igual que Supabase, para no cambiar App.jsx.
export const TAM_BLOQUE = 1000

export async function traerTodo(construirConsulta, tam = TAM_BLOQUE) {
  const filas = []
  const vistos = new Set()
  let desde = 0

  while (true) {
    const { data, error } = await construirConsulta().range(desde, desde + tam - 1)
    if (error) return { data: null, error }

    for (const fila of data ?? []) {
      // Si alguien inserta un registro mientras paginamos, el bloque siguiente
      // se corre una posición y repetiría una fila: la descartamos por id.
      if (fila?.id != null) {
        if (vistos.has(fila.id)) continue
        vistos.add(fila.id)
      }
      filas.push(fila)
    }

    if (!data || data.length < tam) break
    desde += tam
  }

  return { data: filas, error: null }
}
