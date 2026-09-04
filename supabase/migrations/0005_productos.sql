-- 0005 · Catálogo de productos por negocio.
create table if not exists public.productos (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id),
  nombre     text not null,
  precio     numeric default 0,
  creado_en  timestamptz default now()
);
