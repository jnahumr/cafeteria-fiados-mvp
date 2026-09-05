// Capa de datos: el ÚNICO archivo que habla directo con Supabase.
// Cada función envuelve una consulta y devuelve { data, error } tal como Supabase,
// para que App.jsx mantenga sus mismos chequeos de error sin cambiar su lógica.
import { supabase } from '../supabaseClient'

// --- PRODUCTOS ---

// Trae todos los productos ordenados por nombre.
export async function obtenerProductos() {
  return await supabase
    .from('productos')
    .select('*')
    .order('nombre')
}

// Inserta un producto nuevo en el catálogo del negocio.
export async function crearProducto({ nombre, precio, negocioId }) {
  return await supabase
    .from('productos')
    .insert({ nombre, precio, negocio_id: negocioId })
}

// Elimina un producto del catálogo por su id.
export async function eliminarProductoPorId(idProducto) {
  return await supabase
    .from('productos')
    .delete()
    .eq('id', idProducto)
}

// --- CLIENTES Y MOVIMIENTOS (lecturas) ---

// Trae todos los clientes del negocio, ordenados por nombre.
export async function obtenerClientes() {
  return await supabase
    .from('clientes')
    .select('*')
    .order('nombre')
}

// Trae todos los movimientos con su autor, quién los eliminó y su detalle.
export async function obtenerMovimientos() {
  return await supabase
    .from('movimientos')
    .select('*, perfiles!movimientos_registrado_por_fkey(nombre), eliminador:perfiles!movimientos_eliminado_por_fkey(nombre), movimiento_detalle(producto_nombre, cantidad, precio_unitario)')
    .order('fecha', { ascending: false })
}

// --- CLIENTES Y MOVIMIENTOS (escrituras) ---

// Crea un cliente nuevo y devuelve su fila (necesitamos el id).
export async function crearCliente({ nombre, telefono = null, negocioId }) {
  return await supabase
    .from('clientes')
    .insert({ nombre, telefono, negocio_id: negocioId })
    .select()
    .single()
}

// Actualiza (o agrega) el teléfono de un cliente existente.
export async function actualizarTelefonoCliente({ clienteId, telefono }) {
  return await supabase
    .from('clientes')
    .update({ telefono })
    .eq('id', clienteId)
}

// Actualiza el nombre y el teléfono de un cliente (edición desde su detalle).
export async function actualizarCliente({ clienteId, nombre, telefono }) {
  return await supabase
    .from('clientes')
    .update({ nombre, telefono })
    .eq('id', clienteId)
}

// Registra un movimiento de tipo 'fiado' y devuelve su fila (necesitamos el id
// para colgarle el detalle). El 'tipo' va fijo aquí porque esta función es solo
// para fiados.
export async function crearMovimientoFiado({ clienteId, monto, concepto, negocioId }) {
  return await supabase
    .from('movimientos')
    .insert({
      cliente_id: clienteId,
      tipo: 'fiado',
      monto,
      concepto,
      negocio_id: negocioId,
    })
    .select()
    .single()
}

// Inserta las líneas de detalle de un fiado (un array de líneas ya armado).
export async function crearDetalleMovimiento(lineas) {
  return await supabase
    .from('movimiento_detalle')
    .insert(lineas)
}

// Registra un movimiento de tipo 'abono'. El 'tipo' y el 'concepto' van fijos
// aquí porque esta función es solo para abonos.
export async function crearAbono({ clienteId, monto, negocioId }) {
  return await supabase
    .from('movimientos')
    .insert({
      cliente_id: clienteId,
      tipo: 'abono',
      monto,
      concepto: 'Abono',
      negocio_id: negocioId,
    })
}

// Borrado lógico: marca cuándo y quién eliminó el movimiento (no lo borra).
// El timestamp se genera aquí adentro para mantener idéntico el comportamiento.
export async function marcarMovimientoEliminado({ idMovimiento, eliminadoPor }) {
  return await supabase
    .from('movimientos')
    .update({
      eliminado_en: new Date().toISOString(),
      eliminado_por: eliminadoPor,
    })
    .eq('id', idMovimiento)
}

// --- ONBOARDING (perfil para usuarios ya logueados, ej. entraron con Google) ---

// Crea un negocio nuevo y deja al usuario actual como dueña.
// La función en la base usa auth.uid(), por eso no le pasamos el id acá.
export async function crearNegocioOnboarding({ nombreNegocio, nombreUsuario }) {
  return await supabase.rpc('crear_negocio_onboarding', {
    p_nombre_negocio: nombreNegocio,
    p_nombre_usuario: nombreUsuario,
  })
}

// Une al usuario actual a un negocio existente por código, como empleado.
export async function unirseNegocioOnboarding({ codigo, nombreUsuario }) {
  return await supabase.rpc('unirse_negocio_onboarding', {
    p_codigo: codigo,
    p_nombre_usuario: nombreUsuario,
  })
}
