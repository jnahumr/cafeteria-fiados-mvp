# Control de Fiados — Cafetería

PWA para el control de fiados (créditos) de una cafetería familiar en San Pedro Sula, Honduras. Proyecto capstone de Ingeniería de Software I.

## El problema

La dueña de la cafetería lleva los fiados de sus clientes en un cuaderno. Esto causa cobros incompletos, cuentas que no cuadran a fin de quincena y registros que se pierden. Esta app reemplaza ese cuaderno con un registro digital que calcula los saldos automáticamente.

## Funcionalidades del prototipo

- Registrar un fiado seleccionando el cliente, el plato y el monto.
- Crear clientes nuevos sobre la marcha.
- Calcular el saldo de cada cliente automáticamente (suma de fiados menos abonos).
- Ver el detalle de movimientos de cada cliente con fecha y plato.
- Eliminar un movimiento registrado por error.

## Stack tecnológico

- **Frontend:** React + Vite (PWA)
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Despliegue:** Vercel
- **Distribución al cliente:** WhatsApp vía `wa.me`

## Decisión de diseño clave

El saldo de cada cliente **no se guarda** como un número fijo, sino que se calcula sumando su libro de movimientos (fiados menos abonos). Así nunca se descuadra: al agregar o eliminar un movimiento, el saldo siempre queda correcto.

## Cómo ejecutar el proyecto

1. Clonar el repositorio.
2. Instalar dependencias:
npm install
3. Crear un archivo `.env` en la raíz con las credenciales de Supabase (ver `.env.example`):
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_KEY=tu_publishable_key
4. Levantar el servidor de desarrollo:
npm run dev
5. Abrir http://localhost:5173

## Modelo de datos

- **clientes** (id, nombre, telefono, creado_en)
- **movimientos** (id, cliente_id, tipo [fiado/abono], monto, concepto, fecha)

El saldo se deriva de la tabla `movimientos`.

## Estado

Prototipo funcional del módulo de fiados (MVP). El módulo de menú diario queda como siguiente iteración.

## Autor

José Nahún Reyes — Ingeniería de Software I, CEUTEC/UNITEC.