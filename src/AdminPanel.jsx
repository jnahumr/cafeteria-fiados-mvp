import { useEffect, useState } from 'react'
import {
  obtenerAdminOverview,
  obtenerFeedbackAdmin,
  obtenerAdminUsuarios,
  cambiarEstadoUsuario,
  cambiarEstadoNegocio,
} from './lib/api'

const VERDE = '#15734B'
const ROJO = '#b3261e'

const est = {
  wrap: { maxWidth: 920, margin: '0 auto', padding: 20 },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  h1: { color: VERDE, margin: 0, fontSize: 22 },
  h2: { color: VERDE, fontSize: 18, marginTop: 28, marginBottom: 12 },
  volver: { background: VERDE, color: '#fff', textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600 },
  cards: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  card: { flex: 1, minWidth: 120, background: '#eef6f1', borderRadius: 12, padding: 16, textAlign: 'center' },
  num: { fontSize: 28, fontWeight: 800, color: VERDE },
  tablaWrap: { overflowX: 'auto' },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: `2px solid ${VERDE}`, color: VERDE },
  td: { padding: '10px 8px', borderBottom: '1px solid #eee' },
  bloque: { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, marginBottom: 12 },
  fila: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  filaUsuario: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f2f2f2' },
  sub: { color: '#888', fontSize: 13 },
  aviso: { background: '#fdecea', color: ROJO, borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 12 },
  confirmar: { background: '#fff8e1', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
}

function Estado({ activo }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: activo ? '#e3f4ea' : '#fdecea', color: activo ? VERDE : ROJO,
    }}>{activo ? 'Activo' : 'Deshabilitado'}</span>
  )
}

function BotonEstado({ activo, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: activo ? '#fff' : VERDE, color: activo ? ROJO : '#fff',
        border: `1px solid ${activo ? ROJO : VERDE}`, borderRadius: 8,
        padding: '6px 12px', fontWeight: 600, fontSize: 13,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >{activo ? 'Deshabilitar' : 'Habilitar'}</button>
  )
}

