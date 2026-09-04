# Migraciones de base de datos

Esquema de la base (Supabase / PostgreSQL) del proyecto, en migraciones
**ordenadas** e **idempotentes**.

## Orden canónico

Los archivos se numeran (`0001`…`0011`) y deben ejecutarse en ese orden,
porque respetan las dependencias entre objetos:

| # | Archivo | Crea |
|---|---------|------|
| 0001 | generar_codigo | extensión pgcrypto + función `generar_codigo()` |
| 0002 | negocios | tabla `negocios` (usa `generar_codigo` por defecto) |
| 0003 | perfiles | tabla `perfiles` (→ negocios, auth.users) |
| 0004 | mi_negocio_id | función `mi_negocio_id()` para RLS (→ perfiles) |
| 0005 | productos | tabla `productos` (→ negocios) |
| 0006 | clientes | tabla `clientes` (→ negocios) |
| 0007 | movimientos | tabla `movimientos` (→ clientes, negocios, perfiles) |
| 0008 | movimiento_detalle | tabla `movimiento_detalle` (→ movimientos, negocios) |
| 0009 | rls_policies | activa RLS + políticas por negocio (→ mi_negocio_id) |
| 0010 | handle_new_user | trigger de alta de usuario (→ negocios, perfiles) |
| 0011 | onboarding_rpcs | RPCs `crear_/unirse_negocio_onboarding` + grants |

## Idempotencia

Cada archivo puede ejecutarse varias veces sin error:

- Tablas: `create table if not exists`
- Funciones: `create or replace function`
- Extensiones: `create extension if not exists`
- Políticas: `drop policy if exists` antes de `create policy`
- Triggers: `drop trigger if exists` antes de `create trigger`
