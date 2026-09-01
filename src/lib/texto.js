// Quita acentos para que "Maria" también encuentre a "María".
// Sin esto, la dueña tendría que escribir la tilde exacta para hallar al cliente.
export function sinAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
