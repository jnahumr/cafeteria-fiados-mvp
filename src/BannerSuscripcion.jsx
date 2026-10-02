import { useState } from 'react'
import { calcularAviso, enlacePago, WHATSAPP_SOPORTE } from './lib/suscripcion'

// Barra de aviso cuando la prueba o la suscripción están por vencer.
// El bloqueo real lo hace la base de datos; esto solo avisa.
export default function BannerSuscripcion({ suscripcion, esPropietario, nombreNegocio }) {
  const [oculto, setOculto] = useState(false)
  const aviso = calcularAviso(suscripcion)
  if (!aviso || oculto) return null

  const enlace = enlacePago({ telefono: WHATSAPP_SOPORTE, nombreNegocio })
  const urgente = aviso.nivel === 'urgente'

  return (
    <div className={`aviso-sub ${urgente ? 'aviso-sub-urgente' : ''}`}>
      <span className="aviso-sub-icono" aria-hidden="true">⚠</span>
      <span className="aviso-sub-texto">
        {aviso.texto}
        {!esPropietario && <span className="aviso-sub-nota"> · avisale al propietario</span>}
      </span>
      {esPropietario && enlace && (
        <a className="aviso-sub-btn" href={enlace} target="_blank" rel="noopener noreferrer">
          Suscribirme
        </a>
      )}
      {!urgente && (
        <button type="button" className="aviso-sub-cerrar" aria-label="Ocultar aviso" onClick={() => setOculto(true)}>
          ×
        </button>
      )}
    </div>
  )
}
