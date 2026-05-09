import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { FilaSiim, InteresisSiim, ModuloSiim } from "@/types";
import { GET_DEUDAS_SIIM_SQL } from "./queries/deuda.query";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ─────────────────────────────────────────────────────────────
// Obtiene la tabla de intereses del SIIM
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Obtiene configuración del módulo desde el SIIM
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Calcula intereses replicando CalculoInteres.java
//
// Lógica exacta del Java:
//   c.setTime(factura.getFechaCreacion())           → parte de fecha real
//   c.add(Calendar.DATE, modulo.getDiasAdicionales()) → suma días
//   if (esCatastro && anioFactura == anioActual)     → suma meses periodicidad
//   if (!esCatastro)                                 → siempre suma meses
//   periodoEmision = YYYYMM de c
//   periodoActual  = YYYYMM de fechaCorte
//   suma porcentajes donde periodoEmision ≤ periodo ≤ periodoActual
//   totalIntereses = (suma * (modulo.porcentaje / 100)) / 100
//   retorna totalIntereses * baseImponible
// ─────────────────────────────────────────────────────────────
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
    0: 0, // NO_CALCULA
    1: 0, // DIARIO — no aplica meses
    2: 1, // MENSUAL
    3: 3, // TRIMESTRAL
    4: 6, // SEMESTRAL
    5: 12, // ANUAL
  };

  const periodicidad = modulo.periodicidad;
  if (periodicidad === 0) return 0;

  const mesesPeriodo = PERIODICIDAD_MESES[periodicidad] ?? 1;

  // Fecha desde la cual empieza a contar el interés
  const fechaInicio = new Date(fechaCreacion);
  fechaInicio.setDate(fechaInicio.getDate() + (modulo.diasAdicionales || 0));

  // Regla Java: catastro solo sube meses si la factura es del año del corte
  const anioFactura = new Date(fechaCreacion).getFullYear();
  const anioCorte = fechaCorte.getFullYear();
  const subirMeses = !esCatastro || (esCatastro && anioFactura === anioCorte);

  if (subirMeses) {
    fechaInicio.setMonth(fechaInicio.getMonth() + mesesPeriodo);
  }

  // periodoEmision: YYYY como número
  const toPeriodo = (d: Date): number => d.getFullYear() * 100 + (d.getMonth() + 1);
  const periodoEmision = toPeriodo(fechaInicio);
  const periodoActual = toPeriodo(fechaCorte);

  if (periodoActual < periodoEmision) return 0; // Si aún no llega al periodo de corte, no hay interés

  //  Suma los porcentajes de interés del rango entre periodoEmision y periodoActual
  let totalPorcentaje = 0;
  for (const interes of intereses) {
    const periodoInteres = interes.ano * 100 + interes.mes;
    // Si el periodo del interés está entre el de emisión y el actual, se suma su porcentaje
    if (periodoInteres >= periodoEmision && periodoInteres <= periodoActual) {
      totalPorcentaje += interes.porcentaje || 0;
    }
  }

  if (totalPorcentaje === 0) return 0;

  // Fórmula idéntica al Java:
  // totalIntereses = (totalPorcentaje * (modulo.porcentaje / 100)) / 100
  const totalIntereses = (totalPorcentaje * ((modulo.porcentaje || 0) / 100)) / 100;
  const valorInteres = totalIntereses * baseImponible;

  // return Math.round(valorInteres * 100) / 100; // Redondear a 2 decimales
  return isNaN(valorInteres) ? 0 : Math.round(valorInteres * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Lógica de Pronto Pago (Descuentos Ene-Jun, Recargos Jul-Dic)
// Solo aplica para el año en curso (2026) en Predios.
//
// Base: base_predial_pura (impuesto predial + exoneración)
// Primer semestre  → descuento negativo escalonado por quincena
// Segundo semestre → recargo positivo fijo +10%
// ─────────────────────────────────────────────────────────────
export function calcularDescuentoRecargoProntoPago(basePredial: number, fechaCorte: Date): number {
  if (!basePredial || basePredial === 0) return 0;

  const mes = fechaCorte.getMonth(); // 0=Enero … 11=Diciembre
  const dia = fechaCorte.getDate();

  // Segundo Semestre (Julio a Diciembre): Recargo del 10% fijo
  if (mes >= 6) {
    return Math.round(basePredial * 0.1 * 100) / 100;
  }

  // Primer Semestre: Descuentos quincenales (10% a 1%)
  const tablaDescuentos = [
    [10, 9], // Enero (1ra q, 2da q)
    [8, 7], // Febrero
    [6, 5], // Marzo
    [4, 3], // Abril
    [3, 2], // Mayo
    [2, 1], // Junio
  ];

  const quincena = dia <= 15 ? 0 : 1;
  const porcentaje = tablaDescuentos[mes][quincena];

  // Es negativo porque es un descuento
  const descuento = basePredial * (porcentaje / 100) * -1;
  return Math.round(descuento * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Query principal: obtiene deudas del SIIM agrupadas por cliente
// Solo Catastro Urbano (1), Rural (2) y Agua Potable (34)
// ─────────────────────────────────────────────────────────────
export async function getDeudasSiim(fechaCorte: Date): Promise<FilaSiim[]> {
  const fechaStr = fechaCorte.toISOString().split("T")[0]; // Formato YYYY-MM-DD

  const sql = GET_DEUDAS_SIIM_SQL(fechaStr, {
    urbano: MODULO_CATASTRO_URBANO,
    rural: MODULO_CATASTRO_RURAL,
    agua: MODULO_AGUA_POTABLE,
  });

  const res = await siimPool.query<FilaSiim>(sql);
  return res.rows; // Devuelve un array de filas agrupadas por cliente con su deuda total y referencia
}
