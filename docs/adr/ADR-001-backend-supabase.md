# ADR-001: Usar Supabase como backend (BaaS) en vez de un servidor propio

- **Estado:** Aceptada
- **Fecha:** 2025 (ajustar a la fecha real de la decisión)
- **Decisores:** desarrollador del producto, en acuerdo con la clienta de la cafetería

## Contexto

Control de Créditos es un MVP real para una cafetería: necesita autenticación de
usuarios (dueña y empleados), una base de datos relacional, aislamiento de datos
entre negocios y algo de lógica sensible del lado del servidor (crear usuarios).
El proyecto lo desarrolla **una sola persona**, sin equipo de operaciones, con
tiempo limitado y con la meta de ponerlo a funcionar pronto y a bajo costo.

Las opciones consideradas fueron:

1. **Construir un backend propio** (por ejemplo Node/Express + una base de datos
   auto-hospedada + un servidor para desplegar), implementando a mano la
   autenticación, la autorización y el manejo de sesiones.
2. **Usar un Backend as a Service (BaaS)** que ya provea base de datos, auth y
   reglas de acceso administradas.

## Decisión

**Usar Supabase (Postgres gestionado, Auth y RLS) como backend en vez de construir un servidor propio.**

Concretamente se usa: Postgres gestionado por Supabase, Supabase Auth (email y
Google OAuth), Row Level Security para el aislamiento por negocio, y Edge
Functions para la lógica sensible (creación de usuarios con `service_role key`
desde el servidor, nunca en el frontend).

## Consecuencias

### Positivas
- Se elimina todo el trabajo de operar servidores: no hay que aprovisionar,
  parchar ni monitorear infraestructura.
- La autenticación (email + Google) viene resuelta y probada, sin escribir un
  sistema de login desde cero.
- El aislamiento entre negocios se declara con RLS en la base, en vez de
  programarse y mantenerse en el código de la aplicación.
- Menor costo inicial (plan gratuito) y despliegue muy rápido, apto para un
  desarrollador solo.

### Negativas / lo que se sacrifica
- **Dependencia de un proveedor (vendor lock-in):** migrar fuera de Supabase más
  adelante implicaría reescribir auth y políticas.
- **Menos control fino** sobre el backend que con un servidor propio.
- Sujeto a los **límites y la disponibilidad** del plan de Supabase.
- Parte de la seguridad (RLS) queda en la base, así que un error de política
  puede tener impacto directo — hay que probar bien las políticas.
