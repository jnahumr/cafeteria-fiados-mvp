-- 0008 · Detalle de productos de cada fiado (líneas del carrito).
-- Depende de: movimientos, negocios.
create table if not exists public.movimiento_detalle (
  id              uuid primary key default gen_random_uuid(),
  movimiento_id   bigint not null references public.movimientos(id),
  negocio_id      uuid not null references public.negocios(id),
  producto_nombre text not null,
  cantidad        integer not null default 1 check (cantidad > 0),
  precio_unitario numeric not null default 0,
  creado_en       timestamptz default now()
);
