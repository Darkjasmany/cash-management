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
// Obtener un rubro por ID (para mora, coactiva, etc.)
// ---------------------------------------------------------------------
export async function getRubroById(idRubro: number): Promise<RubroSiim | null> {
  try {
    const res = await siimPool.query<RubroSiim>(
      `SELECT id, calculable, valor, descripcion FROM rubro WHERE id = $1`,
      [idRubro]
    );
    return res.rows[0] || null;
  } catch (error) {
    console.error(`Error al obtener rubro ${idRubro}:`, error);
    return null;
  }
}

// ---------------------------------------------------------------------
// Obtener parámetros de configuración (CALCULA_MORA_COACTIVA_URBANO, etc.)
// ---------------------------------------------------------------------
export async function getConfigParametro(nombre: string): Promise<string | null> {
  try {
    const res = await siimPool.query(`SELECT valor FROM siim_parametros WHERE nombre = $1`, [
      nombre,
    ]);
    return res.rows[0]?.valor || null;
  } catch (error) {
    console.error(`Error al obtener parámetro ${nombre}:`, error);
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

  // Regla crítica: para catastro, solo se suman meses si el año de inicio == año de corte
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
export function calcularDescuentoUrbano(
  basePredial: number,
  fechaCorte: Date,
  anioEmision: number
): number {
  if (basePredial <= 0) return 0;
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  if (anioEmision !== anioActual) return 0;

  const mes = ahora.getMonth();
  const dia = ahora.getDate();

  if (mes >= 6) {
    // Recargo 10% en segundo semestre
    return Math.round(basePredial * 0.1 * 100) / 100;
  }

  // Descuentos quincenales primer semestre
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
export function calcularDescuentoRural(
  basePredial: number,
  fechaCorte: Date,
  anioEmision: number
): number {
  if (basePredial <= 0) return 0;
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  if (anioEmision !== anioActual) return 0;

  const mes = ahora.getMonth();
  // Solo aplica descuento si estamos en primer semestre (enero-junio)
  if (mes >= 6) return 0;

  // Descuento fijo del 10%
  const descuento = basePredial * 0.1 * -1;
  return Math.round(descuento * 100) / 100;
}

// ---------------------------------------------------------------------
// Cálculo de MORA (rubro 303) y COACTIVA (rubro 295 o 296 según módulo)
// ---------------------------------------------------------------------
export async function calcularMoraCoactiva(
  totalSinMora: number, // totalFactura sin incluir mora ni coactiva
  valorImpuesto: number,
  valorExoneracion: number,
  idModulo: number,
  anioEmision: number
): Promise<{ mora: number; coactiva: number }> {
  let mora = 0;
  let coactiva = 0;

  // Verificar si la configuración está activa
  const configKey =
    idModulo === MODULO_CATASTRO_URBANO
      ? "CALCULA_MORA_COACTIVA_URBANO"
      : "CALCULA_MORA_COACTIVA_RURAL";
  const activo = await getConfigParametro(configKey);
  if (activo !== "true") return { mora, coactiva };

  const anioActual = new Date().getFullYear();
  // Según Java, solo aplica si la factura es de años anteriores
  if (anioEmision >= anioActual) return { mora, coactiva };

  const rubroMora = await getRubroById(303);
  const rubroCoactivaId = idModulo === MODULO_CATASTRO_URBANO ? 296 : 295;
  const rubroCoactiva = await getRubroById(rubroCoactivaId);

  // Mora: (impuesto + exoneración) * porcentaje
  if (rubroMora && rubroMora.calculable === 1) {
    mora = (valorImpuesto + valorExoneracion) * (rubroMora.valor / 100);
    mora = Math.round(mora * 100) / 100;
  } else if (rubroMora && rubroMora.calculable === 0) {
    mora = rubroMora.valor;
  }

  // Coactiva: sobre (totalSinMora + mora) * porcentaje
  if (rubroCoactiva && rubroCoactiva.calculable === 1) {
    coactiva = (totalSinMora + mora) * (rubroCoactiva.valor / 100);
    coactiva = Math.round(coactiva * 100) / 100;
  } else if (rubroCoactiva && rubroCoactiva.calculable === 0) {
    coactiva = rubroCoactiva.valor;
  }

  return { mora, coactiva };
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
