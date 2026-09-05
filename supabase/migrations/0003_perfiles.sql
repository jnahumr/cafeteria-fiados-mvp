-- 0003 · Perfiles: enlaza un usuario de auth con un negocio y su rol.
-- Depende de: negocios, auth.users.
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  negocio_id uuid references public.negocios(id),
  nombre     text,
  rol        text not null default 'empleado' check (rol in ('duena','empleado')),
  creado_en  timestamptz default now()
);
