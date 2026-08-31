// Reglas de negocio puras del módulo de créditos.
// Se mantienen separadas de App.jsx para poder probarlas sin depender de React ni Supabase.

// El saldo de un cliente nunca se guarda: siempre se recalcula a partir de sus
// movimientos activos (fiados suman, abonos restan). Los movimientos con
// borrado lógico (eliminado_en) no deben afectar el saldo.
export function calcularSaldoCliente(movimientos) {
  return movimientos
    .filter((m) => !m.eliminado_en)
    .reduce((total, m) => {
      return m.tipo === 'fiado' ? total + Number(m.monto) : total - Number(m.monto)
    }, 0)
}

// Busca si ya existe un cliente con ese nombre (ignorando mayúsculas/minúsculas
// y espacios extra) para evitar crear un registro duplicado que fragmentaría
// la deuda de la misma persona en dos clientes distintos.
export function buscarClienteExistente(clientes, nombre) {
  const nombreNormalizado = nombre.trim().toLowerCase()
  return (
    clientes.find((c) => c.nombre.trim().toLowerCase() === nombreNormalizado) || null
  )
}
