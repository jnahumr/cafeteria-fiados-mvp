-- 0009 · Seguridad a nivel de fila (RLS): cada usuario ve solo su negocio.
-- Depende de: mi_negocio_id() y todas las tablas.
-- Idempotente: enable RLS es no-op si ya está activo; drop policy if exists antes de crear.

alter table public.negocios           enable row level security;
alter table public.perfiles           enable row level security;
alter table public.productos          enable row level security;
alter table public.clientes           enable row level security;
alter table public.movimientos        enable row level security;
alter table public.movimiento_detalle enable row level security;

-- negocios: ver solo el mío
drop policy if exists "ver mi negocio" on public.negocios;
create policy "ver mi negocio" on public.negocios
  for select to public using (id = public.mi_negocio_id());

-- perfiles: ver el mío + leer los del mismo negocio
drop policy if exists "ver mi perfil" on public.perfiles;
create policy "ver mi perfil" on public.perfiles
  for select to public using (id = auth.uid());

drop policy if exists "leer perfiles del mismo negocio" on public.perfiles;
create policy "leer perfiles del mismo negocio" on public.perfiles
  for select to authenticated using (negocio_id = public.mi_negocio_id());

-- productos / clientes / movimientos / detalle: acceso completo dentro de mi negocio
drop policy if exists "productos de mi negocio" on public.productos;
create policy "productos de mi negocio" on public.productos
  for all to public using (negocio_id = public.mi_negocio_id())
  with check (negocio_id = public.mi_negocio_id());

drop policy if exists "clientes de mi negocio" on public.clientes;
create policy "clientes de mi negocio" on public.clientes
  for all to public using (negocio_id = public.mi_negocio_id())
  with check (negocio_id = public.mi_negocio_id());

drop policy if exists "movimientos de mi negocio" on public.movimientos;
create policy "movimientos de mi negocio" on public.movimientos
  for all to public using (negocio_id = public.mi_negocio_id())
  with check (negocio_id = public.mi_negocio_id());

drop policy if exists "detalle de mi negocio" on public.movimiento_detalle;
create policy "detalle de mi negocio" on public.movimiento_detalle
  for all to public using (negocio_id = public.mi_negocio_id())
  with check (negocio_id = public.mi_negocio_id());
