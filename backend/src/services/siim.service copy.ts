import { env } from "@/config/env";
import { siimPool } from "@/lib/db";
import type { FilaSiim, InteresisSiim, ModuloSiim } from "@/types";

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

  const sql = `
    SELECT
      t.id_cliente,
      t.cedula,
      t.tipo_id,
      t.nombre_cliente,
      t.id_modulo,
      t.referencia,
      ROUND(SUM(t.valor)::numeric, 2) AS total_deuda,
      MAX(t.fecha_emision) AS fecha_emision_max
    FROM (

      -- ── CATASTRO URBANO (módulo 1) ──────────────────────────
      SELECT
        c.id                AS id_cliente,
        c.cedula,
        CASE  
          WHEN LENGTH(c.cedula) = 10 THEN 'C'
          WHEN LENGTH(c.cedula) = 13 THEN 'R'
          ELSE 'P'
        END AS tipo_id,
        TRIM((c.apellido || ' ' || c.nombre)) AS nombre_cliente,
        f.id_modulo,
        fd."fechaCreacion"  AS fecha_emision,
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2) AS valor,
        COALESCE(
          (SELECT CONCAT(
             pro.codigo, can.codigo, par.codigo,
             BTRIM(zon.codigo), BTRIM(sec.codigo),
             BTRIM(pol.codigo), BTRIM(pre.predio), ' urbano'
           )
           FROM provincia pro, canton can, parroquia par,
                zona zon, sector sec, poligono pol, predio pre
           WHERE pro.id::text = can.id_provincia::text
             AND can.id::text = par.id_canton::text
             AND par.id::text = zon.id_parroquia::text
             AND zon.id::text = sec.id_zona::text
             AND sec.id::text = pol.id_sector::text
             AND pol.id::text = pre.id_poligono::text
             AND pre.id = la.id_predio
          ), ''
        ) AS referencia
      FROM factura f
      JOIN factura_detalle fd  ON fd.id_factura = f.id
      JOIN rubro r             ON r.id = fd.id_rubro
      JOIN cliente c           ON c.id = f."idPropietarioEmision"
      JOIN liquidacion_avaluo la ON la.id_factura = f.id
      WHERE f.id_modulo = ${MODULO_CATASTRO_URBANO}
        AND fd."valorUnitario" <> 0
        AND r.id_rubro_tipo <> 6
        AND fd."fechaCreacion" <= '${fechaStr}'
        AND f."convenioPago" = 0
        AND (
          (f.estado = 1 AND fd.estado = 1)
          OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0)
          OR f.estado = 3
        )
        AND (
          f.pagado = 0
          OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}')
          OR (f.pagado = 1 AND f."fechaCobro" <= '${fechaStr}' AND f.estado = 3)
        )

      UNION ALL

      -- ── CATASTRO RURAL (módulo 2) ───────────────────────────
      SELECT
        c.id, c.cedula,
         CASE  
          WHEN LENGTH(c.cedula) = 10 THEN 'C'
          WHEN LENGTH(c.cedula) = 13 THEN 'R'
          ELSE 'P'
        END,
        TRIM((c.apellido || ' ' || c.nombre)),
        f.id_modulo,
        fd."fechaCreacion",
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2),
        COALESCE(
          (SELECT CONCAT(
             pro.codigo, can.codigo, par.codigo,
             BTRIM(zon.codigo), BTRIM(sec.codigo),
             BTRIM(pol.codigo), BTRIM(pre.predio), ' rural'
           )
           FROM provincia pro, canton can, parroquia par,
                zona_rural zon, sector_rural sec, poligono_rural pol, predio_rural pre
           WHERE pro.id::text = can.id_provincia::text
             AND can.id::text = par.id_canton::text
             AND par.id::text = zon.id_parroquia::text
             AND zon.id::text = sec.id_zona::text
             AND sec.id::text = pol.id_sector::text
             AND pol.id::text = pre.id_poligono::text
             AND pre.id = lar.id_predio_rural
          ), ''
        )
      FROM factura f
      JOIN factura_detalle fd  ON fd.id_factura = f.id
      JOIN rubro r             ON r.id = fd.id_rubro
      JOIN cliente c           ON c.id = f."idPropietarioEmision"
      JOIN liquidacion_avaluo_rural lar ON lar.id_factura = f.id
      WHERE f.id_modulo = ${MODULO_CATASTRO_RURAL}
        AND fd."valorUnitario" <> 0
        AND r.id_rubro_tipo <> 6
        AND fd."fechaCreacion" <= '${fechaStr}'
        AND f."convenioPago" = 0
        AND (
          (f.estado = 1 AND fd.estado = 1)
          OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0)
          OR f.estado = 3
        )
        AND (
          f.pagado = 0
          OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}')
          OR (f.pagado = 1 AND f."fechaCobro" <= '${fechaStr}' AND f.estado = 3)
        )

      UNION ALL

      -- ── AGUA POTABLE (módulo 3) ────────────────────────────
      SELECT
        c.id, c.cedula,
        CASE  
          WHEN LENGTH(c.cedula) = 10 THEN 'C'
          WHEN LENGTH(c.cedula) = 13 THEN 'R'
          ELSE 'P'
        END,
        TRIM((c.apellido || ' ' || c.nombre)),
        f.id_modulo,
        fd."fechaCreacion",
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2),
        COALESCE(a."direccionUbicacion", '') AS referencia
      FROM factura f
      JOIN factura_detalle fd    ON fd.id_factura = f.id
      JOIN rubro r               ON r.id = fd.id_rubro
      JOIN cliente c             ON c.id = f."idPropietarioEmision"
      JOIN agua_liquidacion al   ON al.id_factura = f.id
      JOIN abonado a             ON a.id = al.id_abonado
      WHERE f.id_modulo = ${MODULO_AGUA_POTABLE}
        AND fd."valorUnitario" <> 0
        AND r.id_rubro_tipo <> 6
        AND fd."fechaCreacion" <= '${fechaStr}'
        AND f."convenioPago" = 0
        AND (
          (f.estado = 1 AND fd.estado = 1)
          OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0)
          OR f.estado = 3
        )
        AND (
          f.pagado = 0
          OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}')
          OR (f.pagado = 1 AND f."fechaCobro" <= '${fechaStr}' AND f.estado = 3)
        )

    ) t
    GROUP BY
      t.id_cliente, t.cedula, t.tipo_id, t.nombre_cliente,
      t.id_modulo, t.referencia
    ORDER BY t.nombre_cliente
  `;

  const res = await siimPool.query<FilaSiim>(sql);
  return res.rows; // Devuelve un array de filas agrupadas por cliente con su deuda total y referencia
}
