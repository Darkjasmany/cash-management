import { env } from "@/config/env";
import { toFixedCurrency } from "@/helpers";
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
// periodicidad
// 0	No calcula
// 1	Diario
// 2	Mensual
// 3	Trimestral
// 4	Semestral
// 5	Anual
// ─────────────────────────────────────────────────────────────
export function calcularInteresRedondeado(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: InteresisSiim[]
): number {
  // Validar base imponible inicial
  if (!baseImponible || baseImponible <= 0) return 0;

  // Validar la periodicidad del módulo
  const periodicidad = Number(modulo.periodicidad);
  if (periodicidad === 0) return 0; // 0 significa que no calcula interés

  const anioFactura = fechaCreacion.getFullYear();
  const anioCorte = fechaCorte.getFullYear();

  /// Forzar ID de módulo a número para evitar discrepancias de tipos
  const idModulo = Number(modulo.id);
  const esCatastro = idModulo === MODULO_CATASTRO_URBANO || idModulo === MODULO_CATASTRO_RURAL;

  // Exención por ley (COOTAD): El catastro del año actual no genera interés en el corte
  if (esCatastro && periodicidad === 5 && anioFactura === anioCorte) return 0;

  let periodoInicio = 0;

  if (periodicidad === 5) {
    // Según COOTAD, el interés predial arranca el 1 de Enero del año SIGUIENTE
    // Ejemplo: Factura de emisión 2025 -> Interés empieza en Enero de 2026 (202601) reforma al COOTAD
    // periodoInicio = (anioFactura + 1) * 100 + 1; // Habilitar si se quiere mantener como  en el cootad
    // periodoInicio = (anioFactura + 1) * 100;
    // 💡 AJUSTE PARA CUADRAR CON EL SIIM:
    // El sistema original empieza a contar los intereses desde Enero del año de la EMISIÓN.
    // Ejemplo: Factura Rural 2022 -> El periodo inicial de interés es Enero de 2022 (202201).
    periodoInicio = anioFactura * 100 + 1;
  } else if (periodicidad === 2) {
    // Lógica mensual estándar (Agua potable, etc.) -> Empieza el mes subsiguiente a la creación
    let anioInicio = fechaCreacion.getFullYear();
    let mesInicio = fechaCreacion.getMonth() + 1 + 1;

    if (mesInicio > 12) {
      mesInicio = 1;
      anioInicio += 1;
    }
    periodoInicio = anioInicio * 100 + mesInicio;
  }

  // Determinar el periodo final basado en la fecha de corte
  const anioFin = fechaCorte.getFullYear();
  const mesFin = fechaCorte.getMonth() + 1;
  const periodoFin = anioFin * 100 + mesFin;

  // Si la fecha de corte es menor al inicio de la generación de intereses, no aplica
  if (periodoFin < periodoInicio) return 0;

  // Filtrar y acumular los porcentajes de la tabla de intereses que caen en el rango
  const totalPorcentaje = intereses
    .filter(i => {
      const p = Number(i.ano) * 100 + Number(i.mes);
      return p >= periodoInicio && p <= periodoFin;
    })
    .reduce((acc, i) => acc + Number(i.porcentaje), 0);

  if (totalPorcentaje === 0) return 0;

  // Obtener el factor multiplicador del módulo (por si tiene recargos adicionales configurados)
  const factorModulo = (modulo.porcentaje || 0) / 100;

  // Cálculo final del interés
  const valorInteres = baseImponible * (totalPorcentaje / 100) * factorModulo;

  // Retornar el valor redondeado a 2 decimales usando tu helper financiero estándar
  return toFixedCurrency(valorInteres);
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
  // return Math.round(impuestoPredial * (porcentaje / 100) * -1 * 100) / 100;
  const descuento = impuestoPredial * (porcentaje / 100) * -1;
  return toFixedCurrency(descuento);
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
  // return Math.round(impuestoPredial * 0.1 * -1 * 100) / 100;
  const descuento = impuestoPredial * 0.1 * -1;
  return toFixedCurrency(descuento);
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
  idModulo: number
): number {
  const base = Number(impuestoPredial) || 0;
  if (base <= 0) return 0;

  // Aseguramos que el año sea número
  const anioFactura = Number(anioEmision);
  const anioActual = new Date().getFullYear();

  // La mora aplica solo si el año de emisión es menor al actual
  if (anioFactura >= anioActual) return 0;

  // Forzamos conversión a número en la comparación para evitar fallos de tipos (string vs number)
  const id = Number(idModulo);

  if (id === MODULO_CATASTRO_URBANO || id === MODULO_CATASTRO_RURAL) {
    // 10% de recargo legal
    // const mora = base * 0.1;
    // return Math.round(mora * 100) / 100;
    return toFixedCurrency(base * 0.1);
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
