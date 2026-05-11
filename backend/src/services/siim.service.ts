import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { FilaSiim, InteresisSiim, ModuloSiim } from "@/types";
import { GET_DEUDAS_SIIM_SQL } from "./queries/deuda.query";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ─────────────────────────────────────────────────────────────
// Tabla de intereses mensuales
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Configuración del módulo (periodicidad, porcentaje, días adicionales)
// ─────────────────────────────────────────────────────────────
export async function getModuloSiim(idModulo: number): Promise<ModuloSiim | null> {
  try {
    const res = await siimPool.query<ModuloSiim>(
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

// ─────────────────────────────────────────────────────────────
// Calcula intereses — replica exactamente CalculoInteres.java
//
// Devuelve valor SIN redondear para no acumular error
// cuando se suman muchas facturas del mismo grupo.
// El redondeo se aplica solo al total final del grupo.
//
// Regla catastro (Java):
//   if (esCatastro && anioFactura == anioCorte) → suma meses periodicidad
//   if (!esCatastro) → siempre suma meses
//   Facturas de años anteriores en catastro: NO suma meses
//   → el interés empieza desde la fechaCreacion directamente
// ─────────────────────────────────────────────────────────────

export function calcularInteresExacto(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: InteresisSiim[],
  esCatastro: boolean = false,
  debugId?: number
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

  // ✅ CORRECCIÓN: usar año de fechaInicio para decidir si sumar meses
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

  // Log de depuración (actívalo poniendo DEBUG_INTERES=true en .env)
  if (process.env.DEBUG_INTERES === "true") {
    console.log(`[Interés] id=${debugId ?? "?"} base=${baseImponible.toFixed(4)}`);
    console.log(`  fechaInicio=${fechaInicio.toISOString()} subirMeses=${subirMeses}`);
    console.log(`  periodoEmision=${periodoEmision} periodoActual=${periodoActual}`);
    console.log(`  totalPorcentaje=${totalPorcentaje} modulo.porcentaje=${modulo.porcentaje}`);
    console.log(`  totalIntereses=${totalIntereses} valorInteres=${valorInteres.toFixed(4)}`);
  }

  return isNaN(valorInteres) ? 0 : valorInteres;
}

export function calcularInteresRedondeado(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: InteresisSiim[],
  esCatastro: boolean = false,
  debugId?: number
): number {
  const exact = calcularInteresExacto(
    baseImponible,
    fechaCreacion,
    fechaCorte,
    modulo,
    intereses,
    esCatastro,
    debugId
  );
  return Math.round(exact * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Descuento pronto pago URBANO
// Aplica solo en el año actual del servidor
// Primer semestre: descuento escalonado quincenal (negativo)
// Segundo semestre: recargo fijo +10% (positivo)
// ─────────────────────────────────────────────────────────────
export function calcularDescuentoUrbano(impuestoPredial: number, anioEmision: number): number {
  if (impuestoPredial <= 0) return 0;
  const ahora = new Date();
  if (anioEmision !== ahora.getFullYear()) return 0;
  const mes = ahora.getMonth(); // 0=Enero
  const dia = ahora.getDate();

  // Segundo semestre → recargo +10%
  if (mes >= 6) return Math.round(impuestoPredial * 0.1 * 100) / 100;

  // Primer semestre → descuento negativo quincenal
  const tabla: [number, number][] = [
    [10, 9],
    [8, 7],
    [6, 5],
    [4, 3],
    [3, 2],
    [2, 1],
  ];
  const quincena = dia <= 15 ? 0 : 1;
  const porcentaje = tabla[mes][quincena];
  return Math.round(impuestoPredial * (porcentaje / 100) * -1 * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Descuento pronto pago RURAL (usa fecha actual)
// Solo primer semestre → descuento fijo 10% (negativo)
// Segundo semestre → 0 (no hay recargo en rural)
// ─────────────────────────────────────────────────────────────
export function calcularDescuentoRural(impuestoPredial: number, anioEmision: number): number {
  if (impuestoPredial <= 0) return 0;
  const ahora = new Date();
  if (anioEmision !== ahora.getFullYear()) return 0;
  const mes = ahora.getMonth();
  // Rural no tiene recargo segundo semestre
  if (mes >= 6) return 0;
  // Descuento fijo 10%
  return Math.round(impuestoPredial * 0.1 * -1 * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Mora (catastro años anteriores)
// Se calcula sobre base_predial_pura de facturas anteriores al año actual
// Urbano: 10% del impuesto predial
// Rural:  10% del impuesto predial
// Solo aplica para facturas de años ANTERIORES al año del corte
// ─────────────────────────────────────────────────────────────
export function calcularMora(
  impuestoPredial: number,
  anioEmision: number,
  fechaCorte: Date
): number {
  const base = Number(impuestoPredial);
  if (base <= 0) return 0;

  const anioCorte = fechaCorte.getFullYear();

  // if (anioEmision >= anioCorte) return 0; // solo años anteriores
  // return Math.round(impuestoPredial * 0.1 * 100) / 100;

  // Si la factura es de años anteriores (ej: factura 2025 y corte 2026)
  if (anioEmision < anioCorte) {
    // 10% de recargo por mora
    return Math.round(base * 0.1 * 100) / 100;
  }

  return 0;
}

export function calcularMoraSimple(impuestoPredial: number, anioEmision: number): number {
  if (impuestoPredial <= 0) return 0;
  const anioActual = new Date().getFullYear();
  if (anioEmision >= anioActual) return 0;
  // Porcentaje fijo: 10% (ajusta si tu municipio usa otro valor, ej. 0.05 para 5%)
  const mora = impuestoPredial * 0.1;
  return Math.round(mora * 100) / 100;
}

export function calcularMoraRedondeada(
  impuestoPredial: number,
  anioEmision: number,
  idModulo: number
): number {
  const base = Number(impuestoPredial) || 0;
  if (base <= 0) return 0;

  // Aseguramos que el año sea número
  const anioFactura = Number(anioEmision);
  const anioActual = new Date().getFullYear();

  // En Naranjal, la mora aplica solo si el año de emisión es menor al actual
  if (anioFactura >= anioActual) return 0;

  // Forzamos conversión a número en la comparación para evitar fallos de tipos (string vs number)
  const id = Number(idModulo);
  const URBANO = Number(MODULO_CATASTRO_URBANO);
  const RURAL = Number(MODULO_CATASTRO_RURAL);

  if (id === URBANO || id === RURAL) {
    const mora = base * 0.1; // 10% de recargo legal
    return Math.round(mora * 100) / 100;
  }

  return 0;
}
// -------------------------------------------------------------------
// Consulta principal (facturas individuales)
// -------------------------------------------------------------------
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
