import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { FilaSiim, InteresisSiim, ModuloSiim, RubroSiim } from "@/types";
import { GET_DEUDAS_SIIM_SQL } from "./queries/deuda.query";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ---------------------------------------------------------------------
// Obtener tabla de intereses mensuales
// ---------------------------------------------------------------------
export async function getInteresesSiim(): Promise<InteresisSiim[]> {
  try {
    const res = await siimPool.query<InteresisSiim>(
      `SELECT ano, mes, porcentaje FROM intereses ORDER BY ano, mes`
    );
    return res.rows;
  } catch (error) {
    console.error("Error al obtener intereses:", error);
    return [];
  }
}

// ---------------------------------------------------------------------
// Obtener configuración de un módulo
// ---------------------------------------------------------------------
export async function getModuloSiim(idModulo: number): Promise<ModuloSiim | null> {
  try {
    const res = await siimPool.query(
      `SELECT id, periodicidad, porcentaje,
              COALESCE("diasAdicionales", 0) AS "diasAdicionales"
       FROM modulo WHERE id = $1`,
      [idModulo]
    );
    return res.rows[0] || null;
  } catch (error) {
    console.error("Error al obtener módulo:", error);
    return null;
  }
}

// ---------------------------------------------------------------------
// Obtener rubro de mora según módulo: 302 = urbano, 303 = rural
// ---------------------------------------------------------------------
export async function getRubroMoraByModulo(idModulo: number): Promise<RubroSiim | null> {
  const rubroId = idModulo === MODULO_CATASTRO_URBANO ? 302 : 303;
  try {
    const res = await siimPool.query<RubroSiim>(
      `SELECT id, calculable, valor, descripcion FROM rubro WHERE id = $1`,
      [rubroId]
    );
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Error al obtener rubro de mora ${rubroId}:`, error);
    return null;
  }
}

// ---------------------------------------------------------------------
// Cálculo de intereses (exactamente igual al Java)
// ---------------------------------------------------------------------
export function calcularInteres(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: InteresisSiim[],
  esCatastro: boolean = false
): number {
  if (!baseImponible || baseImponible <= 0) return 0;

  const PERIODICIDAD_MESES: Record<number, number> = {
    0: 0,
    1: 0,
    2: 1,
    3: 3,
    4: 6,
    5: 12,
  };
  const periodicidad = modulo.periodicidad;
  if (periodicidad === 0) return 0;
  const mesesPeriodo = PERIODICIDAD_MESES[periodicidad] ?? 1;

  const fechaInicio = new Date(fechaCreacion);
  fechaInicio.setDate(fechaInicio.getDate() + (modulo.diasAdicionales || 0));

  const anioInicio = fechaInicio.getFullYear();
  const anioCorte = fechaCorte.getFullYear();
  const subirMeses = !esCatastro || (esCatastro && anioInicio === anioCorte);

  if (subirMeses) {
    fechaInicio.setMonth(fechaInicio.getMonth() + mesesPeriodo);
  }

  const toPeriodo = (d: Date): number => d.getFullYear() * 100 + (d.getMonth() + 1);
  const periodoEmision = toPeriodo(fechaInicio);
  const periodoActual = toPeriodo(fechaCorte);

  if (periodoActual < periodoEmision) return 0;

  let totalPorcentaje = 0;
  for (const i of intereses) {
    const p = i.ano * 100 + i.mes;
    if (p >= periodoEmision && p <= periodoActual) {
      totalPorcentaje += i.porcentaje || 0;
    }
  }
  if (totalPorcentaje === 0) return 0;

  const totalIntereses = (totalPorcentaje * ((modulo.porcentaje || 0) / 100)) / 100;
  const valorInteres = totalIntereses * baseImponible;
  return isNaN(valorInteres) ? 0 : Math.round(valorInteres * 100) / 100;
}

// ---------------------------------------------------------------------
// Pronto pago para URBANO (descuentos quincenales o recargo fijo 10%)
// ---------------------------------------------------------------------
export function calcularDescuentoUrbano(basePredial: number, anioEmision: number): number {
  if (basePredial <= 0) return 0;
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  if (anioEmision !== anioActual) return 0;

  const mes = ahora.getMonth();
  const dia = ahora.getDate();

  if (mes >= 6) {
    return Math.round(basePredial * 0.1 * 100) / 100;
  }

  const tabla = [
    [10, 9],
    [8, 7],
    [6, 5],
    [4, 3],
    [3, 2],
    [2, 1],
  ];
  const quincena = dia <= 15 ? 0 : 1;
  const porcentaje = tabla[mes][quincena];
  const descuento = basePredial * (porcentaje / 100) * -1;
  return Math.round(descuento * 100) / 100;
}

// ---------------------------------------------------------------------
// Pronto pago RURAL (descuento fijo 10% solo primer semestre, sin recargo)
// ---------------------------------------------------------------------
export function calcularDescuentoRural(basePredial: number, anioEmision: number): number {
  if (basePredial <= 0) return 0;
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  if (anioEmision !== anioActual) return 0;

  const mes = ahora.getMonth();
  if (mes >= 6) return 0;
  const descuento = basePredial * 0.1 * -1;
  return Math.round(descuento * 100) / 100;
}

// ---------------------------------------------------------------------
// Cálculo de MORA según rubro (302 urbano, 303 rural)
// ---------------------------------------------------------------------
export async function calcularMora(
  baseMora: number,
  anioEmision: number,
  idModulo: number
): Promise<number> {
  if (baseMora <= 0) return 0;
  const anioActual = new Date().getFullYear();
  if (anioEmision >= anioActual) return 0;

  const rubroMora = await getRubroMoraByModulo(idModulo);
  if (!rubroMora) return 0;

  let mora = 0;
  if (rubroMora.calculable === 1) {
    mora = baseMora * (rubroMora.valor / 100);
  } else if (rubroMora.calculable === 0) {
    mora = rubroMora.valor;
  }
  return Math.round(mora * 100) / 100;
}

// ---------------------------------------------------------------------
// Query principal (obtiene solo rubros base, sin intereses ni mora/descuentos)
// ---------------------------------------------------------------------
export async function getDeudasSiim(fechaCorte: Date): Promise<FilaSiim[]> {
  const fechaStr = fechaCorte.toISOString().split("T")[0];
  const sql = GET_DEUDAS_SIIM_SQL(fechaStr, {
    urbano: MODULO_CATASTRO_URBANO,
    rural: MODULO_CATASTRO_RURAL,
    agua: MODULO_AGUA_POTABLE,
  });
  const res = await siimPool.query<FilaSiim>(sql);
  return res.rows;
}