// Confirmación en la misma tarjeta (sin window.confirm).
function Confirmacion({ texto, onSi, onNo, procesando }) {
  return (
    <div style={est.confirmar}>
      <span>{texto}</span>
      <button type="button" onClick={onSi} disabled={procesando}
        style={{ background: VERDE, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}>
        {procesando ? 'Guardando…' : 'Sí, confirmar'}
      </button>
      <button type="button" onClick={onNo} disabled={procesando}
        style={{ background: 'none', border: '1px solid #ccc', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
        Cancelar
      </button>
    </div>
  )
}

function textoConfirmacion(p) {
  const accion = p.activo ? 'habilitar' : 'deshabilitar'
  if (p.tipo === 'negocio') {
    const efecto = p.activo ? 'Sus usuarios vuelven a tener acceso.' : 'Todos sus usuarios pierden el acceso.'
    return `¿${accion[0].toUpperCase() + accion.slice(1)} el negocio "${p.nombre}"? ${efecto}`
  }
  return `¿${accion[0].toUpperCase() + accion.slice(1)} a ${p.nombre}?`
}

function ControlAcceso() {
  const [negocios, setNegocios] = useState(null)
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(null) // { tipo, id, activo, nombre }
  const [procesando, setProcesando] = useState(false)

  async function cargar() {
    const { data, error } = await obtenerAdminUsuarios()
    if (error) setError('No se pudo cargar la lista de usuarios: ' + error.message)
    else setNegocios(data || [])
  }

  useEffect(() => { cargar() }, [])

  async function confirmar() {
    if (!pendiente) return
    setProcesando(true)
    setError('')
    const { error } = pendiente.tipo === 'negocio'
      ? await cambiarEstadoNegocio(pendiente.id, pendiente.activo)
      : await cambiarEstadoUsuario(pendiente.id, pendiente.activo)
    setProcesando(false)
    setPendiente(null)
    if (error) {
      setError(error.message)
      return
    }
    cargar()
  }

  if (!negocios) return <p style={{ color: '#999' }}>{error || 'Cargando usuarios…'}</p>

  return (
    <div>
      <p style={{ ...est.sub, marginTop: 0 }}>
        Deshabilitar no borra datos: el usuario o negocio pierde el acceso y se puede reactivar cuando quieras.
      </p>
      {error && <div style={est.aviso}>{error}</div>}
      {negocios.map((n) => {
        const esMiNegocio = n.usuarios.some((u) => u.es_yo)
        const pendienteNegocio = pendiente?.tipo === 'negocio' && pendiente.id === n.id
        return (
          <div key={n.id} style={{ ...est.bloque, opacity: n.activo ? 1 : 0.85 }}>
            <div style={est.fila}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{n.nombre}</strong>
                <Estado activo={n.activo} />
              </div>
              <BotonEstado
                activo={n.activo}
                disabled={esMiNegocio || procesando}
                onClick={() => setPendiente({ tipo: 'negocio', id: n.id, activo: !n.activo, nombre: n.nombre })}
              />
            </div>
            {esMiNegocio && <div style={est.sub}>Es tu negocio: no se puede deshabilitar desde aquí.</div>}
            {pendienteNegocio && (
              <Confirmacion texto={textoConfirmacion(pendiente)} onSi={confirmar} onNo={() => setPendiente(null)} procesando={procesando} />
            )}

            <div style={{ marginTop: 10 }}>
              {n.usuarios.length === 0 && <div style={est.sub}>Sin usuarios.</div>}
              {n.usuarios.map((u) => {
                const nombre = u.nombre || u.correo || 'Sin nombre'
                const pendienteUsuario = pendiente?.tipo === 'usuario' && pendiente.id === u.id
                return (
                  <div key={u.id}>
                    <div style={est.filaUsuario}>
                      <div>
                        <div style={{ fontSize: 14 }}>
                          {nombre} {u.es_yo && <span style={est.sub}>(vos)</span>}
                        </div>
                        <div style={est.sub}>
                          {u.rol === 'duena' ? 'Propietario' : 'Empleado'}{u.correo ? ` · ${u.correo}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Estado activo={u.activo} />
                        <BotonEstado
                          activo={u.activo}
                          disabled={u.es_yo || procesando}
                          onClick={() => setPendiente({ tipo: 'usuario', id: u.id, activo: !u.activo, nombre })}
                        />
                      </div>
                    </div>
                    {pendienteUsuario && (
                      <Confirmacion texto={textoConfirmacion(pendiente)} onSi={confirmar} onNo={() => setPendiente(null)} procesando={procesando} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListaFeedback({ feedback }) {
  if (!feedback) return <p style={{ color: '#999' }}>Cargando opiniones…</p>
  if (feedback.length === 0) return <p style={{ color: '#999' }}>Todavía no hay opiniones.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feedback.map((f) => (
        <div key={f.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>
              {f.autor || 'Usuario'} <span style={{ color: '#888', fontWeight: 400 }}>· {f.negocio}</span>
            </strong>
            <span style={{ color: '#f5a623', letterSpacing: 1 }}>
              {'★'.repeat(f.calificacion)}<span style={{ color: '#d0d0d0' }}>{'★'.repeat(5 - f.calificacion)}</span>
            </span>
          </div>
          <p style={{ margin: '8px 0 4px', fontSize: 14, color: '#333', whiteSpace: 'pre-wrap' }}>{f.comentario}</p>
          <span style={{ fontSize: 12, color: '#999' }}>
            {f.creado_en ? new Date(f.creado_en).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function AdminPanel({ onSalir }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    obtenerAdminOverview().then(({ data, error }) => {
      if (error) setError(error.message)
      else setDatos(data || [])
      setCargando(false)
    })
  }, [])

  useEffect(() => {
    obtenerFeedbackAdmin().then(({ data }) => setFeedback(data || []))
  }, [])

  if (cargando) return <div style={est.wrap}>Cargando panel…</div>
  if (error) return <div style={est.wrap}><p>No se pudo cargar el panel: {error}</p></div>

  const total = (k) => datos.reduce((s, n) => s + Number(n[k] || 0), 0)

  return (
    <div style={est.wrap}>
      <div style={est.top}>
        <h1 style={est.h1}>Panel de administración</h1>
        <button type="button" onClick={onSalir} style={{ ...est.volver, border: 'none', cursor: 'pointer', fontSize: 14 }}>Cerrar sesión</button>
      </div>
      <div style={est.cards}>
        <div style={est.card}><div style={est.num}>{datos.length}</div><div>Negocios</div></div>
        <div style={est.card}><div style={est.num}>{total('clientes')}</div><div>Clientes</div></div>
        <div style={est.card}><div style={est.num}>{total('movimientos')}</div><div>Movimientos</div></div>
      </div>
      <div style={est.tablaWrap}>
        <table style={est.tabla}>
          <thead>
            <tr>
              <th style={est.th}>Negocio</th>
              <th style={est.th}>Usuarios</th>
              <th style={est.th}>Productos</th>
              <th style={est.th}>Clientes</th>
              <th style={est.th}>Movimientos</th>
              <th style={est.th}>Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((n) => (
              <tr key={n.id}>
                <td style={est.td}>{n.nombre}</td>
                <td style={est.td}>{n.usuarios}</td>
                <td style={est.td}>{n.productos}</td>
                <td style={est.td}>{n.clientes}</td>
                <td style={est.td}>{n.movimientos}</td>
                <td style={est.td}>{n.ultima_actividad ? new Date(n.ultima_actividad).toLocaleDateString('es-HN') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={est.h2}>Control de acceso</h2>
      <ControlAcceso />

      <h2 style={est.h2}>Retroalimentación de usuarios</h2>
      <ListaFeedback feedback={feedback} />
    </div>
  )
}
