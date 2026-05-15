// ─────────────────────────────────────────────────────────────
// Función centralizada para redondeo
// ─────────────────────────────────────────────────────────────

export function toFixedCurrency(valor: number): number {
  const signo = valor >= 0 ? 1 : -1;
  // El uso de Number.EPSILON asegura que 2.725 se convierta en 2.73 y no se quede en 2.72
  return (Math.round((Math.abs(valor) + Number.EPSILON) * 100) / 100) * signo;
}
