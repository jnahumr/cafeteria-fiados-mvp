-- 0002 · Negocios (la cafetería / pulpería). Raíz del modelo multi-tenant.
create table if not exists public.negocios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  codigo_invitacion text unique default public.generar_codigo(),
  creado_en         timestamptz default now()
);
