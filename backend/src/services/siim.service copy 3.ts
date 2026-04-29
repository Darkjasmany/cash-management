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
    -- Columna CONTRA PARTIDA (Clave para predios, Cuenta para Agua)
    CASE 
        WHEN t.id_modulo IN (${MODULO_CATASTRO_URBANO}, ${MODULO_CATASTRO_RURAL}) THEN t.base_referencia 
        WHEN t.id_modulo = ${MODULO_AGUA_POTABLE} THEN t.base_referencia
        ELSE t.base_referencia
    END AS contrapartida,
    -- Columna REFERENCIA (Años para predios, Detalle completo para Agua)
    CASE 
        WHEN t.id_modulo = ${MODULO_CATASTRO_URBANO} THEN 'Catastro urbano. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = ${MODULO_CATASTRO_RURAL} THEN 'Catastro rural. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = ${MODULO_AGUA_POTABLE} THEN 'Módulo de AA.PP. Medidor: ' || t.extra_info_2 || ' Ruta: ' || t.extra_info_1 || ' Emisiones: ' || STRING_AGG(DISTINCT t.periodo, ', ')
        ELSE t.base_referencia
    END AS referencia,
    ROUND(SUM(t.valor)::numeric, 2) AS total_deuda,
    MAX(t.fecha_emision) AS fecha_emision_max
FROM (
    -- ── CATASTRO URBANO (Módulo 1) ──────────────────────────
  SELECT
        c.id AS id_cliente, c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        f.id_modulo, fd."fechaCreacion" AS fecha_emision,
        EXTRACT(YEAR FROM fd."fechaCreacion")::text AS periodo,
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2) AS valor,
        COALESCE(
          (SELECT CONCAT(pro.codigo, can.codigo, par.codigo, BTRIM(zon.codigo), BTRIM(sec.codigo), BTRIM(pol.codigo), BTRIM(pre.predio))
           FROM provincia pro, canton can, parroquia par, zona zon, sector sec, poligono pol, predio pre
           WHERE pro.id::text = can.id_provincia::text AND can.id::text = par.id_canton::text
             AND par.id::text = zon.id_parroquia::text AND zon.id::text = sec.id_zona::text
             AND sec.id::text = pol.id_sector::text AND pol.id::text = pre.id_poligono::text
             AND pre.id = la.id_predio
          ), ''
        ) AS base_referencia,
        '' AS extra_info_1, '' AS extra_info_2
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN cliente c ON c.id = f."idPropietarioEmision"
    JOIN liquidacion_avaluo la ON la.id_factura = f.id
    WHERE f.id_modulo = ${MODULO_CATASTRO_URBANO}
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      -- BLOQUEO TOTAL SI EL PREDIO TIENE ALGUNA FACTURA EN COACTIVA
      AND NOT EXISTS (
          SELECT 1 FROM liquidacion_avaluo la2
          INNER JOIN coactiva_factura cf ON cf.id_factura = la2.id_factura
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva
          WHERE la2.id_predio = la.id_predio AND ca.estado = 1
      )

    UNION ALL
    -- ── CATASTRO RURAL (Módulo 2) ───────────────────────────
  SELECT
        c.id, c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END,
        TRIM(c.apellido || ' ' || c.nombre),
        f.id_modulo, fd."fechaCreacion",
        EXTRACT(YEAR FROM fd."fechaCreacion")::text,
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2),
        COALESCE(
          (SELECT CONCAT(pro.codigo, can.codigo, par.codigo, BTRIM(zon.codigo), BTRIM(sec.codigo), BTRIM(pol.codigo), BTRIM(pre.predio))
           FROM provincia pro, canton can, parroquia par, zona_rural zon, sector_rural sec, poligono_rural pol, predio_rural pre
           WHERE pro.id::text = can.id_provincia::text AND can.id::text = par.id_canton::text
             AND par.id::text = zon.id_parroquia::text AND zon.id::text = sec.id_zona::text
             AND sec.id::text = pol.id_sector::text AND pol.id::text = pre.id_poligono::text
             AND pre.id = lar.id_predio_rural
          ), ''
        ),
        '', ''
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN cliente c ON c.id = f."idPropietarioEmision"
    JOIN liquidacion_avaluo_rural lar ON lar.id_factura = f.id
    WHERE f.id_modulo = ${MODULO_CATASTRO_RURAL}
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      -- BLOQUEO TOTAL SI EL PREDIO RURAL TIENE ALGUNA FACTURA EN COACTIVA
      AND NOT EXISTS (
          SELECT 1 FROM liquidacion_avaluo_rural lar2
          INNER JOIN coactiva_factura cf ON cf.id_factura = lar2.id_factura
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva
          WHERE lar2.id_predio_rural = lar.id_predio_rural AND ca.estado = 1
      )

    UNION ALL
    -- ── AGUA POTABLE (Módulo 3) ────────────────────────────
 SELECT
        c.id AS id_cliente, c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        f.id_modulo, fd."fechaCreacion" AS fecha_emision,
        ae.emision AS periodo,
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2) AS valor,
        a.id::text AS base_referencia,
        ru.descripcion AS extra_info_1,
        COALESCE(a."nroMedidor", '0') AS extra_info_2
    FROM factura f
    INNER JOIN agua_liquidacion al ON al.id_factura = f.id
    INNER JOIN agua_emision_ruta aer ON aer.id = al.id_emision_ruta
    INNER JOIN agua_emision ae ON ae.id = aer.id_agua_emision
    INNER JOIN ruta ru ON ru.id = aer.id_ruta
    INNER JOIN factura_detalle fd ON fd.id_factura = f.id
    INNER JOIN rubro r ON r.id = fd.id_rubro
    INNER JOIN abonado a ON a.id = al.id_abonado
    INNER JOIN cliente c ON c.id = a."abonadoCliente"
    WHERE f.id_modulo = ${MODULO_AGUA_POTABLE}
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND lower(r.descripcion) NOT LIKE 'interes%'
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      -- BLOQUEO TOTAL SI LA CUENTA (ABONADO) TIENE ALGUNA FACTURA EN COACTIVA
      AND NOT EXISTS (
          SELECT 1 FROM agua_liquidacion al2
          INNER JOIN coactiva_factura cf ON cf.id_factura = al2.id_factura
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva
          WHERE al2.id_abonado = a.id AND ca.estado = 1
      )

) t
GROUP BY
    t.id_cliente, t.cedula, t.tipo_id, t.nombre_cliente,
    t.id_modulo, t.base_referencia, t.extra_info_1, t.extra_info_2
ORDER BY t.nombre_cliente;
  `;

  const res = await siimPool.query<FilaSiim>(sql);
  return res.rows; // Devuelve un array de filas agrupadas por cliente con su deuda total y referencia
}
