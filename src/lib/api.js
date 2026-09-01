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
