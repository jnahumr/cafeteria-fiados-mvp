import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { calcularSaldoCliente, buscarClienteExistente } from './lib/creditos'
import { sinAcentos } from './lib/texto'
import { formatFecha, formatFechaCorta } from './lib/fecha'
import { obtenerProductos, crearProducto, eliminarProductoPorId, obtenerClientes, obtenerMovimientos, crearCliente, actualizarCliente, crearMovimientoFiado, crearDetalleMovimiento, crearAbono, marcarMovimientoEliminado, crearNegocioOnboarding, unirseNegocioOnboarding } from './lib/api'



// Devuelve solo los movimientos posteriores a la última vez que la cuenta
// quedó en cero (el último abono que saldó todo). Sin ese abono ni lo anterior.
// Es lo que se envía por WhatsApp: la deuda vigente y su detalle, no el historial.
function movimientosDesdeUltimoCero(movimientos) {
  const orden = [...(movimientos || [])].sort(
    (a, b) => new Date(a.fecha) - new Date(b.fecha)
  )
  let saldo = 0
  let corte = -1 // índice tras el cual la cuenta quedó en cero (o negativa)
  orden.forEach((m, i) => {
    saldo += m.tipo === 'abono' ? -Number(m.monto) : Number(m.monto)
    if (saldo <= 0.005) corte = i
  })
  return orden.slice(corte + 1)
}

// Arma el mensaje de cobro con el detalle de consumos, fechas y el total.
// Incluye los abonos (con signo) para que la suma cuadre con el saldo real.
function mensajeCobro(cliente, nombreNegocio) {
  const negocio = nombreNegocio || 'nuestro negocio'

  const movs = movimientosDesdeUltimoCero(cliente.movimientos)

  const lineas = movs.map((m) => {
    const fecha = formatFechaCorta(m.fecha)
    const monto = Number(m.monto).toFixed(2)
    if (m.tipo === 'abono') {
      return `${fecha} — Abono: -L ${monto}`
    }
    let desc
    if (m.movimiento_detalle && m.movimiento_detalle.length > 0) {
      desc = m.movimiento_detalle
        .map((d) => `${d.cantidad}x ${d.producto_nombre}`)
        .join(', ')
    } else {
      desc = m.concepto || 'Consumo'
    }
    return `${fecha} — ${desc}: L ${monto}`
  })

  const detalle = lineas.length > 0 ? '\n' + lineas.join('\n') + '\n' : '\n'

  return (
    `Buen día ${cliente.nombre}, le saludamos de ${negocio}, para recordarle que ` +
    `tiene un saldo pendiente con nosotros. El detalle es el siguiente:\n` +
    detalle +
    `\n*Total pendiente: L ${cliente.saldo.toFixed(2)}*\n\n` +
    `Por favor ponerse al día con su pago.\n` +
    `Gracias por su preferencia.`
  )
}

// Normaliza un teléfono para el enlace de WhatsApp (formato internacional
// sin símbolos). Honduras: si vienen 8 dígitos, se antepone el código 504.
function normalizarTelHN(tel) {
  const digitos = (tel || '').replace(/\D/g, '')
  if (digitos === '') return ''
  if (digitos.startsWith('504')) return digitos
  if (digitos.length === 8) return '504' + digitos
  return digitos
}

// Iniciales para el avatar de cada cliente (1 o 2 letras).
function inicialesDe(nombre) {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}

// Secciones del menú (barra lateral en PC, barra inferior en celular).
const NAV = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'clientes', label: 'Clientes', icon: 'users' },
  { id: 'productos', label: 'Productos', icon: 'tag' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
]

