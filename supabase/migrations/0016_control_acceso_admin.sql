-- 0016 · Control de acceso desde el panel admin: habilitar / deshabilitar
-- usuarios y negocios. Deshabilitar NO borra nada: es reversible y queda
-- registrado cuándo se hizo.
--
-- Cómo bloquea: todas las políticas RLS (0009, 0014) dependen de
-- mi_negocio_id(). Ahora esa función devuelve NULL si el usuario o su negocio
-- están deshabilitados, así que el bloqueo aplica en TODAS las tablas a la vez.
--
-- Privacidad (menor privilegio): admin_usuarios() devuelve solo nombres de
-- negocios y de sus usuarios (nombre, correo, rol, estado). Nunca clientes,
-- montos ni movimientos.
--
-- Depende de: negocios, perfiles, es_admin() (0013), onboarding (0010, 0011).
-- Idempotente: add column if not exists / create or replace function.

-- 1) Estado activo en negocios y perfiles (todos quedan activos por defecto).
alter table public.negocios
  add column if not exists activo boolean not null default true;
alter table public.negocios
  add column if not exists deshabilitado_en timestamptz;

alter table public.perfiles
  add column if not exists activo boolean not null default true;
alter table public.perfiles
  add column if not exists deshabilitado_en timestamptz;

-- 2) mi_negocio_id(): igual que antes, pero solo si usuario y negocio están activos.
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
$$;

-- 3) Estado de la cuenta del usuario actual (para que la app muestre un aviso).
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
    else 'activo'
  end
  from (select auth.uid() as uid) u
  left join perfiles p on p.id = u.uid
  left join negocios n on n.id = p.negocio_id
$$;
grant execute on function public.mi_estado_cuenta() to authenticated;

-- 4) Listado para el panel admin: negocios con sus usuarios. Sin datos sensibles.
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

-- 5) Habilitar / deshabilitar un usuario.
create or replace function public.admin_cambiar_estado_usuario(p_user_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  if p_user_id = auth.uid() and not p_activo then
    raise exception 'No podés deshabilitar tu propio usuario';
  end if;
  update perfiles
     set activo = p_activo,
         deshabilitado_en = case when p_activo then null else now() end
   where id = p_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;
grant execute on function public.admin_cambiar_estado_usuario(uuid, boolean) to authenticated;

-- 6) Habilitar / deshabilitar un negocio completo (todos sus usuarios quedan bloqueados).
create or replace function public.admin_cambiar_estado_negocio(p_negocio_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'Acceso denegado: se requiere ser administrador';
  end if;
  if not p_activo and exists (
    select 1 from perfiles where id = auth.uid() and negocio_id = p_negocio_id
  ) then
    raise exception 'No podés deshabilitar tu propio negocio';
  end if;
  update negocios
     set activo = p_activo,
         deshabilitado_en = case when p_activo then null else now() end
   where id = p_negocio_id;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;
end;
$$;
grant execute on function public.admin_cambiar_estado_negocio(uuid, boolean) to authenticated;

-- 7) Cerrar la puerta trasera: no se puede unir nadie a un negocio deshabilitado.
--    (Mismas funciones de 0010 y 0011, solo se agrega la validación "and activo".)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  codigo text;
  nombre_negocio_meta text;
  negocio_existente uuid;
  nuevo_negocio_id uuid;
BEGIN
  codigo := NEW.raw_user_meta_data->>'codigo_invitacion';
  nombre_negocio_meta := NEW.raw_user_meta_data->>'nombre_negocio';

  IF codigo IS NOT NULL AND codigo <> '' THEN
    -- Registro CON código: unirse a un negocio existente y activo como empleado
    SELECT id INTO negocio_existente
    FROM negocios WHERE codigo_invitacion = upper(codigo) AND activo;
    IF negocio_existente IS NULL THEN
      RAISE EXCEPTION 'Código de invitación inválido';
    END IF;
    INSERT INTO perfiles (id, negocio_id, nombre, rol)
    VALUES (NEW.id, negocio_existente,
            COALESCE(NEW.raw_user_meta_data->>'nombre',''), 'empleado');

  ELSIF nombre_negocio_meta IS NOT NULL AND nombre_negocio_meta <> '' THEN
    -- Registro CON nombre de negocio: crear negocio nuevo y quedar como dueña
    INSERT INTO negocios (nombre)
    VALUES (nombre_negocio_meta)
    RETURNING id INTO nuevo_negocio_id;
    INSERT INTO perfiles (id, negocio_id, nombre, rol)
    VALUES (NEW.id, nuevo_negocio_id,
            COALESCE(NEW.raw_user_meta_data->>'nombre',''), 'duena');

  ELSE
    -- Sin metadata (ej. entrar con Google la primera vez): no creamos nada.
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

create or replace function public.unirse_negocio_onboarding(p_codigo text, p_nombre_usuario text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  uid uuid := auth.uid();
  negocio_existente uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa';
  END IF;
  IF EXISTS (SELECT 1 FROM perfiles WHERE id = uid) THEN
    RAISE EXCEPTION 'Este usuario ya tiene un negocio';
  END IF;

  SELECT id INTO negocio_existente
  FROM negocios WHERE codigo_invitacion = upper(trim(p_codigo)) AND activo;
  IF negocio_existente IS NULL THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;

  INSERT INTO perfiles (id, negocio_id, nombre, rol)
  VALUES (uid, negocio_existente, COALESCE(trim(p_nombre_usuario), ''), 'empleado');
END;
$$;
