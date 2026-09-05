-- 0004 · Función auxiliar para RLS: devuelve el negocio del usuario actual.
-- Depende de: perfiles. La usan todas las políticas de seguridad (0009).
create or replace function public.mi_negocio_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$ select negocio_id from perfiles where id = auth.uid() $$;
