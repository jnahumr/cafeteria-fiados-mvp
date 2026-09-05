-- 0001 · Extensiones base y función para generar códigos de invitación.
-- Debe ir primero: la tabla "negocios" usa generar_codigo() como default.
-- Idempotente: create extension if not exists / create or replace.

create extension if not exists pgcrypto;

-- Código corto (6 caracteres) para invitar empleados a un negocio.
create or replace function public.generar_codigo()
returns text
language sql
as $$
  select upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
$$;
