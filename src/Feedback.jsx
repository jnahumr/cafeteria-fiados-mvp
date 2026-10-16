import { useEffect, useState } from 'react'
import { obtenerFeedback, crearFeedback } from './lib/api'

const VERDE = '#15734B'

function Estrellas({ valor, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} de 5 estrellas`}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 28, lineHeight: 1, color: n <= valor ? '#f5a623' : '#d0d0d0',
            }}
          >★</button>
        ) : (
          <span
            key={n}
            aria-hidden="true"
            style={{ fontSize: 18, lineHeight: 1, color: n <= valor ? '#f5a623' : '#d0d0d0' }}
          >★</span>
        )
      )}
    </div>
  )
}

export default function Feedback({ autorNombre }) {
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [calificacion, setCalificacion] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error } = await obtenerFeedback()
    if (error) setError('No se pudo cargar la retroalimentación.')
    else setLista(data || [])
    setCargando(false)
  }

  async function enviar() {
    setError('')
    if (calificacion === 0) return setError('Elegí una calificación (1 a 5 estrellas).')
    if (!comentario.trim()) return setError('Escribí un comentario.')
    setEnviando(true)
    const { data, error } = await crearFeedback({
      autor: autorNombre || null,
      calificacion,
      comentario: comentario.trim(),
    })
    setEnviando(false)
    if (error) return setError('No se pudo enviar. Intentá de nuevo.')
    setLista((prev) => [data, ...prev])
    setCalificacion(0)
    setComentario('')
  }

  function fmtFecha(f) {
    try {
      return new Date(f).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return '' }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: VERDE, marginBottom: 4 }}>Retroalimentación</h2>
      <p style={{ color: '#666', marginTop: 0, fontSize: 14 }}>
        Contanos qué te parece la herramienta. Tu opinión es visible para tu negocio.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Tu calificación</label>
        <Estrellas valor={calificacion} onChange={setCalificacion} />
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Escribí tu comentario…"
          maxLength={500}
          rows={3}
          style={{ width: '100%', marginTop: 12, padding: 10, borderRadius: 8, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#999' }}>{comentario.length}/500</span>
          <button
            onClick={enviar}
            disabled={enviando}
            style={{ background: VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.6 : 1 }}
          >{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>}
      </div>

      {cargando ? (
        <p style={{ color: '#666' }}>Cargando…</p>
      ) : lista.length === 0 ? (
        <p style={{ color: '#999' }}>Todavía no hay comentarios. ¡Sé el primero!</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map((f) => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>{f.autor || 'Usuario'}</strong>
                <Estrellas valor={f.calificacion} />
              </div>
              <p style={{ margin: '8px 0 4px', fontSize: 14, color: '#333', whiteSpace: 'pre-wrap' }}>{f.comentario}</p>
              <span style={{ fontSize: 12, color: '#999' }}>{fmtFecha(f.creado_en)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}