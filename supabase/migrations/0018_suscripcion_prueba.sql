-- 0018 · Período de prueba y suscripción por negocio (sin pago en línea todavía).
--
-- Cada negocio tiene una fecha de fin de prueba y, cuando paga, una fecha
-- "pagado hasta". El negocio tiene acceso mientras la MAYOR de esas dos fechas
-- sea hoy o posterior (zona America/Tegucigalpa). Si no, queda vencido.
--
-- Cómo bloquea: igual que 0016, mi_negocio_id() devuelve NULL si la
-- suscripción venció, así que TODAS las políticas RLS bloquean a la vez, sin
-- cron ni tareas programadas: el bloqueo es automático al pasar la fecha.
--
-- Los pagos se registran a mano desde el panel admin (tabla pagos_suscripcion).
-- Cuando exista pago en línea, el webhook solo tendrá que llamar a la misma
-- lógica de admin_registrar_pago.
--
-- Depende de: negocios, perfiles, es_admin() (0013), 0016.
-- Idempotente: add column if not exists / create or replace / if not exists.

-- 1) Fecha de "hoy" en Honduras (la base corre en UTC).
create or replace function public.hoy_hn()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Tegucigalpa')::date $$;

-- 2) Columnas de suscripción en negocios.
--    Negocios nuevos: 30 días de prueba desde que se crean.
alter table public.negocios
  add column if not exists prueba_hasta date;
alter table public.negocios
  add column if not exists pagado_hasta date;

-- Negocios que ya existían: 30 días de prueba desde hoy (nadie queda bloqueado
-- al aplicar la migración). Luego se registra su pago desde el panel admin.
update public.negocios
   set prueba_hasta = public.hoy_hn() + 30
 where prueba_hasta is null;

alter table public.negocios
  alter column prueba_hasta set default (public.hoy_hn() + 30);
alter table public.negocios
  alter column prueba_hasta set not null;

-- 3) Historial de pagos (auditoría; base para el pago en línea futuro).
create table if not exists public.pagos_suscripcion (
  id             bigint generated always as identity primary key,
  negocio_id     uuid not null references public.negocios(id) on delete cascade,
  meses          int  not null check (meses between 1 and 24),
  monto          numeric(10,2),
  metodo         text not null default 'manual',
  referencia     text,
  pagado_hasta   date not null,
  registrado_por uuid references auth.users(id),
  creado_en      timestamptz not null default now()
);
create index if not exists idx_pagos_suscripcion_negocio
  on public.pagos_suscripcion (negocio_id);
alter table public.pagos_suscripcion enable row level security;
-- Sin políticas: solo se lee/escribe vía funciones SECURITY DEFINER.

-- 4) Fecha de vencimiento efectiva de un negocio.
create or replace function public.vence_el(n public.negocios)
returns date
language sql
stable
as $$ select greatest(n.prueba_hasta, coalesce(n.pagado_hasta, n.prueba_hasta)) $$;

-- 5) mi_negocio_id(): igual que 0016, pero además exige suscripción vigente.
create or replace function public.mi_negocio_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.negocio_id
  from perfiles p
  join negocios n on n.id = p.negocio_id
  where p.id = auth.uid()
    and p.activo
    and n.activo
    and public.vence_el(n) >= public.hoy_hn()
$$;

-- 6) Estado de la cuenta: se agrega 'suscripcion_vencida'.
create or replace function public.mi_estado_cuenta()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p.id is null then 'sin_perfil'
    when not p.activo then 'usuario_deshabilitado'
    when n.id is not null and not n.activo then 'negocio_deshabilitado'
    when n.id is not null and public.vence_el(n) < public.hoy_hn() then 'suscripcion_vencida'
    else 'activo'
  end
  from (select auth.uid() as uid) u
  left join perfiles p on p.id = u.uid
  left join negocios n on n.id = p.negocio_id
$$;
grant execute on function public.mi_estado_cuenta() to authenticated;

-- 7) Suscripción del negocio del usuario actual (para la barra de aviso).
--    Funciona aunque esté vencida (no usa mi_negocio_id).
create or replace function public.mi_suscripcion()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'plan',           case when n.pagado_hasta is not null
                             and n.pagado_hasta >= n.prueba_hasta then 'pagado' else 'prueba' end,
    'prueba_hasta',   n.prueba_hasta,
    'pagado_hasta',   n.pagado_hasta,
    'vence_el',       public.vence_el(n),
    'dias_restantes', public.vence_el(n) - public.hoy_hn()
  )
  from perfiles p
  join negocios n on n.id = p.negocio_id
  where p.id = auth.uid()
$$;
grant execute on function public.mi_suscripcion() to authenticated;

-- 8) Admin: registrar un pago manual. Extiende desde el vencimiento actual
--    (si todavía no venció) o desde hoy (si ya venció), sin perder días.
create or replace function public.admin_registrar_pago(
  p_negocio_id uuid,
  p_meses int,
  p_monto numeric default null,
  p_referencia text default null
)
returns date
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n negocios;
  nueva_fecha date;
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then
    raise exception 'Los meses deben estar entre 1 y 24';
  end if;

  select * into n from negocios where id = p_negocio_id for update;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;

  nueva_fecha := (greatest(public.vence_el(n), public.hoy_hn() - 1)
                  + make_interval(months => p_meses))::date;

  update negocios set pagado_hasta = nueva_fecha where id = p_negocio_id;

  insert into pagos_suscripcion (negocio_id, meses, monto, referencia, pagado_hasta, registrado_por)
  values (p_negocio_id, p_meses, p_monto, nullif(trim(p_referencia), ''), nueva_fecha, auth.uid());

  return nueva_fecha;
end;
$$;
grant execute on function public.admin_registrar_pago(uuid, int, numeric, text) to authenticated;

-- 9) Admin: extender la prueba N días (desde el fin actual de la prueba o desde hoy).
create or replace function public.admin_extender_prueba(p_negocio_id uuid, p_dias int)
returns date
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  nueva_fecha date;
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'Los días deben estar entre 1 y 90';
  end if;

  update negocios
     set prueba_hasta = greatest(prueba_hasta, public.hoy_hn() - 1) + p_dias
   where id = p_negocio_id
  returning prueba_hasta into nueva_fecha;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;
  return nueva_fecha;
end;
$$;
grant execute on function public.admin_extender_prueba(uuid, int) to authenticated;

-- 10) admin_usuarios(): igual que 0016, más los datos de suscripción.
create or replace function public.admin_usuarios()
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  return (
    select coalesce(json_agg(row_to_json(t) order by t.nombre), '[]'::json)
    from (
      select n.id, n.nombre, n.activo, n.deshabilitado_en,
        n.prueba_hasta, n.pagado_hasta,
        public.vence_el(n) as vence_el,
        public.vence_el(n) - public.hoy_hn() as dias_restantes,
        (
          select coalesce(json_agg(json_build_object(
                   'id', p.id,
                   'nombre', p.nombre,
                   'correo', u.email,
                   'rol', p.rol,
                   'activo', p.activo,
                   'es_yo', p.id = auth.uid()
                 ) order by p.rol, p.nombre), '[]'::json)
          from perfiles p
          left join auth.users u on u.id = p.id
          where p.negocio_id = n.id
        ) as usuarios
      from negocios n
    ) t
  );
end;
$$;
grant execute on function public.admin_usuarios() to authenticated;
