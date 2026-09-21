-- 0015 · Feedback para el panel admin: TODA la retroalimentación de todos los
-- negocios, con el nombre del negocio. SECURITY DEFINER para poder leer entre
-- negocios, pero exige ser admin (es_admin) y solo devuelve opiniones, nunca
-- datos sensibles. NO modifica las políticas RLS de 0014: los usuarios normales
-- siguen viendo solo el feedback de su propio negocio.
-- Depende de: feedback (0014), negocios, es_admin() (0013). Idempotente.

create or replace function public.admin_feedback()
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
    select coalesce(json_agg(row_to_json(t) order by t.creado_en desc), '[]'::json)
    from (
      select f.id, f.calificacion, f.comentario, f.autor, f.creado_en,
             n.nombre as negocio
      from feedback f
      join negocios n on n.id = f.negocio_id
    ) t
  );
end;
$$;
grant execute on function public.admin_feedback() to authenticated;