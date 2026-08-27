# Arquitectura — Control de Créditos (Cafetería Fiados)

PWA multi-tenant para gestión de fiados de una cafetería.
**Stack:** React + Vite (frontend) · Supabase (Auth + Postgres con RLS) · desplegado en Vercel.

---

## Sobre este documento

La arquitectura está documentada con el **modelo C4**, que describe un sistema en
cuatro niveles de zoom, del más lejano al más cercano:

| Nivel | Nombre | Qué muestra | Para quién |
|-------|--------|-------------|------------|
| 1 | Contexto | El sistema visto desde afuera y con quién habla | Cualquiera |
| 2 | Contenedores | Las piezas ejecutables grandes (app, auth, BD) | Técnicos |
| 3 | Componentes | El interior de una pieza (la PWA) | Desarrolladores |
| 4 | Código | Cómo se estructura un flujo concreto | Desarrolladores |

> **C4** es el *modelo* (qué mostrar y en qué niveles). **Mermaid** es la *herramienta*
> con la que están dibujados (texto que GitHub convierte en imagen). No son lo mismo:
> un diagrama puede ser "C4 dibujado en Mermaid".

Cada nivel abajo incluye la imagen y, en un bloque plegable, el código Mermaid editable.

> **Nota de confiabilidad:** los niveles **1 y 2** salen de la arquitectura real.
> Los niveles **3 y 4** están **inferidos de las funcionalidades** y deben ajustarse
> a los nombres y la estructura reales del código.

---

## Nivel 1 — Contexto

El sistema completo visto desde afuera: quién lo usa y de qué depende.

![C4 Nivel 1 - Contexto](./c4_1_contexto.png)

<details><summary>Código Mermaid (editable)</summary>

```mermaid
flowchart TB
    duena["Dueña<br/><i>[Persona]</i><br/>Administra su cafetería, empleados y fiados"]
    empleado["Empleado<br/><i>[Persona]</i><br/>Registra fiados de los clientes"]
    sistema["Control de Créditos<br/><i>[Sistema — PWA]</i><br/>Gestión de fiados multi-negocio"]
    supabase["Supabase<br/><i>[Sistema externo — BaaS]</i><br/>Autenticación + Postgres con RLS"]

    duena -->|gestiona fiados| sistema
    empleado -->|registra fiados| sistema
    sistema -->|"lee/escribe datos · autentica (HTTPS)"| supabase
```
</details>

---

## Nivel 2 — Contenedores

Las piezas ejecutables grandes y cómo se comunican.

![C4 Nivel 2 - Contenedores](./c4_2_contenedores.png)

<details><summary>Código Mermaid (editable)</summary>

```mermaid
flowchart TB
    duena["Dueña<br/>rol: dueña"]
    empleado["Empleado<br/>rol: empleado"]

    subgraph vercel[Vercel]
        pwa["PWA — Control de Créditos<br/>[React + Vite]<br/>UI por rol · carrito de fiados"]
    end

    subgraph supabase[Supabase]
        auth["Supabase Auth<br/>login · registro · recuperación"]
        db[("Postgres + RLS<br/>mi_negocio_id()")]
    end

    duena -->|usa| pwa
    empleado -->|usa| pwa
    pwa -->|autentica| auth
    pwa -->|"consultas (supabase-js)"| db
```
</details>

---

## Nivel 3 — Componentes (dentro de la PWA)

Zoom al interior de la PWA: sus módulos internos y el único punto de salida al backend.
**Inferido de las funcionalidades — ajustar a los archivos reales.**

![C4 Nivel 3 - Componentes](./c4_3_componentes.png)

<details><summary>Código Mermaid (editable)</summary>

```mermaid
flowchart TB
    subgraph pwa[PWA — Control de Créditos · React + Vite]
        auth[AuthContext<br/>estado de sesión]
        neg[Contexto de Negocio<br/>resuelve negocio_id]
        inv[Invitación Empleados<br/>códigos de 6 caracteres]
        cli[Módulo Clientes<br/>validación anti-duplicados]
        prod[Módulo Productos]
        carr[Carrito de Fiados]
        mov[Registro de Movimientos<br/>autoría · soft delete]
        sup[Cliente Supabase<br/>lib/supabase.js]
    end

    supaAuth["Supabase Auth"]
    db[("Postgres + RLS")]

    auth --> sup
    neg --> sup
    cli --> sup
    prod --> sup
    inv --> sup
    carr --> mov
    mov --> sup
    sup -->|autentica| supaAuth
    sup -->|SQL| db
```
</details>

---

## Nivel 4 — Código (flujo: registrar un fiado)

El nivel más cercano: cómo podría estructurarse un flujo concreto en clases/funciones
y qué tablas toca. **Ejemplo ilustrativo — este nivel rara vez refleja el código exacto.**

![C4 Nivel 4 - Código](./c4_4_codigo.png)

<details><summary>Código Mermaid (editable)</summary>

```mermaid
classDiagram
    class CarritoFiado {
      +items: Producto[]
      +clienteSeleccionado: Cliente
      +agregarProducto(p)
      +quitarProducto(id)
      +total() number
      +confirmarFiado()
    }
    class registrarFiado {
      +validarClienteNoDuplicado(cliente)
      +crearMovimiento(negocio_id, creado_por)
      +crearDetalle(mov_id, items)
    }
    class movimientos {
      +id
      +negocio_id
      +creado_por
    }
    class movimiento_detalle {
      +id
      +movimiento_id
      +producto_id
    }
    CarritoFiado --> registrarFiado : llama a
    registrarFiado --> movimientos : INSERT
    movimientos "1" --> "N" movimiento_detalle : contiene
```
</details>

---

## Modelo Entidad-Relación (base de datos)

Relaciones entre las tablas principales. **Revisá las columnas contra tu esquema real.**

![Modelo Entidad-Relación](./erd.png)

<details><summary>Código Mermaid (editable)</summary>

```mermaid
erDiagram
    negocios            ||--o{ perfiles            : "tiene"
    negocios            ||--o{ productos           : "ofrece"
    negocios            ||--o{ movimientos         : "registra"
    movimientos         ||--o{ movimiento_detalle : "contiene"
    productos           ||--o{ movimiento_detalle : "aparece en"
    perfiles            ||--o{ movimientos         : "autor de"

    negocios {
        uuid id PK
    }
    perfiles {
        uuid id PK
        uuid negocio_id FK
        text rol "dueña o empleado"
    }
    productos {
        uuid id PK
        uuid negocio_id FK
    }
    movimientos {
        uuid id PK
        uuid negocio_id FK
        uuid creado_por FK
    }
    movimiento_detalle {
        uuid id PK
        uuid movimiento_id FK
        uuid producto_id FK
    }
```
</details>

---

## Notas de seguridad (multi-tenancy)

- El aislamiento entre negocios se hace con **Row Level Security (RLS)** y la función `mi_negocio_id()`.
- La lectura de `perfiles` para movimientos de otros usuarios se resolvió con una función
  `security definer` + política que permite leer perfiles del mismo `negocio_id`.
- La creación de usuarios se hace en una **Edge Function** (`crear-usuario`) que usa la
  `service_role key` desde variables de entorno del servidor — nunca en el frontend.
