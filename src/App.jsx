import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Quita acentos para que "Maria" también encuentre a "María".
// Sin esto, la dueña tendría que escribir la tilde exacta para hallar al cliente.
function sinAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function App() {
  // --- Estado de sesión y negocio ---
  const [session, setSession] = useState(null)
  const [negocioId, setNegocioId] = useState(null)
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [codigoInvitacion, setCodigoInvitacion] = useState('')
  const [rol, setRol] = useState('')
  const [cargando, setCargando] = useState(true)

  const [modoRecuperacion, setModoRecuperacion] = useState(false)

  // --- Estado del módulo de créditos ---
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [eliminados, setEliminados] = useState([]) // movimientos borrados (auditoría)
  const [clienteSel, setClienteSel] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [mensaje, setMensaje] = useState('')

  // --- Estado del carrito ---
  const [carrito, setCarrito] = useState([])
  const [productoSel, setProductoSel] = useState('')
  const [productoOtro, setProductoOtro] = useState('')
  const [precioOtro, setPrecioOtro] = useState('')

  // --- Estado para gestionar el catálogo de productos ---
  const [mostrarProductos, setMostrarProductos] = useState(false)
  const [nuevoProdNombre, setNuevoProdNombre] = useState('')
  const [nuevoProdPrecio, setNuevoProdPrecio] = useState('')

  // --- Auditoría de eliminados (solo dueña) ---
  const [mostrarEliminados, setMostrarEliminados] = useState(false)

  // --- Listado de clientes: búsqueda y detalles desplegados ---
  const [busqueda, setBusqueda] = useState('')
  const [detallesAbiertos, setDetallesAbiertos] = useState([]) // ids de clientes

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
      return
    }
    async function cargarNegocio() {
      const { data, error } = await supabase
        .from('perfiles')
        .select('negocio_id, rol, negocios(nombre, codigo_invitacion)')
        .eq('id', session.user.id)
        .single()

      if (error) {
        setMensaje('Error al cargar tu negocio: ' + error.message)
        return
      }
      setNegocioId(data.negocio_id)
      setRol(data.rol || '')
      setNombreNegocio(data.negocios?.nombre || '')
      setCodigoInvitacion(data.negocios?.codigo_invitacion || '')
    }
    cargarNegocio()
  }, [session])

  // === 3. Cuando ya sabemos el negocio: cargar clientes y productos ===
  useEffect(() => {
    if (negocioId) {
      cargarClientes()
      cargarProductos()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId])

  async function cargarClientes() {
    const { data: listaClientes, error: errC } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre')

    if (errC) {
      setMensaje('Error al cargar clientes: ' + errC.message)
      return
    }

    // Traemos TODOS los movimientos (con autor, detalle, y quién eliminó)
    const { data: movimientos, error: errM } = await supabase
      .from('movimientos')
      .select('*, perfiles!movimientos_registrado_por_fkey(nombre), eliminador:perfiles!movimientos_eliminado_por_fkey(nombre), movimiento_detalle(producto_nombre, cantidad, precio_unitario)')
      .order('fecha', { ascending: false })

    if (errM) {
      setMensaje('Error al cargar movimientos: ' + errM.message)
      return
    }

    // Solo los ACTIVOS (sin fecha de eliminación) cuentan para saldo y listado
    const activos = movimientos.filter((m) => !m.eliminado_en)

    const clientesConSaldo = listaClientes.map((cliente) => {
      const susMovimientos = activos.filter((m) => m.cliente_id === cliente.id)
      const saldo = susMovimientos.reduce((total, m) => {
        return m.tipo === 'fiado' ? total + Number(m.monto) : total - Number(m.monto)
      }, 0)
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
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre')

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

  // Lo que realmente se pinta: los deudores que coinciden con la búsqueda.
  const termino = sinAcentos(busqueda.trim())
  const clientesFiltrados = termino === ''
    ? clientesConDeuda
    : clientesConDeuda.filter((c) => sinAcentos(c.nombre).includes(termino))

  function alternarDetalle(idCliente) {
    setDetallesAbiertos((abiertos) =>
      abiertos.includes(idCliente)
        ? abiertos.filter((id) => id !== idCliente)
        : [...abiertos, idCliente]
    )
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

    const { error } = await supabase
      .from('productos')
      .insert({ nombre: nuevoProdNombre.trim(), precio: precioNum, negocio_id: negocioId })

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

    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', idProducto)

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
      const yaExiste = clientes.find(
        (c) => c.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase()
      )
      if (yaExiste) {
        clienteId = yaExiste.id
      } else {
        const { data: nuevo, error: errNuevo } = await supabase
          .from('clientes')
          .insert({ nombre: nombreLimpio, negocio_id: negocioId })
          .select()
          .single()

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

    const { data: mov, error: errMov } = await supabase
      .from('movimientos')
      .insert({
        cliente_id: clienteId,
        tipo: 'fiado',
        monto: totalCarrito,
        concepto: conceptoResumen,
        negocio_id: negocioId,
      })
      .select()
      .single()

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

    const { error: errDet } = await supabase
      .from('movimiento_detalle')
      .insert(lineas)

    if (errDet) {
      setMensaje('El fiado se guardó, pero hubo un error con el detalle: ' + errDet.message)
      return
    }

    setMensaje('Fiado registrado correctamente.')
    setCarrito([])
    setNombreNuevo('')
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

    const { error } = await supabase
      .from('movimientos')
      .insert({
        cliente_id: cliente.id,
        tipo: 'abono',
        monto: montoAbono,
        concepto: 'Abono',
        negocio_id: negocioId,
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
    const { error } = await supabase
      .from('movimientos')
      .update({
        eliminado_en: new Date().toISOString(),
        eliminado_por: session.user.id,
      })
      .eq('id', idMovimiento)

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

  function formatFecha(fechaISO) {
    const f = new Date(fechaISO)
    return f.toLocaleString('es-HN', {
      timeZone: 'America/Tegucigalpa',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (cargando) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
        Cargando...
      </div>
    )
  }

  if (modoRecuperacion) {
    return <NuevaPassword onListo={() => setModoRecuperacion(false)} />
  }

  if (!session) {
    return <Auth />
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '550px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>Control de Créditos</h1>
          {nombreNegocio && (
            <p style={{ margin: 0, color: '#555', fontSize: '1rem' }}>
              {nombreNegocio}
              {rol === 'empleado' && <span style={{ color: '#888' }}> · empleado</span>}
            </p>
          )}
        </div>
        <button
          onClick={cerrarSesion}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer', height: 'fit-content' }}
        >
          Cerrar sesión
        </button>
      </div>

      {rol === 'duena' && codigoInvitacion && (
        <div style={{ marginTop: '1rem', padding: '0.7rem 1rem', background: '#f0f4ff', border: '1px solid #b0c4ff', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem' }}>
            Código para invitar empleados: <strong style={{ fontSize: '1.1rem', letterSpacing: '1px' }}>{codigoInvitacion}</strong>
          </span>
          <button onClick={copiarCodigo} style={{ padding: '0.3rem 0.7rem', cursor: 'pointer' }}>
            Copiar
          </button>
        </div>
      )}

      {/* Sección plegable: gestionar el catálogo de productos */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={() => setMostrarProductos(!mostrarProductos)}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          {mostrarProductos ? '▲ Ocultar productos' : '⚙ Gestionar productos'}
        </button>

        {mostrarProductos && (
          <div style={{ marginTop: '0.8rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h3 style={{ marginTop: 0 }}>Mis productos</h3>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Nombre del producto"
                value={nuevoProdNombre}
                onChange={(e) => setNuevoProdNombre(e.target.value)}
                style={{ flex: '2 1 150px', padding: '0.5rem' }}
              />
              <input
                type="number"
                placeholder="Precio (L)"
                value={nuevoProdPrecio}
                onChange={(e) => setNuevoProdPrecio(e.target.value)}
                style={{ flex: '1 1 90px', padding: '0.5rem' }}
              />
              <button onClick={agregarProducto} style={{ padding: '0.5rem 0.8rem', cursor: 'pointer' }}>
                Agregar
              </button>
            </div>

            {productos.length === 0 && (
              <p style={{ fontSize: '0.9rem', color: '#777' }}>
                Aún no tienes productos. Agrega los que vendes para que aparezcan al registrar un fiado.
              </p>
            )}
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
              {productos.map((p) => (
                <li key={p.id} style={{ marginBottom: '0.3rem' }}>
                  {p.nombre} — L {Number(p.precio).toFixed(2)}
                  <button
                    onClick={() => eliminarProducto(p.id)}
                    style={{ marginLeft: '0.5rem', cursor: 'pointer', color: 'red', border: 'none', background: 'none' }}
                    title="Eliminar producto"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Formulario para registrar un fiado con carrito */}
      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Registrar fiado</h2>

        <label>Cliente:</label>
        <select
          value={clienteSel}
          onChange={(e) => setClienteSel(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        >
          <option value="">-- Selecciona un cliente --</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
          <option value="nuevo">+ Agregar cliente nuevo</option>
        </select>

        {clienteSel === 'nuevo' && (
          <input
            type="text"
            placeholder="Nombre del cliente nuevo"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
        )}

        <label>Agregar producto:</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={productoSel}
            onChange={(e) => setProductoSel(e.target.value)}
            style={{ flex: '1 1 200px', padding: '0.5rem' }}
          >
            <option value="">-- Selecciona un producto --</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{Number(p.precio) > 0 ? ` (L ${Number(p.precio).toFixed(2)})` : ''}
              </option>
            ))}
            <option value="otro">Otro...</option>
          </select>
          <button onClick={agregarAlCarrito} style={{ padding: '0.5rem 0.9rem', cursor: 'pointer' }}>
            + Agregar
          </button>
        </div>

        {productoSel === 'otro' && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Nombre del producto"
              value={productoOtro}
              onChange={(e) => setProductoOtro(e.target.value)}
              style={{ flex: '2 1 150px', padding: '0.5rem' }}
            />
            <input
              type="number"
              placeholder="Precio (L)"
              value={precioOtro}
              onChange={(e) => setPrecioOtro(e.target.value)}
              style={{ flex: '1 1 90px', padding: '0.5rem' }}
            />
          </div>
        )}

        {carrito.length > 0 && (
          <div style={{ margin: '0.8rem 0', padding: '0.6rem 0.8rem', background: '#fafafa', border: '1px solid #ddd', borderRadius: '8px' }}>
            <strong style={{ fontSize: '0.9rem' }}>Productos de este fiado:</strong>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
              {carrito.map((l, i) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                  <span style={{ flex: 1 }}>{l.nombre} — L {l.precio.toFixed(2)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button onClick={() => cambiarCantidad(i, -1)} style={{ cursor: 'pointer', width: '26px', height: '26px' }}>−</button>
                    <span style={{ minWidth: '20px', textAlign: 'center' }}>{l.cantidad}</span>
                    <button onClick={() => cambiarCantidad(i, +1)} style={{ cursor: 'pointer', width: '26px', height: '26px' }}>+</button>
                    <span style={{ minWidth: '70px', textAlign: 'right' }}>L {(l.precio * l.cantidad).toFixed(2)}</span>
                    <button
                      onClick={() => quitarDelCarrito(i)}
                      style={{ cursor: 'pointer', color: 'red', border: 'none', background: 'none' }}
                      title="Quitar"
                    >
                      🗑
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ textAlign: 'right', fontWeight: 'bold', marginTop: '0.4rem', borderTop: '1px solid #ddd', paddingTop: '0.4rem' }}>
              Total: L {totalCarrito.toFixed(2)}
            </div>
          </div>
        )}

        <button onClick={registrarFiado} style={{ padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }}>
          Guardar fiado
        </button>
        {mensaje && <p style={{ marginTop: '0.5rem' }}>{mensaje}</p>}
      </div>

      {/* Lista de clientes con su saldo y detalle (solo los que deben algo) */}
      <h2>Clientes con saldo pendiente</h2>
      
      {clientesConDeuda.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px' }}>
          <strong style={{ fontSize: '1.05rem' }}>Total por cobrar: L {totalPendiente.toFixed(2)}</strong>
          <span style={{ color: '#777', fontSize: '0.85rem' }}>
            {' '}({clientesConDeuda.length} {clientesConDeuda.length === 1 ? 'cliente' : 'clientes'})
          </span>
        </div>
      )}

      {/* Buscador: filtra conforme se escribe, sin acentos ni mayúsculas */}
      {clientesConDeuda.length > 0 && (
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <input
            type="search"
            placeholder="🔍 Buscar cliente por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '8px', fontSize: '1rem' }}
          />
          {busqueda !== '' && (
            <div style={{ fontSize: '0.85rem', color: '#777', marginTop: '0.3rem' }}>
              {clientesFiltrados.length} de {clientesConDeuda.length} clientes
              <button
                onClick={() => setBusqueda('')}
                style={{ marginLeft: '0.5rem', border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}
              >
                limpiar
              </button>
            </div>
          )}
        </div>
      )}

      {clientesConDeuda.length === 0 && (
        <p>Ningún cliente tiene saldo pendiente.</p>
      )}
      {clientesConDeuda.length > 0 && clientesFiltrados.length === 0 && (
        <p style={{ color: '#777' }}>Ningún cliente con saldo coincide con «{busqueda}».</p>
      )}
      {clientesFiltrados.map((c) => (
        <div key={c.id} style={{ marginBottom: '1rem', padding: '0.8rem', border: '1px solid #eee', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span><strong>{c.nombre}</strong> — debe: L {c.saldo.toFixed(2)}</span>
            <span style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => alternarDetalle(c.id)}
                style={{ padding: '0.3rem 0.7rem', cursor: 'pointer', background: '#f5f5f5', border: '1px solid #bbb', borderRadius: '6px' }}
                title="Ver los movimientos de este cliente"
              >
                {detallesAbiertos.includes(c.id)
                  ? '▲ Ocultar'
                  : `▼ Detalle (${c.movimientos.length})`}
              </button>
              <button
                onClick={() => registrarAbono(c)}
                style={{ padding: '0.3rem 0.7rem', cursor: 'pointer', background: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: '6px', color: '#2e7d32' }}
                title="Registrar un pago de este cliente"
              >
                Abonar
              </button>
            </span>
          </div>
          <ul style={{ marginTop: '0.4rem', fontSize: '0.9rem', display: detallesAbiertos.includes(c.id) ? 'block' : 'none' }}>
            {c.movimientos.map((m) => (
              <li key={m.id} style={{ marginBottom: '0.4rem' }}>
                {formatFecha(m.fecha)} — {m.tipo === 'fiado' ? 'Fiado' : 'Abono'}: L {Number(m.monto).toFixed(2)}
                {m.concepto ? ` (${m.concepto})` : ''}
                {m.perfiles?.nombre && (
                  <span style={{ color: '#888' }}> · por {m.perfiles.nombre}</span>
                )}
                <button
                  onClick={() => eliminarMovimiento(m.id)}
                  style={{ marginLeft: '0.5rem', cursor: 'pointer', color: 'red', border: 'none', background: 'none' }}
                  title="Eliminar movimiento"
                >
                  🗑
                </button>
                {m.movimiento_detalle && m.movimiento_detalle.length > 0 && (
                  <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem', color: '#666', fontSize: '0.85rem' }}>
                    {m.movimiento_detalle.map((d, i) => (
                      <li key={i}>
                        {d.cantidad}x {d.producto_nombre} — L {Number(d.precio_unitario).toFixed(2)} c/u
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Auditoría: movimientos eliminados (solo la dueña) */}
      {rol === 'duena' && (
        <div style={{ marginTop: '2rem' }}>
          <button
            onClick={() => setMostrarEliminados(!mostrarEliminados)}
            style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
          >
            {mostrarEliminados ? '▲ Ocultar eliminados' : `🗑 Movimientos eliminados (${eliminados.length})`}
          </button>

          {mostrarEliminados && (
            <div style={{ marginTop: '0.8rem', padding: '1rem', border: '1px solid #f0c0c0', borderRadius: '8px', background: '#fdf7f7' }}>
              <h3 style={{ marginTop: 0 }}>Registro de eliminados</h3>
              {eliminados.length === 0 && (
                <p style={{ fontSize: '0.9rem', color: '#777' }}>No se ha eliminado ningún movimiento.</p>
              )}
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#555' }}>
                {eliminados.map((m) => (
                  <li key={m.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{m.nombreCliente}</strong> — {m.tipo === 'fiado' ? 'Fiado' : 'Abono'}: L {Number(m.monto).toFixed(2)}
                    {m.concepto ? ` (${m.concepto})` : ''}
                    <br />
                    <span style={{ color: '#a33' }}>
                      Eliminado el {formatFecha(m.eliminado_en)}
                      {m.eliminador?.nombre ? ` por ${m.eliminador.nombre}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Control de Créditos</h1>
      <div style={{ padding: '1.5rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>{titulo}</h2>

        {(modo === 'crear' || modo === 'unir') && (
          <>
            <label>Tu nombre:</label>
            <input
              type="text"
              placeholder="Ej. Carlos Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
            />
          </>
        )}

        {modo === 'crear' && (
          <>
            <label>Nombre del negocio:</label>
            <input
              type="text"
              placeholder="Ej. Cafetería La Esquina"
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
            />
          </>
        )}

        {modo === 'unir' && (
          <>
            <label>Código de invitación:</label>
            <input
              type="text"
              placeholder="Ej. A3F9K2"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem', textTransform: 'uppercase' }}
            />
          </>
        )}

        <label>Correo:</label>
        <input
          type="email"
          autoComplete="email"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        />

        {modo !== 'recuperar' && (
          <>
            <label>Contraseña:</label>
            <input
              type="password"
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '0.3rem', padding: '0.5rem' }}
            />
            {modo === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: '0.6rem' }}>
                <button
                  onClick={() => { setModo('recuperar'); setError(''); setAviso('') }}
                  style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
          </>
        )}

        {modo === 'recuperar' && (
          <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.3rem' }}>
            Te enviaremos un enlace a tu correo para crear una contraseña nueva.
          </p>
        )}

        <button
          onClick={accionPrincipal}
          disabled={procesando}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', width: '100%', marginTop: '0.5rem' }}
        >
          {textoBoton}
        </button>

        {error && <p style={{ marginTop: '0.5rem', color: 'red' }}>{error}</p>}
        {aviso && <p style={{ marginTop: '0.5rem', color: '#2e7d32' }}>{aviso}</p>}

        <div style={{ marginTop: '1rem', fontSize: '0.9rem', lineHeight: '1.8' }}>
          {modo !== 'login' && (
            <div>
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => { setModo('login'); setError(''); setAviso('') }}
                style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Inicia sesión
              </button>
            </div>
          )}
          {modo !== 'crear' && modo !== 'recuperar' && (
            <div>
              ¿Vas a abrir un negocio nuevo?{' '}
              <button
                onClick={() => { setModo('crear'); setError(''); setAviso('') }}
                style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Registra tu negocio
              </button>
            </div>
          )}
          {modo !== 'unir' && modo !== 'recuperar' && (
            <div>
              ¿Te invitaron a un negocio?{' '}
              <button
                onClick={() => { setModo('unir'); setError(''); setAviso('') }}
                style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Unirme con código
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Control de Créditos</h1>
      <div style={{ padding: '1.5rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Nueva contraseña</h2>

        <label>Contraseña nueva:</label>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        />

        <label>Repite la contraseña:</label>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Escríbela de nuevo"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.8rem', padding: '0.5rem' }}
        />

        <button
          onClick={guardarPassword}
          disabled={procesando}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', width: '100%' }}
        >
          {procesando ? 'Guardando...' : 'Guardar contraseña'}
        </button>

        {error && <p style={{ marginTop: '0.5rem', color: 'red' }}>{error}</p>}
        {aviso && <p style={{ marginTop: '0.5rem', color: '#2e7d32' }}>{aviso}</p>}
      </div>
    </div>
  )
}

export default App
