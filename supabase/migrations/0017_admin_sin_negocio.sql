-- 0017 · Los administradores de la plataforma NO tienen negocio.
-- El admin solo gestiona la plataforma (estadísticas, control de acceso,
-- feedback). Si quiere operar un negocio, debe usar una cuenta de negocio.
-- Se bloquea que un admin cree o se una a un negocio desde el onboarding.
-- (Las mismas funciones de 0011/0016, solo se agrega la validación es_admin.)
-- Depende de: negocios, perfiles, es_admin() (0013). Idempotente: create or replace.

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
  IF public.es_admin() THEN
    RAISE EXCEPTION 'Los administradores no tienen negocio: usá una cuenta de negocio';
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
  IF public.es_admin() THEN
    RAISE EXCEPTION 'Los administradores no tienen negocio: usá una cuenta de negocio';
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

grant execute on function public.crear_negocio_onboarding(text, text) to authenticated;
grant execute on function public.unirse_negocio_onboarding(text, text) to authenticated;
