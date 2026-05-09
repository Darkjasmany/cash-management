import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { FilaSiim, InteresisSiim, ModuloSiim } from "@/types";
import { GET_DEUDAS_SIIM_SQL } from "./queries/deuda.query";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

export async function getInteresesSiim(): Promise<InteresisSiim[]> {
  try {
    const res = await siimPool.query<InteresisSiim>(
      `SELECT ano, mes, porcentaje FROM intereses ORDER BY ano, mes`
    );
    return res.rows;
  } catch (error) {
    console.error("Error al obtener intereses del SIIM:", error);
    return [];
  }
}

export async function getModuloSiim(idModulo: number): Promise<ModuloSiim | null> {
  try {
    const res = await siimPool.query(
      `SELECT id, periodicidad, porcentaje,
            COALESCE("diasAdicionales", 0) AS "diasAdicionales"
     FROM modulo WHERE id = $1
    `,
      [idModulo]
    );
    return res.rows[0] || null;
  } catch (error) {
    console.error("Error al obtener configuración del módulo del SIIM:", error);
    return null;
  }
}

// Calcula intereses con redondeo a 2 decimales (HALF_UP) POR FACTURA
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

  // Fecha inicio = fechaCreacion + días adicionales
  const fechaInicio = new Date(fechaCreacion);
  fechaInicio.setDate(fechaInicio.getDate() + (modulo.diasAdicionales || 0));

  // Regla Java: catastro solo suma meses si el año de inicio es igual al año de corte
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
  for (const interes of intereses) {
    const periodoInteres = interes.ano * 100 + interes.mes;
    if (periodoInteres >= periodoEmision && periodoInteres <= periodoActual) {
      totalPorcentaje += interes.porcentaje || 0;
    }
  }

  if (totalPorcentaje === 0) return 0;

  const totalIntereses = (totalPorcentaje * ((modulo.porcentaje || 0) / 100)) / 100;
  const valorInteres = totalIntereses * baseImponible;

  // Redondeo igual que Java: new BigDecimal(...).setScale(2, RoundingMode.HALF_UP)
  return isNaN(valorInteres) ? 0 : Math.round(valorInteres * 100) / 100;
}

// Pronto pago: descuentos primer semestre (enero-junio), recargo segundo semestre solo urbano
export function calcularDescuentoRecargoProntoPago(
  basePredial: number,
  fechaCorte: Date,
  idModulo: number
): number {
  if (!basePredial || basePredial === 0) return 0;

  const mes = fechaCorte.getMonth(); // 0=Enero … 11=Diciembre
  const dia = fechaCorte.getDate();
  const esUrbano = idModulo === MODULO_CATASTRO_URBANO;
  const esRural = idModulo === MODULO_CATASTRO_RURAL;

  // Segundo semestre (julio a diciembre)
  if (mes >= 6) {
    if (esUrbano) {
      // Urbano: recargo fijo 10%
      return Math.round(basePredial * 0.1 * 100) / 100;
    }
    // Rural: sin recargo
    return 0;
  }

  // Primer semestre: tabla de descuentos quincenales (urbano y rural igual)
  const tablaDescuentos = [
    [10, 9], // Enero
    [8, 7], // Febrero
    [6, 5], // Marzo
    [4, 3], // Abril
    [3, 2], // Mayo
    [2, 1], // Junio
  ];

  const quincena = dia <= 15 ? 0 : 1;
  const porcentaje = tablaDescuentos[mes][quincena];
  const descuento = basePredial * (porcentaje / 100) * -1;
  return Math.round(descuento * 100) / 100;
}

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
