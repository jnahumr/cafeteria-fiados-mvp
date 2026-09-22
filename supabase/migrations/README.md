# Migraciones de base de datos

Esquema de la base (Supabase / PostgreSQL) del proyecto, en migraciones
**ordenadas**, **canónicas** e **idempotentes**.

## Orden canónico

Los archivos se numeran (`0001`…`0017`) y deben ejecutarse en ese orden,
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
| 0012 | movimiento_detalle_producto_id | agrega `producto_id` (FK → productos) + índice + backfill |
| 0013 | admin_overview | tabla `admins` + `es_admin()` + `admin_overview()` (panel admin) |
| 0014 | feedback | tabla `feedback` + índice + políticas RLS por negocio |
| 0015 | admin_feedback | función `admin_feedback()`: todo el feedback, solo para admins |
| 0016 | control_acceso_admin | columnas `activo`; `mi_negocio_id()` bloquea deshabilitados; RPCs admin para habilitar/deshabilitar usuarios y negocios |
| 0017 | admin_sin_negocio | el onboarding impide que un admin cree o se una a un negocio |

## Idempotencia

Cada archivo puede ejecutarse varias veces sin error ni efectos duplicados:

- Tablas: `create table if not exists`
- Columnas: `add column if not exists`
- Índices: `create index if not exists`
- Funciones: `create or replace function`
- Extensiones: `create extension if not exists`
- Políticas: `drop policy if exists` antes de `create policy`
- Triggers: `drop trigger if exists` antes de `create trigger`

## Cómo aplicar

En el Dashboard de Supabase → **SQL Editor**, ejecutar los archivos en orden
numérico. Como son idempotentes, volver a ejecutar uno ya aplicado es seguro.

## Convenciones para nuevas migraciones

1. Numerar con el siguiente número libre (`0018_nombre.sql`).
2. Encabezado con: qué crea, de qué depende y por qué es idempotente.
3. Nunca modificar una migración ya aplicada: los cambios van en una nueva.
4. Toda tabla nueva con datos de negocio lleva `negocio_id` y políticas RLS.
5. Agregar la fila correspondiente en la tabla de este README.
## Scripts de datos (fuera de las migraciones)

Los cambios de **datos** de una base concreta (por ejemplo, limpiar negocios de
prueba) no son migraciones: se guardan en `supabase/scripts/` con fecha, se
ejecutan una sola vez y no forman parte del orden canónico.

| Script | Qué hace |
|--------|----------|
| 2026-09_limpieza_negocios_admin | borra los negocios de prueba de las cuentas admin y deja a los admins sin negocio |
