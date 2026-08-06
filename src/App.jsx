import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Lista de platos predefinidos para el desplegable
const PLATOS = [
  'Pollo a la plancha',
  'Pollo con tajadas',
  'Costilla BBQ',
  'Sopa de res',
  'Carne asada',
]

function App() {
  // --- Estado de sesión y negocio ---
  const [session, setSession] = useState(null)      // sesión del usuario logueado
  const [negocioId, setNegocioId] = useState(null)  // id del negocio del usuario
  const [cargando, setCargando] = useState(true)    // evita parpadeo del login al iniciar

  // --- Estado del módulo de fiados ---
  const [clientes, setClientes] = useState([])        // clientes con saldo y movimientos
  const [clienteSel, setClienteSel] = useState('')    // cliente seleccionado en el desplegable
  const [nombreNuevo, setNombreNuevo] = useState('')  // nombre si es cliente nuevo
  const [platoSel, setPlatoSel] = useState(PLATOS[0]) // plato seleccionado
  const [platoOtro, setPlatoOtro] = useState('')      // texto si elige "Otro"
  const [monto, setMonto] = useState('')              // monto del fiado
  const [mensaje, setMensaje] = useState('')          // mensaje de éxito o error

  // === 1. Al iniciar: revisar si ya hay sesión y escuchar cambios ===
  useEffect(() => {
    // Sesión actual (si el usuario ya estaba logueado)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })

    // Escuchar login / logout para actualizar la pantalla en tiempo real
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // === 2. Cuando hay sesión: averiguar a qué negocio pertenece el usuario ===
  useEffect(() => {
    if (!session) {
      setNegocioId(null)
      return
    }
    async function cargarNegocio() {
      const { data, error } = await supabase
        .from('perfiles')
        .select('negocio_id')
        .eq('id', session.user.id)
        .single()

      if (error) {
        setMensaje('Error al cargar tu negocio: ' + error.message)
        return
      }
      setNegocioId(data.negocio_id)
    }
    cargarNegocio()
  }, [session])

  // === 3. Cuando ya sabemos el negocio: cargar sus clientes ===
  useEffect(() => {
    if (negocioId) cargarClientes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId])

  // Carga clientes, sus movimientos y calcula saldos
  // (RLS filtra automáticamente para mostrar solo los de MI negocio)
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

    // Para cada cliente: calculamos saldo y guardamos sus movimientos
    const clientesConSaldo = listaClientes.map((cliente) => {
      const susMovimientos = movimientos.filter((m) => m.cliente_id === cliente.id)
      const saldo = susMovimientos.reduce((total, m) => {
        return m.tipo === 'fiado' ? total + Number(m.monto) : total - Number(m.monto)
      }, 0)
      return { ...cliente, saldo, movimientos: susMovimientos }
    })

    setClientes(clientesConSaldo)
  }

  // Registra un nuevo fiado
  async function registrarFiado() {
    setMensaje('')

    // Validación del monto
    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      setMensaje('El monto debe ser un número mayor que cero.')
      return
    }

    // Determinamos el cliente: existente o nuevo
    let clienteId

    if (clienteSel === 'nuevo') {
      // Cliente nuevo: validamos el nombre
      if (nombreNuevo.trim() === '') {
        setMensaje('Escribe el nombre del cliente nuevo.')
        return
      }
      // Al crear el cliente, le ponemos el negocio_id (RLS lo exige)
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
      // Cliente existente: clienteSel ya es el id
      clienteId = Number(clienteSel)
    }

    // Determinamos el concepto (plato)
    const concepto = platoSel === 'Otro' ? platoOtro.trim() : platoSel
    if (concepto === '') {
      setMensaje('Escribe qué plato es (opción Otro).')
      return
    }

    // Insertamos el movimiento de tipo "fiado" con su concepto y el negocio_id
    const { error: errMov } = await supabase
      .from('movimientos')
      .insert({ cliente_id: clienteId, tipo: 'fiado', monto: montoNum, concepto, negocio_id: negocioId })

    if (errMov) {
      setMensaje('Error al registrar el fiado: ' + errMov.message)
      return
    }

    // Limpiamos y recargamos
    setMensaje('Fiado registrado correctamente.')
    setMonto('')
    setNombreNuevo('')
    setClienteSel('')
    setPlatoSel(PLATOS[0])
    setPlatoOtro('')
    cargarClientes()
  }

  // Elimina un movimiento (fiado o abono) por su id
  async function eliminarMovimiento(idMovimiento) {
    // Confirmación para evitar borrados accidentales
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
    cargarClientes()  // recargamos para actualizar saldos
  }

  // Cierra la sesión del usuario
  async function cerrarSesion() {
    await supabase.auth.signOut()
    setClientes([])
    setMensaje('')
  }

  // Formatea una fecha a algo legible (ej. 25/06/2026)
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

  // --- Si NO hay sesión, mostramos la pantalla de login/registro ---
  if (!session) {
    return <Auth />
  }

  // --- Si hay sesión, mostramos la app de fiados ---
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '550px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Control de Fiados</h1>
        <button
          onClick={cerrarSesion}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer', height: 'fit-content' }}
        >
          Cerrar sesión
        </button>
      </div>

      {/* Formulario para registrar un fiado */}
      <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Registrar fiado</h2>

        {/* Selección de cliente */}
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

        {/* Campo de nombre solo si es cliente nuevo */}
        {clienteSel === 'nuevo' && (
          <input
            type="text"
            placeholder="Nombre del cliente nuevo"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
        )}

        {/* Selección de plato */}
        <label>Plato:</label>
        <select
          value={platoSel}
          onChange={(e) => setPlatoSel(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        >
          {PLATOS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="Otro">Otro...</option>
        </select>

        {/* Campo de texto solo si elige "Otro" */}
        {platoSel === 'Otro' && (
          <input
            type="text"
            placeholder="Escribe el plato"
            value={platoOtro}
            onChange={(e) => setPlatoOtro(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
        )}

        {/* Monto */}
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
          <strong>{c.nombre}</strong> — debe: L {c.saldo.toFixed(2)}
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
// Componente de autenticación: login e inscripción de un negocio nuevo
// =======================================================================
function Auth() {
  const [modo, setModo] = useState('login')  // 'login' o 'registro'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')            // nombre de la persona (dueña)
  const [nombreNegocio, setNombreNegocio] = useState('') // nombre del negocio (solo registro)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)

  async function iniciarSesion() {
    setError('')
    setProcesando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('No se pudo iniciar sesión: ' + error.message)
    setProcesando(false)
  }

  async function registrar() {
    setError('')
    if (nombreNegocio.trim() === '') {
      setError('Escribe el nombre de tu negocio.')
      return
    }
    setProcesando(true)
    // El nombre y el nombre del negocio viajan como metadata;
    // el trigger de la base de datos crea el negocio y el perfil.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre: nombre.trim(),
          nombre_negocio: nombreNegocio.trim(),
        },
      },
    })
    if (error) setError('No se pudo registrar: ' + error.message)
    setProcesando(false)
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '400px', margin: '2rem auto' }}>
      <h1>Control de Fiados</h1>
      <div style={{ padding: '1.5rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>{modo === 'login' ? 'Iniciar sesión' : 'Registrar mi negocio'}</h2>

        {/* Campos solo visibles en registro */}
        {modo === 'registro' && (
          <>
            <label>Tu nombre:</label>
            <input
              type="text"
              placeholder="Ej. María López"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
            />
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

        <label>Correo:</label>
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.5rem', padding: '0.5rem' }}
        />

        <label>Contraseña:</label>
        <input
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: '0.8rem', padding: '0.5rem' }}
        />

        <button
          onClick={modo === 'login' ? iniciarSesion : registrar}
          disabled={procesando}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', width: '100%' }}
        >
          {procesando ? 'Procesando...' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>

        {error && <p style={{ marginTop: '0.5rem', color: 'red' }}>{error}</p>}

        {/* Cambiar entre login y registro */}
        <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          {modo === 'login' ? (
            <>
              ¿No tienes cuenta?{' '}
              <button
                onClick={() => { setModo('registro'); setError('') }}
                style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Registra tu negocio
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{' '}
              <button
                onClick={() => { setModo('login'); setError('') }}
                style={{ border: 'none', background: 'none', color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Inicia sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default App
