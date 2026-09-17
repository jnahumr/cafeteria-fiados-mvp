-- 0013 · Panel de administración (overview). Agrega una tabla de admins, la
-- función es_admin(), y admin_overview() que devuelve SOLO métricas agregadas
-- por negocio (conteos), nunca nombres de clientes ni montos de fiados.
-- NO modifica las políticas RLS existentes: los usuarios normales no cambian.
-- Depende de: negocios, perfiles, productos, clientes, movimientos.
-- Idempotente: create table if not exists / create or replace function.

-- 1) Administradores de la plataforma.
create table if not exists public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz default now()
);
alter table public.admins enable row level security;
-- Sin políticas: nadie la lee/escribe desde el cliente (solo el backend por SQL).

-- 2) ¿El usuario actual es administrador?
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;
grant execute on function public.es_admin() to authenticated;

-- 3) Overview del panel admin: métricas agregadas por negocio.
--    SECURITY DEFINER para poder contar en todos los negocios, pero solo
--    devuelve conteos y exige ser admin (nunca datos sensibles).
create or replace function public.admin_overview()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  return (
    select coalesce(json_agg(row_to_json(t) order by t.nombre), '[]'::json)
    from (
      select n.id, n.nombre, n.creado_en,
        (select count(*) from perfiles p    where p.negocio_id  = n.id) as usuarios,
        (select count(*) from productos pr  where pr.negocio_id = n.id) as productos,
        (select count(*) from clientes c    where c.negocio_id  = n.id) as clientes,
        (select count(*) from movimientos m where m.negocio_id  = n.id) as movimientos,
        (select max(m.fecha) from movimientos m where m.negocio_id = n.id) as ultima_actividad
      from negocios n
    ) t
  );
end;
$$;
grant execute on function public.admin_overview() to authenticated;
