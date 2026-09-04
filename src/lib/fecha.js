// Formatea una fecha ISO a la hora local de Honduras (America/Tegucigalpa).
// Se mantiene separada de App.jsx para poder probarla sin depender de React.
export function formatFecha(fechaISO) {
  const f = new Date(fechaISO)
  return f.toLocaleString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Solo la fecha (sin hora). Se usa en el mensaje de cobro por WhatsApp.
export function formatFechaCorta(fechaISO) {
  const f = new Date(fechaISO)
  return f.toLocaleDateString('es-HN', {
    timeZone: 'America/Tegucigalpa',
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
