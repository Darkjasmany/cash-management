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
// Calcula intereses según la lógica del CalculoInteres.java
// Replica la lógica: suma porcentajes de intereses entre
// periodoEmision y periodoActual, aplica porcentaje del módulo.
// ─────────────────────────────────────────────────────────────
export function calcularInteres(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: InteresisSiim[]
): number {
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

  // Fecha desde la cual empieza a contar el interés
  const fechaInicio = new Date(fechaCreacion);
  fechaInicio.setDate(fechaInicio.getDate() + modulo.diasAdicionales);

  // Suma los meses de periodicidad (mismo que _hmPeriodicidad en Java)
  const mesesPeriodo = PERIODICIDAD_MESES[periodicidad] ?? 1;
  fechaInicio.setMonth(fechaInicio.getMonth() + mesesPeriodo);

  // periodoEmision: YYYY como número
  const toPeriodo = (d: Date): number => d.getFullYear() * 100 + (d.getMonth() + 1);

  const periodoEmision = toPeriodo(fechaInicio);
  const periodoActual = toPeriodo(fechaCorte);

  if (periodoActual - periodoEmision) return 0; // Si aún no llega al periodo de corte, no hay interés

  //  Suma los porcentajes de interés del rango entre periodoEmision y periodoActual
  let totalPorcentaje = 0;
  for (const interes of intereses) {
    const periodoInteres = interes.ano * 100 + interes.mes;
    // Si el periodo del interés está entre el de emisión y el actual, se suma su porcentaje
    if (periodoInteres >= periodoEmision && periodoInteres <= periodoActual) {
      totalPorcentaje += interes.porcentaje;
    }
  }

  // Aplica el porcentaje del módulo al total de intereses acumulados
  const factorModulo = (modulo.porcentaje / 100) * 100; // Convertir a factor (ej. 20% -> 0.20)
  const valorInteres = totalPorcentaje * factorModulo * baseImponible; // Interés = Base Imponible * (Suma % Intereses) * (Factor del Módulo)

  return Math.round(valorInteres * 100) / 100; // Redondear a 2 decimales
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
