import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  // --- Estado de sesión y negocio ---
  const [session, setSession] = useState(null)
  const [negocioId, setNegocioId] = useState(null)
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [codigoInvitacion, setCodigoInvitacion] = useState('')
  const [rol, setRol] = useState('')
  const [cargando, setCargando] = useState(true)

  // --- Modo recuperación: true cuando el usuario vuelve desde el link del correo ---
  const [modoRecuperacion, setModoRecuperacion] = useState(false)

  // --- Estado del módulo de créditos ---
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [clienteSel, setClienteSel] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [productoSel, setProductoSel] = useState('')
  const [productoOtro, setProductoOtro] = useState('')
  const [monto, setMonto] = useState('')
  const [mensaje, setMensaje] = useState('')

  // --- Estado para gestionar el catálogo de productos ---
  const [mostrarProductos, setMostrarProductos] = useState(false)
  const [nuevoProdNombre, setNuevoProdNombre] = useState('')
  const [nuevoProdPrecio, setNuevoProdPrecio] = useState('')

  // === 1. Al iniciar: revisar sesión y escuchar cambios de autenticación ===
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSession(nuevaSesion)
      // Cuando el usuario llega desde el correo de recuperación,
      // Supabase dispara este evento: mostramos la pantalla de nueva contraseña.
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

    const { data: movimientos, error: errM } = await supabase
      .from('movimientos')
      .select('*')
      .order('fecha', { ascending: false })

    if (errM) {
      setMensaje('Error al cargar movimientos: ' + errM.message)
      return
    }

    const clientesConSaldo = listaClientes.map((cliente) => {
      const susMovimientos = movimientos.filter((m) => m.cliente_id === cliente.id)
      const saldo = susMovimientos.reduce((total, m) => {
        return m.tipo === 'fiado' ? total + Number(m.monto) : total - Number(m.monto)
      }, 0)
      return { ...cliente, saldo, movimientos: susMovimientos }
    })

    setClientes(clientesConSaldo)
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

  function seleccionarProducto(valor) {
    setProductoSel(valor)
    if (valor && valor !== 'otro') {
      const p = productos.find((x) => x.id === valor)
      if (p && Number(p.precio) > 0) {
        setMonto(String(Number(p.precio)))
      }
    }
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

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      setMensaje('El monto debe ser un número mayor que cero.')
      return
    }

    let clienteId

    if (clienteSel === 'nuevo') {
      if (nombreNuevo.trim() === '') {
        setMensaje('Escribe el nombre del cliente nuevo.')
        return
      }
      const { data: nuevo, error: errNuevo } = await supabase
        .from('clientes')
        .insert({ nombre: nombreNuevo.trim(), negocio_id: negocioId })
        .select()
        .single()

      if (errNuevo) {
        setMensaje('Error al crear cliente: ' + errNuevo.message)
        return
      }
      clienteId = nuevo.id
    } else if (clienteSel === '') {
      setMensaje('Selecciona un cliente o agrega uno nuevo.')
      return
    } else {
      clienteId = Number(clienteSel)
    }

    let concepto
    if (productoSel === 'otro') {
      concepto = productoOtro.trim()
      if (concepto === '') {
        setMensaje('Escribe el nombre del producto (opción Otro).')
        return
      }
    } else if (productoSel === '') {
      setMensaje('Selecciona un producto.')
      return
    } else {
      const p = productos.find((x) => x.id === productoSel)
      concepto = p ? p.nombre : ''
      if (concepto === '') {
        setMensaje('Producto no encontrado, vuelve a seleccionarlo.')
        return
      }
    }

    const { error: errMov } = await supabase
      .from('movimientos')
      .insert({ cliente_id: clienteId, tipo: 'fiado', monto: montoNum, concepto, negocio_id: negocioId })

    if (errMov) {
      setMensaje('Error al registrar el fiado: ' + errMov.message)
      return
    }

    setMensaje('Fiado registrado correctamente.')
    setMonto('')
    setNombreNuevo('')
    setClienteSel('')
    setProductoSel('')
    setProductoOtro('')
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

  async function eliminarMovimiento(idMovimiento) {
    const confirmar = window.confirm('¿Seguro que deseas eliminar este movimiento?')
    if (!confirmar) return

    const { error } = await supabase
      .from('movimientos')
      .delete()
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
    setMensaje('')
  }

  function formatFecha(fechaISO) {
    const f = new Date(fechaISO)
    return f.toLocaleDateString('es-HN')
  }

  // --- Mientras verifica si hay sesión, no mostramos nada aún ---
  if (cargando) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
        Cargando...
      </div>
    )
  }

  // --- Si el usuario volvió desde el correo de recuperación: pantalla de nueva contraseña ---
  if (modoRecuperacion) {
    return <NuevaPassword onListo={() => setModoRecuperacion(false)} />
  }

  // --- Si NO hay sesión, mostramos la pantalla de login/registro ---
  if (!session) {
    return <Auth />
  }

  // --- Si hay sesión, mostramos la app de créditos ---
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

      {/* Código de invitación: solo lo ve la dueña */}
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

      {/* Formulario para registrar un fiado */}
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

        <label>Producto:</label>
        <select
          value={productoSel}
          onChange={(e) => seleccionarProducto(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        >
          <option value="">-- Selecciona un producto --</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}{Number(p.precio) > 0 ? ` (L ${Number(p.precio).toFixed(2)})` : ''}
            </option>
          ))}
          <option value="otro">Otro...</option>
        </select>

        {productoSel === 'otro' && (
          <input
            type="text"
            placeholder="Escribe el producto"
            value={productoOtro}
            onChange={(e) => setProductoOtro(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
        )}

        <label>Monto (L):</label>
        <input
          type="number"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        />

        <button onClick={registrarFiado} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Guardar fiado
        </button>
        {mensaje && <p style={{ marginTop: '0.5rem' }}>{mensaje}</p>}
      </div>

      {/* Lista de clientes con su saldo y detalle (solo los que deben algo) */}
      <h2>Clientes con saldo pendiente</h2>
      {clientes.filter((c) => c.saldo > 0).length === 0 && (
        <p>Ningún cliente tiene saldo pendiente.</p>
      )}
      {clientes.filter((c) => c.saldo > 0).map((c) => (
        <div key={c.id} style={{ marginBottom: '1rem', padding: '0.8rem', border: '1px solid #eee', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{c.nombre}</strong> — debe: L {c.saldo.toFixed(2)}</span>
            <button
              onClick={() => registrarAbono(c)}
              style={{ padding: '0.3rem 0.7rem', cursor: 'pointer', background: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: '6px', color: '#2e7d32' }}
              title="Registrar un pago de este cliente"
            >
              Abonar
            </button>
          </div>
          <ul style={{ marginTop: '0.4rem', fontSize: '0.9rem' }}>
            {c.movimientos.map((m) => (
              <li key={m.id} style={{ marginBottom: '0.3rem' }}>
                {formatFecha(m.fecha)} — {m.tipo === 'fiado' ? 'Fiado' : 'Abono'}: L {Number(m.monto).toFixed(2)}
                {m.concepto ? ` (${m.concepto})` : ''}
                <button
                  onClick={() => eliminarMovimiento(m.id)}
                  style={{ marginLeft: '0.5rem', cursor: 'pointer', color: 'red', border: 'none', background: 'none' }}
                  title="Eliminar movimiento"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// =======================================================================
// Componente de autenticación: login, crear negocio, unirse o recuperar
// =======================================================================
function Auth() {
  // 'login' | 'crear' | 'unir' | 'recuperar'
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

  // Envía el correo con el link para restablecer la contraseña
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

        {/* Nombre de la persona: en crear y unir */}
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

        {/* Nombre del negocio: solo al crear */}
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

        {/* Código de invitación: solo al unirse */}
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

        {/* Contraseña: en todos los modos menos recuperar */}
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
            {/* Enlace de olvidé contraseña: solo en login */}
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

        {/* Enlaces para cambiar de modo */}
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
// Pantalla para escribir la nueva contraseña (al volver desde el correo)
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
    // Tras un momento, salimos del modo recuperación y entramos con la sesión ya activa
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
