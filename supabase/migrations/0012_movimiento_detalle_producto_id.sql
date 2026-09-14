-- 0012 · Normaliza el detalle: agrega producto_id (FK a productos) manteniendo
--        producto_nombre y precio_unitario como snapshot histórico del momento de venta.
-- Depende de: movimiento_detalle (0008), productos (0005).
-- Idempotente: add column if not exists / create index if not exists /
--              backfill solo sobre filas con producto_id nulo.

-- 1) FK a productos. ON DELETE SET NULL: borrar un producto NO rompe el histórico
--    (el detalle conserva producto_nombre y precio_unitario congelados).
alter table public.movimiento_detalle
  add column if not exists producto_id uuid references public.productos(id) on delete set null;

-- 2) Índice para agrupar/filtrar por producto de forma eficiente.
create index if not exists idx_movimiento_detalle_producto
  on public.movimiento_detalle(producto_id);

-- 3) Backfill de filas existentes: match por negocio + nombre
--    (tolerante a mayúsculas/espacios; determinista ante nombres repetidos).
update public.movimiento_detalle d
set producto_id = m.pid
from (
  select distinct on (negocio_id, lower(trim(nombre)))
         negocio_id, lower(trim(nombre)) as nom, id as pid
  from public.productos
  order by negocio_id, lower(trim(nombre)), id
) m
where m.negocio_id = d.negocio_id
  and m.nom = lower(trim(d.producto_nombre))
  and d.producto_id is null;
