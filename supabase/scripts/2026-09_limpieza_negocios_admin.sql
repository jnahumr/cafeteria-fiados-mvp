-- Script de limpieza de UNA SOLA VEZ (no es migración: son datos de producción).
-- Borra los negocios de prueba que pertenecen a cuentas administradoras,
-- con todo su contenido, y deja a los admins sin negocio.
-- Las cuentas de login (auth.users) y la tabla admins NO se tocan.
--
-- USO: 1) correr solo el bloque "VISTA PREVIA" y revisar.
--      2) correr el bloque "LIMPIEZA" completo. Es una transacción:
--         si algo falla, no se borra nada.

-- ===================== VISTA PREVIA (solo lectura) =====================
select n.nombre as negocio,
       u.email,
       p.rol,
       exists (select 1 from admins a where a.user_id = p.id) as es_admin
from negocios n
join perfiles p on p.negocio_id = n.id
left join auth.users u on u.id = p.id
where n.id in (select p2.negocio_id from perfiles p2 join admins a on a.user_id = p2.id)
order by n.nombre, es_admin desc;

-- ============================== LIMPIEZA ==============================
begin;

create temp table negocios_a_borrar on commit drop as
  select distinct p.negocio_id as id
  from perfiles p
  join admins a on a.user_id = p.id
  where p.negocio_id is not null;

delete from movimiento_detalle where negocio_id in (select id from negocios_a_borrar);
delete from movimientos        where negocio_id in (select id from negocios_a_borrar);
delete from clientes           where negocio_id in (select id from negocios_a_borrar);
delete from productos          where negocio_id in (select id from negocios_a_borrar);
delete from feedback           where negocio_id in (select id from negocios_a_borrar);
delete from perfiles           where negocio_id in (select id from negocios_a_borrar);
delete from negocios           where id         in (select id from negocios_a_borrar);

commit;
