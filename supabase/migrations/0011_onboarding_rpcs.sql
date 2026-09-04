-- 0011 · RPCs de onboarding: crear un negocio o unirse por código para un
-- usuario YA autenticado (p. ej. que entró con Google y aún no tiene perfil).
-- Depende de: negocios, perfiles.

create or replace function public.crear_negocio_onboarding(p_nombre_negocio text, p_nombre_usuario text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  uid uuid := auth.uid();
  nuevo_negocio_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa';
  END IF;
  IF EXISTS (SELECT 1 FROM perfiles WHERE id = uid) THEN
    RAISE EXCEPTION 'Este usuario ya tiene un negocio';
  END IF;
  IF p_nombre_negocio IS NULL OR trim(p_nombre_negocio) = '' THEN
    RAISE EXCEPTION 'El nombre del negocio no puede estar vacío';
  END IF;

  INSERT INTO negocios (nombre)
  VALUES (trim(p_nombre_negocio))
  RETURNING id INTO nuevo_negocio_id;

  INSERT INTO perfiles (id, negocio_id, nombre, rol)
  VALUES (uid, nuevo_negocio_id, COALESCE(trim(p_nombre_usuario), ''), 'duena');
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
  FROM negocios WHERE codigo_invitacion = upper(trim(p_codigo));
  IF negocio_existente IS NULL THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;

  INSERT INTO perfiles (id, negocio_id, nombre, rol)
  VALUES (uid, negocio_existente, COALESCE(trim(p_nombre_usuario), ''), 'empleado');
END;
$$;

grant execute on function public.crear_negocio_onboarding(text, text) to authenticated;
grant execute on function public.unirse_negocio_onboarding(text, text) to authenticated;