// Íconos SVG en línea (trazo con color heredado).
function Icono({ name }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  switch (name) {
    case 'home': return (<svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /></svg>)
    case 'users': return (<svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.6a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" /></svg>)
    case 'tag': return (<svg {...p}><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" /></svg>)
    case 'settings': return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>)
    case 'notebook': return (<svg {...p}><rect x="6" y="3" width="14" height="18" rx="2" /><path d="M6 8H3M6 12H3M6 16H3" /></svg>)
    case 'chevron': return (<svg {...p}><path d="M9 6l6 6-6 6" /></svg>)
    case 'back': return (<svg {...p}><path d="M15 6l-6 6 6 6" /></svg>)
    case 'edit': return (<svg {...p}><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>)
    case 'search': return (<svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>)
    case 'whatsapp': return (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.941-5.359 11.944-11.893a11.821 11.821 0 00-3.487-8.436z" /></svg>)
    default: return null
  }
}

function App() {
  // --- Estado de sesión y negocio ---
  const [session, setSession] = useState(null)
  const [negocioId, setNegocioId] = useState(null)
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [codigoInvitacion, setCodigoInvitacion] = useState('')
  const [rol, setRol] = useState('')
  const [cargando, setCargando] = useState(true)
  const [sinPerfil, setSinPerfil] = useState(false) // logueado pero sin negocio (ej. entró con Google)
  const [refrescar, setRefrescar] = useState(0) // para recargar el negocio tras el onboarding

  const [modoRecuperacion, setModoRecuperacion] = useState(false)

  // --- Estado del módulo de créditos ---
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [eliminados, setEliminados] = useState([]) // movimientos borrados (auditoría)
  const [clienteSel, setClienteSel] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [telNuevo, setTelNuevo] = useState('')
  const [mensaje, setMensaje] = useState('')

  // --- Estado del carrito ---
  const [carrito, setCarrito] = useState([])
  const [productoSel, setProductoSel] = useState('')
  const [productoOtro, setProductoOtro] = useState('')
  const [precioOtro, setPrecioOtro] = useState('')

  // --- Navegación entre secciones ---
  const [vista, setVista] = useState('inicio') // inicio | clientes | productos | ajustes
  const [clienteAbierto, setClienteAbierto] = useState(null) // id del cliente en detalle
  const [filtroCli, setFiltroCli] = useState('todos') // todos | deuda | aldia
  const [busquedaCli, setBusquedaCli] = useState('')
  const [busquedaInicio, setBusquedaInicio] = useState('') // buscador de "Clientes que deben" en Inicio

  // --- Estado para gestionar el catálogo de productos ---
  const [nuevoProdNombre, setNuevoProdNombre] = useState('')
  const [nuevoProdPrecio, setNuevoProdPrecio] = useState('')

  // --- Listado de clientes ---

  // === 1. Al iniciar: revisar sesión y escuchar cambios ===
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSession(nuevaSesion)
      if (evento === 'PASSWORD_RECOVERY') {
        setModoRecuperacion(true)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // === 2. Cuando hay sesión: cargar negocio, rol y código ===
  useEffect(() => {
    if (!session) {
      setNegocioId(null)
      setNombreNegocio('')
      setCodigoInvitacion('')
      setRol('')
      setSinPerfil(false)
      return
    }
    async function cargarNegocio() {
      const { data, error } = await supabase
        .from('perfiles')
        .select('negocio_id, rol, negocios(nombre, codigo_invitacion)')
        .eq('id', session.user.id)
        .maybeSingle()

      if (error) {
        setMensaje('Error al cargar tu negocio: ' + error.message)
        return
      }
      if (!data) {
        // Logueado pero sin perfil: pasó por un login que no crea negocio
        // (ej. Google la primera vez). Le mostramos el onboarding.
        setSinPerfil(true)
        return
      }
      setSinPerfil(false)
      setNegocioId(data.negocio_id)
      setRol(data.rol || '')
      setNombreNegocio(data.negocios?.nombre || '')
      setCodigoInvitacion(data.negocios?.codigo_invitacion || '')
    }
    cargarNegocio()
  }, [session, refrescar])

  // === 3. Cuando ya sabemos el negocio: cargar clientes y productos ===
  useEffect(() => {
    if (negocioId) {
      cargarClientes()
      cargarProductos()
    }
    
  }, [negocioId])

  async function cargarClientes() {
    const { data: listaClientes, error: errC } = await obtenerClientes()

    if (errC) {
      setMensaje('Error al cargar clientes: ' + errC.message)
      return
    }

    // Traemos TODOS los movimientos (con autor, detalle, y quién eliminó)
      const { data: movimientos, error: errM } = await obtenerMovimientos()

    if (errM) {
      setMensaje('Error al cargar movimientos: ' + errM.message)
      return
    }

    // Solo los ACTIVOS (sin fecha de eliminación) cuentan para saldo y listado
    const activos = movimientos.filter((m) => !m.eliminado_en)

    const clientesConSaldo = listaClientes.map((cliente) => {
      const susMovimientos = activos.filter((m) => m.cliente_id === cliente.id)
       const saldo = calcularSaldoCliente(susMovimientos)
      return { ...cliente, saldo, movimientos: susMovimientos }
    })

    setClientes(clientesConSaldo)

    // Los eliminados quedan aparte para la sección de auditoría
    const borrados = movimientos.filter((m) => m.eliminado_en)
    // Añadimos el nombre del cliente a cada eliminado, para mostrarlo
    const borradosConCliente = borrados.map((m) => {
      const cli = listaClientes.find((c) => c.id === m.cliente_id)
      return { ...m, nombreCliente: cli ? cli.nombre : '(cliente desconocido)' }
    })
    setEliminados(borradosConCliente)
  }

  async function cargarProductos() {
    const { data, error } = await obtenerProductos()

    if (error) {
      setMensaje('Error al cargar productos: ' + error.message)
      return
    }
    setProductos(data)
  }

  // --- CARRITO ---
  function agregarAlCarrito() {
    setMensaje('')
    let nombre, precio

    if (productoSel === 'otro') {
      nombre = productoOtro.trim()
      precio = Number(precioOtro) || 0
      if (nombre === '') {
        setMensaje('Escribe el nombre del producto (opción Otro).')
        return
      }
    } else if (productoSel === '') {
      setMensaje('Selecciona un producto para agregar.')
      return
    } else {
      const p = productos.find((x) => x.id === productoSel)
      if (!p) {
        setMensaje('Producto no encontrado.')
        return
      }
      nombre = p.nombre
      precio = Number(p.precio) || 0
    }

    setCarrito((actual) => {
      const idx = actual.findIndex(
        (l) => l.nombre.toLowerCase() === nombre.toLowerCase() && l.precio === precio
      )
      if (idx >= 0) {
        const copia = [...actual]
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + 1 }
        return copia
      }
      return [...actual, { nombre, precio, cantidad: 1 }]
    })

    setProductoSel('')
    setProductoOtro('')
    setPrecioOtro('')
  }

  function cambiarCantidad(indice, delta) {
    setCarrito((actual) => {
      const copia = [...actual]
      const nuevaCant = copia[indice].cantidad + delta
      if (nuevaCant <= 0) {
        copia.splice(indice, 1)
      } else {
        copia[indice] = { ...copia[indice], cantidad: nuevaCant }
      }
      return copia
    })
  }

  function quitarDelCarrito(indice) {
    setCarrito((actual) => actual.filter((_, i) => i !== indice))
  }

  const totalCarrito = carrito.reduce((s, l) => s + l.precio * l.cantidad, 0)

  // Total de todo lo que está pendiente de cobro (suma de saldos positivos)
  const totalPendiente = clientes.reduce((suma, c) => {
    return suma + (c.saldo > 0 ? c.saldo : 0)
  }, 0)

  // Solo los que deben algo. Se deriva una vez y se reutiliza en todo el render.
  const clientesConDeuda = clientes.filter((c) => c.saldo > 0)

  // Vista "Clientes": todos los clientes, con filtro (todos/deuda/al día) y búsqueda.
  const nAlDia = clientes.length - clientesConDeuda.length
  const cliBusq = sinAcentos(busquedaCli.trim())
  let clientesVista = clientes
  if (filtroCli === 'deuda') clientesVista = clientes.filter((c) => c.saldo > 0)
  else if (filtroCli === 'aldia') clientesVista = clientes.filter((c) => c.saldo <= 0)
  if (cliBusq !== '') clientesVista = clientesVista.filter((c) => sinAcentos(c.nombre).includes(cliBusq))
  clientesVista = [...clientesVista].sort((a, b) => a.nombre.localeCompare(b.nombre))
  const clienteDetalle = clienteAbierto ? clientes.find((c) => c.id === clienteAbierto) : null

  // Vista "Inicio": deudores filtrados por el buscador de esa pantalla.
  const termInicio = sinAcentos(busquedaInicio.trim())
  const deudoresFiltrados = termInicio === ''
    ? clientesConDeuda
    : clientesConDeuda.filter((c) => sinAcentos(c.nombre).includes(termInicio))

  // Abre WhatsApp con un recordatorio de cobro ya escrito. Si el cliente tiene
  // teléfono, abre el chat directo con él; si no, abre WhatsApp para que la
  // dueña elija el contacto.
  function cobrarPorWhatsapp(cliente) {
    const texto = mensajeCobro(cliente, nombreNegocio)
    const numero = normalizarTelHN(cliente.telefono)
    const url = numero
      ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank')
  }

  // Guarda los cambios de nombre/teléfono de un cliente (desde su detalle).
  async function guardarCliente(clienteId, nombre, telefono) {
    const { error } = await actualizarCliente({
      clienteId,
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
    })
    if (error) {
      window.alert('No se pudo guardar: ' + error.message)
      return false
    }
    await cargarClientes()
    return true
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(codigoInvitacion)
    setMensaje('Código copiado: ' + codigoInvitacion)
  }

  async function agregarProducto() {
    setMensaje('')
    if (nuevoProdNombre.trim() === '') {
      setMensaje('Escribe el nombre del producto.')
      return
    }
    const precioNum = Number(nuevoProdPrecio) || 0
    if (precioNum < 0) {
      setMensaje('El precio no puede ser negativo.')
      return
    }

    const { error } = await crearProducto({
      nombre: nuevoProdNombre.trim(),
      precio: precioNum,
      negocioId,
    })


    if (error) {
      setMensaje('Error al agregar producto: ' + error.message)
      return
    }

    setMensaje('Producto agregado.')
    setNuevoProdNombre('')
    setNuevoProdPrecio('')
    cargarProductos()
  }

  async function eliminarProducto(idProducto) {
    const confirmar = window.confirm('¿Eliminar este producto del catálogo?')
    if (!confirmar) return

    const { error } = await eliminarProductoPorId(idProducto)

    if (error) {
      setMensaje('Error al eliminar producto: ' + error.message)
      return
    }
    cargarProductos()
  }

  async function registrarFiado() {
    setMensaje('')

    if (carrito.length === 0) {
      setMensaje('Agrega al menos un producto al carrito.')
      return
    }

    let clienteId

    if (clienteSel === 'nuevo') {
      const nombreLimpio = nombreNuevo.trim()
      if (nombreLimpio === '') {
        setMensaje('Escribe el nombre del cliente nuevo.')
        return
      }
           const yaExiste = buscarClienteExistente(clientes, nombreLimpio)
      if (yaExiste) {
        clienteId = yaExiste.id
      } else {
        const { data: nuevo, error: errNuevo } = await crearCliente({
          nombre: nombreLimpio,
          telefono: telNuevo.trim() || null,
          negocioId,
        })

        if (errNuevo) {
          if (errNuevo.code === '23505') {
            setMensaje('Ya existe un cliente con ese nombre. Selecciónalo de la lista.')
          } else {
            setMensaje('Error al crear cliente: ' + errNuevo.message)
          }
          return
        }
        clienteId = nuevo.id
      }
    } else if (clienteSel === '') {
      setMensaje('Selecciona un cliente o agrega uno nuevo.')
      return
    } else {
      clienteId = Number(clienteSel)
    }

    const conceptoResumen = carrito
      .map((l) => `${l.cantidad}x ${l.nombre}`)
      .join(', ')

    const { data: mov, error: errMov } = await crearMovimientoFiado({
      clienteId,
      monto: totalCarrito,
      concepto: conceptoResumen,
      negocioId,
    })

    if (errMov) {
      setMensaje('Error al registrar el fiado: ' + errMov.message)
      return
    }

    const lineas = carrito.map((l) => ({
      movimiento_id: mov.id,
      negocio_id: negocioId,
      producto_nombre: l.nombre,
      cantidad: l.cantidad,
      precio_unitario: l.precio,
    }))

    const { error: errDet } = await crearDetalleMovimiento(lineas)

    if (errDet) {
      setMensaje('El fiado se guardó, pero hubo un error con el detalle: ' + errDet.message)
      return
    }

    setMensaje('Fiado registrado correctamente.')
    setCarrito([])
    setNombreNuevo('')
    setTelNuevo('')
    setClienteSel('')
    setProductoSel('')
    setProductoOtro('')
    setPrecioOtro('')
    cargarClientes()
  }

  async function registrarAbono(cliente) {
    setMensaje('')
    const entrada = window.prompt(
      `¿Cuánto abona ${cliente.nombre}? (L)\nDebe: L ${cliente.saldo.toFixed(2)}`
    )
    if (entrada === null) return

    const montoAbono = Number(entrada)
    if (!montoAbono || montoAbono <= 0) {
      setMensaje('El monto del abono debe ser un número mayor que cero.')
      return
    }

    const { error } = await crearAbono({
      clienteId: cliente.id,
      monto: montoAbono,
      negocioId,
    })

    if (error) {
      setMensaje('Error al registrar el abono: ' + error.message)
      return
    }

    setMensaje(`Abono de L ${montoAbono.toFixed(2)} registrado para ${cliente.nombre}.`)
    cargarClientes()
  }

  // Borrado lógico (soft delete): marca el movimiento en vez de eliminarlo
  async function eliminarMovimiento(idMovimiento) {
    const confirmar = window.confirm('¿Seguro que deseas eliminar este movimiento?')
    if (!confirmar) return

    // En vez de DELETE, hacemos UPDATE guardando quién y cuándo
    const { error } = await marcarMovimientoEliminado({
      idMovimiento,
      eliminadoPor: session.user.id,
    })

    if (error) {
      setMensaje('Error al eliminar: ' + error.message)
      return
    }

    setMensaje('Movimiento eliminado.')
    cargarClientes()
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    setClientes([])
    setProductos([])
    setEliminados([])
    setCarrito([])
    setMensaje('')
  }



  if (cargando) {
    return (
      <div className="screen" style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
        Cargando…
      </div>
    )
  }

  if (modoRecuperacion) {
    return <NuevaPassword onListo={() => setModoRecuperacion(false)} />
  }

  if (!session) {
    return <Auth />
  }

  if (sinPerfil) {
    return (
      <Onboarding
        nombreSugerido={session.user.user_metadata?.full_name || session.user.user_metadata?.name || ''}
        onListo={() => { setSinPerfil(false); setRefrescar((n) => n + 1) }}
      />
    )
  }

  return (
    <div className="shell">
      {/* Menú lateral (PC) */}
      <aside className="side">
        <div className="side-brand">
          <div className="side-mark"><Icono name="notebook" /></div>
          <span className="side-name">Control de<br />Créditos</span>
        </div>
        <nav className="side-nav">
          {NAV.map((it) => (
            <button
              key={it.id}
              className={`nav-i ${vista === it.id ? 'on' : ''}`}
              onClick={() => { setVista(it.id); setClienteAbierto(null) }}
            >
              <Icono name={it.icon} /> {it.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {nombreNegocio && <div className="side-negocio">{nombreNegocio}</div>}
          <button className="btn-quiet btn-muted" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="main">
        <header className="mobile-top">
          <div className="mobile-brand">
            <div className="mobile-mark"><Icono name="notebook" /></div>
            <span>Control de Créditos</span>
          </div>
          <button className="mobile-logout" onClick={cerrarSesion}>Cerrar sesión</button>
        </header>
        <div className="content">

          {/* ---------- INICIO ---------- */}
          {vista === 'inicio' && (
            <>
              <div className="view-head">
                <div className="view-eyebrow">Tu negocio</div>
                <h1 className="view-title">
                  {nombreNegocio || 'Control de Créditos'}
                  {rol === 'empleado' && <span className="topbar-role"> · empleado</span>}
                </h1>
              </div>

              {clientesConDeuda.length > 0 ? (
                <div className="hero hero-amber">
                  <div className="hero-label">Total por cobrar</div>
                  <div className="hero-amount">L {totalPendiente.toFixed(2)}</div>
                  <div className="hero-sub">
                    {clientesConDeuda.length} {clientesConDeuda.length === 1 ? 'cliente con saldo' : 'clientes con saldo'}
                  </div>
                </div>
              ) : (
                <div className="hero hero-clear">
                  <span className="ico">✓</span>
                  <span className="hero-clear-text">Todo al día · nadie debe</span>
                </div>
              )}

              <div className="inicio-grid">
                <div className="card">
                  <div className="card-title">Registrar fiado</div>

                  <label className="field-label">Cliente</label>
                  <select className="select" value={clienteSel} onChange={(e) => setClienteSel(e.target.value)} style={{ marginBottom: '0.9rem' }}>
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                    <option value="nuevo">+ Agregar cliente nuevo</option>
                  </select>

                  {clienteSel === 'nuevo' && (
                    <>
                      <input className="input" type="text" placeholder="Nombre del cliente nuevo" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} style={{ marginBottom: '0.6rem' }} />
                      <input className="input" type="tel" placeholder="Teléfono (opcional, para WhatsApp)" value={telNuevo} onChange={(e) => setTelNuevo(e.target.value)} style={{ marginBottom: '0.9rem' }} />
                    </>
                  )}

                  <label className="field-label">Agregar producto</label>
                  <div className="prod-row">
                    <select className="select" value={productoSel} onChange={(e) => setProductoSel(e.target.value)}>
                      <option value="">Selecciona un producto</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}{Number(p.precio) > 0 ? ` (L ${Number(p.precio).toFixed(2)})` : ''}
                        </option>
                      ))}
                      <option value="otro">Otro…</option>
                    </select>
                    <button className="btn" onClick={agregarAlCarrito}>Agregar</button>
                  </div>

                  {productoSel === 'otro' && (
                    <div className="prod-row">
                      <input className="input" type="text" placeholder="Nombre del producto" value={productoOtro} onChange={(e) => setProductoOtro(e.target.value)} />
                      <input className="input precio" type="number" placeholder="Precio (L)" value={precioOtro} onChange={(e) => setPrecioOtro(e.target.value)} />
                    </div>
                  )}

                  {carrito.length > 0 && (
                    <div className="cart">
                      <div className="cart-title">Productos de este fiado</div>
                      <ul className="cart-list">
                        {carrito.map((l, i) => (
                          <li key={i} className="cart-line">
                            <span className="name">{l.nombre} — L {l.precio.toFixed(2)}</span>
                            <button className="qty" onClick={() => cambiarCantidad(i, -1)}>−</button>
                            <span className="qty-n">{l.cantidad}</span>
                            <button className="qty" onClick={() => cambiarCantidad(i, +1)}>+</button>
                            <span className="cart-sub">L {(l.precio * l.cantidad).toFixed(2)}</span>
                            <button className="icon-del" onClick={() => quitarDelCarrito(i)} title="Quitar">🗑</button>
                          </li>
                        ))}
                      </ul>
                      <div className="cart-total">Total: L {totalCarrito.toFixed(2)}</div>
                    </div>
                  )}

                  <button className="btn btn-primary btn-block btn-lg" onClick={registrarFiado} style={{ marginTop: '1rem' }}>Guardar fiado</button>
                  {mensaje && <p className="msg msg-ok">{mensaje}</p>}
                </div>

                <div>
                  <div className="section-title" style={{ marginTop: 0 }}>Clientes que deben</div>

                  {clientesConDeuda.length === 0 && (
                    <p className="empty">Ningún cliente tiene saldo pendiente. 🎉</p>
                  )}

                  {clientesConDeuda.length > 0 && (
                    <div className="search">
                      <span className="ico"><Icono name="search" /></span>
                      <input
                        className="input"
                        type="search"
                        placeholder="Buscar cliente por nombre…"
                        value={busquedaInicio}
                        onChange={(e) => setBusquedaInicio(e.target.value)}
                      />
                    </div>
                  )}

                  {clientesConDeuda.length > 0 && deudoresFiltrados.length === 0 && (
                    <p className="empty">Ningún cliente con saldo coincide con «{busquedaInicio}».</p>
                  )}

                  {deudoresFiltrados.map((c) => (
                    <div key={c.id} className="client-row">
                      <div className="client-head">
                        <div className="avatar">{inicialesDe(c.nombre)}</div>
                        <div className="client-info">
                          <div className="client-name">{c.nombre}</div>
                          <div className="client-owes">debe <b>L {c.saldo.toFixed(2)}</b></div>
                        </div>
                        <div className="client-actions">
                          <button className="btn btn-sm btn-abonar" onClick={() => registrarAbono(c)} title="Registrar un pago">Abonar</button>
                          <button className="btn btn-sm btn-wa" onClick={() => cobrarPorWhatsapp(c)} title="Cobrar por WhatsApp" aria-label={`Cobrar a ${c.nombre} por WhatsApp`}>
                            <Icono name="whatsapp" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ---------- CLIENTES ---------- */}
          {vista === 'clientes' && (
            clienteDetalle ? (
              <ClienteDetalle
                cliente={clienteDetalle}
                onVolver={() => setClienteAbierto(null)}
                onWhatsapp={cobrarPorWhatsapp}
                onAbonar={registrarAbono}
                onGuardar={guardarCliente}
                onEliminarMov={eliminarMovimiento}
              />
            ) : (
              <>
                <div className="view-head"><h1 className="view-title">Clientes</h1></div>

                <div className="search">
                  <span className="ico"><Icono name="search" /></span>
                  <input className="input" type="search" placeholder="Buscar cliente…" value={busquedaCli} onChange={(e) => setBusquedaCli(e.target.value)} />
                </div>

                <div className="chips">
                  <button className={`chip ${filtroCli === 'todos' ? 'on' : ''}`} onClick={() => setFiltroCli('todos')}>Todos {clientes.length}</button>
                  <button className={`chip ${filtroCli === 'deuda' ? 'on' : ''}`} onClick={() => setFiltroCli('deuda')}>Con deuda {clientesConDeuda.length}</button>
                  <button className={`chip ${filtroCli === 'aldia' ? 'on' : ''}`} onClick={() => setFiltroCli('aldia')}>Al día {nAlDia}</button>
                </div>

                {clientesVista.length === 0 && (
                  <p className="empty">No hay clientes que coincidan.</p>
                )}

                {clientesVista.map((c) => (
                  <button key={c.id} className="client-card" onClick={() => setClienteAbierto(c.id)}>
                    <div className={`avatar ${c.saldo > 0 ? 'avatar-debe' : ''}`}>{inicialesDe(c.nombre)}</div>
                    <div className="client-info">
                      <div className="client-name">{c.nombre}</div>
                      {c.saldo > 0
                        ? <div className="client-owes">debe <b>L {c.saldo.toFixed(2)}</b></div>
                        : <div className="client-aldia">al día</div>}
                    </div>
                    <span className="chev"><Icono name="chevron" /></span>
                  </button>
                ))}
              </>
            )
          )}

          {/* ---------- PRODUCTOS ---------- */}
          {vista === 'productos' && (
            <>
              <div className="view-head"><h1 className="view-title">Productos</h1></div>
              <div className="card">
                <div className="prod-row">
                  <input className="input" type="text" placeholder="Nombre del producto" value={nuevoProdNombre} onChange={(e) => setNuevoProdNombre(e.target.value)} />
                  <input className="input precio" type="number" placeholder="Precio (L)" value={nuevoProdPrecio} onChange={(e) => setNuevoProdPrecio(e.target.value)} />
                  <button className="btn btn-primary" onClick={agregarProducto}>Agregar</button>
                </div>
                {productos.length === 0 && (
                  <p className="help">Aún no tienes productos. Agrega los que vendes para que aparezcan al registrar un fiado.</p>
                )}
                <ul className="prod-list">
                  {productos.map((p) => (
                    <li key={p.id}>
                      <span>{p.nombre} — L {Number(p.precio).toFixed(2)}</span>
                      <button className="icon-del" onClick={() => eliminarProducto(p.id)} title="Eliminar producto">🗑</button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ---------- AJUSTES ---------- */}
          {vista === 'ajustes' && (
            <>
              <div className="view-head"><h1 className="view-title">Ajustes</h1></div>

              {rol === 'duena' && codigoInvitacion && (
                <div className="card">
                  <div className="card-title">Invitar empleados</div>
                  <p className="help" style={{ marginBottom: '0.7rem' }}>Comparte este código con tus empleados para que se unan a tu negocio.</p>
                  <div className="invite-box">
                    <span className="invite-code">{codigoInvitacion}</span>
                    <button className="btn btn-sm btn-primary" onClick={copiarCodigo}>Copiar</button>
                  </div>
                </div>
              )}

              {rol === 'duena' && (
                <div className="card">
                  <div className="card-title">Movimientos eliminados</div>
                  {eliminados.length === 0 && <p className="help">No se ha eliminado ningún movimiento.</p>}
                  <ul className="audit-list">
                    {eliminados.map((m) => (
                      <li key={m.id}>
                        <strong>{m.nombreCliente}</strong> — {m.tipo === 'fiado' ? 'Fiado' : 'Abono'}: L {Number(m.monto).toFixed(2)}
                        {m.concepto ? ` (${m.concepto})` : ''}
                        <br />
                        <span className="audit-when">
                          Eliminado el {formatFecha(m.eliminado_en)}
                          {m.eliminador?.nombre ? ` por ${m.eliminador.nombre}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button className="btn btn-block btn-lg" onClick={cerrarSesion}>Cerrar sesión</button>
            </>
          )}

        </div>
      </main>

      {/* Barra inferior (celular) */}
      <nav className="bottomnav">
        {NAV.map((it) => (
          <button
            key={it.id}
            className={`bn ${vista === it.id ? 'on' : ''}`}
            onClick={() => { setVista(it.id); setClienteAbierto(null) }}
          >
            <Icono name={it.icon} />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// =======================================================================
// Componente de autenticación
// =======================================================================
function Auth() {
  const [modo, setModo] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)

  async function iniciarSesion() {
    setError(''); setAviso('')
    setProcesando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('No se pudo iniciar sesión: ' + error.message)
    setProcesando(false)
  }

  async function entrarConGoogle() {
    setError(''); setAviso('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Obliga a Google a preguntar SIEMPRE qué cuenta usar, en vez de
        // entrar solo con la sesión activa. Clave en compus compartidas.
        queryParams: { prompt: 'select_account' },
      },
    })
    // Si sale bien, el navegador se va a Google; solo mostramos error si falla.
    if (error) setError('No se pudo entrar con Google: ' + error.message)
  }

  async function crearNegocio() {
    setError(''); setAviso('')
    if (nombreNegocio.trim() === '') {
      setError('Escribe el nombre de tu negocio.')
      return
    }
    setProcesando(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre: nombre.trim(), nombre_negocio: nombreNegocio.trim() } },
    })
    if (error) setError('No se pudo registrar: ' + error.message)
    setProcesando(false)
  }

  async function unirseConCodigo() {
    setError(''); setAviso('')
    if (codigo.trim() === '') {
      setError('Escribe el código de invitación que te dieron.')
      return
    }
    setProcesando(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre: nombre.trim(), codigo_invitacion: codigo.trim().toUpperCase() } },
    })
    if (error) setError('No se pudo unir: verifica el código. (' + error.message + ')')
    setProcesando(false)
  }

  async function enviarRecuperacion() {
    setError(''); setAviso('')
    if (email.trim() === '') {
      setError('Escribe tu correo para enviarte el enlace.')
      return
    }
    setProcesando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    if (error) {
      setError('No se pudo enviar el correo: ' + error.message)
    } else {
      setAviso('Te enviamos un correo con el enlace para restablecer tu contraseña. Revisa tu bandeja (y el spam).')
    }
    setProcesando(false)
  }

  function accionPrincipal() {
    if (modo === 'login') return iniciarSesion()
    if (modo === 'crear') return crearNegocio()
    if (modo === 'unir') return unirseConCodigo()
    return enviarRecuperacion()
  }

  const titulo =
    modo === 'login' ? 'Iniciar sesión'
      : modo === 'crear' ? 'Registrar mi negocio'
        : modo === 'unir' ? 'Unirme a un negocio'
          : 'Recuperar contraseña'

  const textoBoton =
    procesando ? 'Procesando...'
      : modo === 'login' ? 'Entrar'
        : modo === 'crear' ? 'Crear cuenta'
          : modo === 'unir' ? 'Unirme'
            : 'Enviar enlace'

  return (
    <div className="screen">
      <div className="brand">
        <div className="brand-mark">📓</div>
        <div className="brand-name">Control de Créditos</div>
      </div>
      <div className="card">
        <div className="card-title">{titulo}</div>

        {(modo === 'crear' || modo === 'unir') && (
          <div className="field">
            <label className="field-label">Tu nombre</label>
            <input
              className="input"
              type="text"
              placeholder="Carlos Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
        )}

        {modo === 'crear' && (
          <div className="field">
            <label className="field-label">Nombre del negocio</label>
            <input
              className="input"
              type="text"
              placeholder="Cafetería La Esquina"
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
            />
          </div>
        )}

        {modo === 'unir' && (
          <div className="field">
            <label className="field-label">Código de invitación</label>
            <input
              className="input upper"
              type="text"
              placeholder="A3F9K2"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label className="field-label">Correo</label>
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {modo !== 'recuperar' && (
          <div className="field">
            <label className="field-label">Contraseña</label>
            <input
              className="input"
              type="password"
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {modo === 'login' && (
              <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                <button className="btn-quiet btn-muted" onClick={() => { setModo('recuperar'); setError(''); setAviso('') }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
          </div>
        )}

        {modo === 'recuperar' && (
          <p className="help">Te enviaremos un enlace a tu correo para crear una contraseña nueva.</p>
        )}

        <button className="btn btn-primary btn-block btn-lg" onClick={accionPrincipal} disabled={procesando} style={{ marginTop: '0.4rem' }}>
          {textoBoton}
        </button>

        {modo !== 'recuperar' && (
          <>
            <div className="divider">o</div>
            <button className="btn btn-google btn-block" onClick={entrarConGoogle} disabled={procesando}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuar con Google
            </button>
          </>
        )}

        {error && <p className="msg msg-error">{error}</p>}
        {aviso && <p className="msg msg-ok">{aviso}</p>}

        <div className="switch-links">
          {modo !== 'login' && (
            <div>¿Ya tienes cuenta? <button className="btn-quiet" onClick={() => { setModo('login'); setError(''); setAviso('') }}>Inicia sesión</button></div>
          )}
          {modo !== 'crear' && modo !== 'recuperar' && (
            <div>¿Vas a abrir un negocio? <button className="btn-quiet" onClick={() => { setModo('crear'); setError(''); setAviso('') }}>Regístralo</button></div>
          )}
          {modo !== 'unir' && modo !== 'recuperar' && (
            <div>¿Te invitaron a un negocio? <button className="btn-quiet" onClick={() => { setModo('unir'); setError(''); setAviso('') }}>Unirme con código</button></div>
          )}
        </div>
      </div>
    </div>
  )
}

// =======================================================================
// Onboarding: para usuarios ya logueados que aún no tienen negocio
// (típicamente entraron con Google la primera vez). Eligen crear un
// negocio nuevo o unirse a uno existente con un código.
// =======================================================================
function Onboarding({ nombreSugerido, onListo }) {
  const [modo, setModo] = useState('elegir') // 'elegir' | 'crear' | 'unir'
  const [nombre, setNombre] = useState(nombreSugerido || '')
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)

  async function crear() {
    setError('')
    if (nombreNegocio.trim() === '') {
      setError('Escribe el nombre de tu negocio.')
      return
    }
    setProcesando(true)
    const { error } = await crearNegocioOnboarding({
      nombreNegocio: nombreNegocio.trim(),
      nombreUsuario: nombre.trim(),
    })
    if (error) {
      setError('No se pudo crear el negocio: ' + error.message)
      setProcesando(false)
      return
    }
    onListo()
  }

  async function unir() {
    setError('')
    if (codigo.trim() === '') {
      setError('Escribe el código de invitación que te dieron.')
      return
    }
    setProcesando(true)
    const { error } = await unirseNegocioOnboarding({
      codigo: codigo.trim().toUpperCase(),
      nombreUsuario: nombre.trim(),
    })
    if (error) {
      setError('No se pudo unir: verifica el código. (' + error.message + ')')
      setProcesando(false)
      return
    }
    onListo()
  }

  async function salir() {
    await supabase.auth.signOut()
  }

  return (
    <div className="screen">
      <div className="brand">
        <div className="brand-mark">📓</div>
        <div className="brand-name">Control de Créditos</div>
      </div>
      <div className="card">
        <div className="card-title">¡Bienvenido/a!</div>
        <p className="help" style={{ marginBottom: '1rem' }}>Para terminar, cuéntanos cómo vas a usar la app.</p>

        {modo === 'elegir' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => { setModo('crear'); setError('') }}>
              Abrir un negocio nuevo
            </button>
            <button className="btn btn-block btn-lg" onClick={() => { setModo('unir'); setError('') }}>
              Unirme con un código
            </button>
          </div>
        )}

        {(modo === 'crear' || modo === 'unir') && (
          <div className="field">
            <label className="field-label">Tu nombre</label>
            <input
              className="input"
              type="text"
              placeholder="Carlos Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
        )}

        {modo === 'crear' && (
          <>
            <div className="field">
              <label className="field-label">Nombre del negocio</label>
              <input
                className="input"
                type="text"
                placeholder="Cafetería La Esquina"
                value={nombreNegocio}
                onChange={(e) => setNombreNegocio(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={crear} disabled={procesando}>
              {procesando ? 'Creando…' : 'Crear mi negocio'}
            </button>
          </>
        )}

        {modo === 'unir' && (
          <>
            <div className="field">
              <label className="field-label">Código de invitación</label>
              <input
                className="input upper"
                type="text"
                placeholder="A3F9K2"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-block btn-lg" onClick={unir} disabled={procesando}>
              {procesando ? 'Uniendo…' : 'Unirme al negocio'}
            </button>
          </>
        )}

        {error && <p className="msg msg-error">{error}</p>}

        <div className="switch-links">
          {modo !== 'elegir' && (
            <div><button className="btn-quiet" onClick={() => { setModo('elegir'); setError('') }}>← Volver</button></div>
          )}
          <div><button className="btn-quiet btn-muted" onClick={salir}>Cerrar sesión</button></div>
        </div>
      </div>
    </div>
  )
}

// =======================================================================
// Detalle de un cliente: info, acciones (WhatsApp/Abonar), historial y edición.
// =======================================================================
function ClienteDetalle({ cliente, onVolver, onWhatsapp, onAbonar, onGuardar, onEliminarMov }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(cliente.nombre)
  const [tel, setTel] = useState(cliente.telefono || '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (nombre.trim() === '') return
    setGuardando(true)
    const ok = await onGuardar(cliente.id, nombre, tel)
    setGuardando(false)
    if (ok) setEditando(false)
  }

  function cancelar() {
    setNombre(cliente.nombre)
    setTel(cliente.telefono || '')
    setEditando(false)
  }

  return (
    <>
      <button className="btn-quiet back-link" onClick={onVolver}>
        <Icono name="back" /> Clientes
      </button>

      <div className="detalle-head">
        <div className={`avatar avatar-lg ${cliente.saldo > 0 ? 'avatar-debe' : ''}`}>{inicialesDe(cliente.nombre)}</div>
        <div>
          <div className="detalle-nombre">{cliente.nombre}</div>
          {cliente.saldo > 0
            ? <div className="client-owes">debe <b>L {cliente.saldo.toFixed(2)}</b></div>
            : <div className="client-aldia">al día</div>}
          <div className="detalle-tel">{cliente.telefono ? cliente.telefono : 'Sin teléfono'}</div>
        </div>
      </div>

      {!editando && (
        <div className="detalle-acciones">
          <button className="btn btn-wa" onClick={() => onWhatsapp(cliente)}>
            <Icono name="whatsapp" /> WhatsApp
          </button>
          {cliente.saldo > 0 && (
            <button className="btn btn-abonar" onClick={() => onAbonar(cliente)}>Abonar</button>
          )}
          <button className="btn" onClick={() => setEditando(true)}>
            <Icono name="edit" /> Editar cliente
          </button>
        </div>
      )}

      {editando && (
        <div className="card">
          <div className="card-title">Editar cliente</div>
          <div className="field">
            <label className="field-label">Nombre</label>
            <input className="input" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Teléfono (WhatsApp)</label>
            <input className="input" type="tel" placeholder="Ej. 9999-9999" value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          <div className="detalle-acciones">
            <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            <button className="btn" onClick={cancelar} disabled={guardando}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="section-title">Movimientos</div>
      {cliente.movimientos.length === 0 && <p className="empty">Sin movimientos.</p>}
      <ul className="movs movs-standalone">
        {cliente.movimientos.map((m) => (
          <li key={m.id} className="mov">
            {formatFecha(m.fecha)} — {m.tipo === 'fiado' ? 'Fiado' : 'Abono'}: L {Number(m.monto).toFixed(2)}
            {m.concepto ? ` (${m.concepto})` : ''}
            {m.perfiles?.nombre && <span className="mov-by"> · por {m.perfiles.nombre}</span>}
            <button className="icon-del" onClick={() => onEliminarMov(m.id)} title="Eliminar movimiento" style={{ marginLeft: '0.4rem' }}>🗑</button>
            {m.movimiento_detalle && m.movimiento_detalle.length > 0 && (
              <ul className="mov-detalle">
                {m.movimiento_detalle.map((d, i) => (
                  <li key={i}>{d.cantidad}x {d.producto_nombre} — L {Number(d.precio_unitario).toFixed(2)} c/u</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

// =======================================================================
// Pantalla para escribir la nueva contraseña
// =======================================================================
function NuevaPassword({ onListo }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)

  async function guardarPassword() {
    setError(''); setAviso('')
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setProcesando(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('No se pudo actualizar: ' + error.message)
      setProcesando(false)
      return
    }
    setAviso('¡Contraseña actualizada! Ya puedes usar la app.')
    setProcesando(false)
    setTimeout(() => onListo(), 1500)
  }

  return (
    <div className="screen">
      <div className="brand">
        <div className="brand-mark">📓</div>
        <div className="brand-name">Control de Créditos</div>
      </div>
      <div className="card">
        <div className="card-title">Nueva contraseña</div>

        <div className="field">
          <label className="field-label">Contraseña nueva</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Repite la contraseña</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Escríbela de nuevo"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={guardarPassword} disabled={procesando}>
          {procesando ? 'Guardando…' : 'Guardar contraseña'}
        </button>

        {error && <p className="msg msg-error">{error}</p>}
        {aviso && <p className="msg msg-ok">{aviso}</p>}
      </div>
    </div>
  )
}

export default App
