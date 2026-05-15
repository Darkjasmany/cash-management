// ─────────────────────────────────────────────────────────────
// Función centralizada para redondeo
// ─────────────────────────────────────────────────────────────
export function toFixedCurrency(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
