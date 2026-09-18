import { useEffect, useState } from 'react'
import { obtenerAdminOverview } from './lib/api'

const est = {
  wrap: { maxWidth: 920, margin: '0 auto', padding: 20 },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  h1: { color: '#15734B', margin: 0, fontSize: 22 },
  volver: { background: '#15734B', color: '#fff', textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600 },
  cards: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  card: { flex: 1, minWidth: 120, background: '#eef6f1', borderRadius: 12, padding: 16, textAlign: 'center' },
  num: { fontSize: 28, fontWeight: 800, color: '#15734B' },
  tablaWrap: { overflowX: 'auto' },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 },
  th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #15734B', color: '#15734B' },
  td: { padding: '10px 8px', borderBottom: '1px solid #eee' },
}

export default function AdminPanel() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    obtenerAdminOverview().then(({ data, error }) => {
      if (error) setError(error.message)
      else setDatos(data || [])
      setCargando(false)
    })
  }, [])

  if (cargando) return <div style={est.wrap}>Cargando panel…</div>
  if (error) return <div style={est.wrap}><p>No se pudo cargar el panel: {error}</p></div>

  const total = (k) => datos.reduce((s, n) => s + Number(n[k] || 0), 0)

  return (
    <div style={est.wrap}>
      <div style={est.top}>
        <h1 style={est.h1}>Panel de administración</h1>
        <a href="/app" style={est.volver}>Volver a la app</a>
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
    </div>
  )
}
