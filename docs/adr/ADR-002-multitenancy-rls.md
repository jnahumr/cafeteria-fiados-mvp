# ADR-002: Multi-tenancy con RLS en una base compartida en vez de una base por negocio

- **Estado:** Aceptada
- **Fecha:** 2025 (ajustar a la fecha real de la decisión)
- **Decisores:** desarrollador del producto

## Contexto

La aplicación es multi-tenant: varios negocios (cafeterías) usan la misma app y
cada uno debe ver **solo sus propios datos** (clientes, productos, fiados y
abonos). El sistema lo mantiene una sola persona, así que la operación tiene que
ser lo más simple posible.

Opciones consideradas para aislar los datos entre negocios:

1. **Una base (o esquema) por negocio**: máximo aislamiento físico, pero se
   multiplican las migraciones, el mantenimiento y el costo con cada negocio
   nuevo.
2. **Una sola base compartida** con aislamiento lógico por `negocio_id`,
   aplicado con Row Level Security.

## Decisión

**Usar una única base Postgres compartida y aislar los datos por negocio con Row
Level Security (RLS) y la función `mi_negocio_id()`**, en vez de crear una base o
instancia separada por cada negocio.

Cada tabla relevante (`perfiles`, `productos`, `movimientos`,
`movimiento_detalle`) referencia un `negocio_id`, y las políticas RLS solo dejan
ver/modificar filas del negocio del usuario autenticado. Las lecturas cruzadas
necesarias (p. ej. leer el perfil autor de un movimiento) se resuelven con una
función `security definer` acotada al mismo `negocio_id`.

## Consecuencias

### Positivas
- **Operación simple:** una sola base, una sola migración, escala a muchos
  negocios sin trabajo extra por cada uno.
- **Costo bajo:** no se paga ni se administra una base por cliente.
- El aislamiento queda **declarado y centralizado** en las políticas, no
  disperso por el código.

### Negativas / lo que se sacrifica
- El aislamiento depende **por completo de que las políticas RLS estén bien
  escritas**: un bug en una política podría filtrar datos entre negocios. Exige
  pruebas cuidadosas.
- No hay separación física de datos entre clientes (algo que ciertos sectores sí
  exigen), a cambio de la simplicidad operativa.
- Las consultas que legítimamente cruzan usuarios requieren funciones
  `security definer`, que hay que revisar con cuidado.
