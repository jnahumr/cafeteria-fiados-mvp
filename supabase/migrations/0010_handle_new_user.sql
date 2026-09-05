-- 0010 · Al crear un usuario en auth, arma su perfil según la metadata del registro.
-- Depende de: negocios, perfiles. Se dispara con un trigger sobre auth.users.
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
    -- Registro CON código: unirse a un negocio existente como empleado
    SELECT id INTO negocio_existente
    FROM negocios WHERE codigo_invitacion = upper(codigo);
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
    -- La app muestra el onboarding para que la persona elija crear o unirse.
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger sobre auth.users (idempotente: se recrea).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
