export const GET_DEUDAS_SIIM_SQL = (
  fechaStr: string,
  modulos: { urbano: number; rural: number; agua: number }
) => {
  return `
    SELECT
    t.id_cliente,
    t.cedula,
    t.tipo_id,
    t.nombre_cliente,
    t.id_modulo,
    -- Columna CONTRA PARTIDA (Clave para predios, Cuenta para Agua)
    CASE 
        WHEN t.id_modulo IN (${modulos.urbano}, ${modulos.rural}) THEN t.base_referencia 
        WHEN t.id_modulo = ${modulos.agua} THEN t.base_referencia
        ELSE t.base_referencia
    END AS contrapartida,
    -- Columna REFERENCIA (Años para predios, Detalle completo para Agua)
    CASE 
        WHEN t.id_modulo = ${modulos.urbano} THEN 'Catastro urbano. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = ${modulos.rural} THEN 'Catastro rural. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = ${modulos.agua} THEN 'Módulo de AA.PP. Medidor: ' || t.extra_info_2 || ' Ruta: ' || t.extra_info_1 || ' Emisiones: ' || STRING_AGG(DISTINCT t.periodo, ', ')
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
    WHERE f.id_modulo = ${modulos.urbano}
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
    WHERE f.id_modulo = ${modulos.rural}
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
    WHERE f.id_modulo = ${modulos.agua}
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
};
