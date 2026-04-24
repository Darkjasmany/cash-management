import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { InteresisSiim, ModuloSiim } from "@/types";

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
export function calcularInteres() {}
