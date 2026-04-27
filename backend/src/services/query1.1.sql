-- Consulta unificada para obtener deudas por cliente en los módulos de Catastro Urbano, Catastro Rural y Agua Potable NO INCLUYE CARTAS DE COACTIVA

SELECT
    t.id_cliente,
    t.cedula,
    t.tipo_id,
    t.nombre_cliente,
    t.id_modulo,
    -- Columna CONTRA PARTIDA (Clave para predios, Cuenta para Agua)
    CASE 
        WHEN t.id_modulo IN (1, 2) THEN t.base_referencia 
        WHEN t.id_modulo = 3 THEN 'Cuenta: ' || t.base_referencia
        ELSE t.base_referencia
    END AS contrapartida,
    -- Columna REFERENCIA (Años para predios, Detalle completo para Agua)
    CASE 
        WHEN t.id_modulo = 1 THEN 'Catastro urbano. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = 2 THEN 'Catastro rural. Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = 3 THEN 'Módulo de AA.PP. Medidor: ' || t.extra_info_2 || ' Ruta: ' || t.extra_info_1 || ' Emisiones: ' || STRING_AGG(DISTINCT t.periodo, ', ')
        ELSE t.base_referencia
    END AS referencia,
    ROUND(SUM(t.valor)::numeric, 2) AS total_deuda,
    MAX(t.fecha_emision) AS fecha_emision_max
FROM (
    -- ── CATASTRO URBANO (Módulo 1) ──────────────────────────
    SELECT
        c.id AS id_cliente,
        c.cedula,
        CASE  
            WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C'
            WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R'
            ELSE 'P'
        END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        f.id_modulo,
        fd."fechaCreacion" AS fecha_emision,
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
        '' AS extra_info_1,
        '' AS extra_info_2
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN cliente c ON c.id = f."idPropietarioEmision"
    JOIN liquidacion_avaluo la ON la.id_factura = f.id
    WHERE f.id_modulo = 1
      -- Filtro de Cédula Válida
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '0000000000000') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27'))
      -- Filtro de exclusión por Coactiva
      AND NOT EXISTS (
          SELECT 1 FROM coactiva_factura cf 
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva 
          WHERE cf.id_factura = f.id AND ca.estado = 1
      )

    UNION ALL

    -- ── CATASTRO RURAL (Módulo 2) ───────────────────────────
   SELECT
        c.id, c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END,
        TRIM(c.apellido || ' ' || c.nombre),
        f.id_modulo,
        fd."fechaCreacion",
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
    WHERE f.id_modulo = 2
      -- Filtro de Cédula Válida
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '0000000000000') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27'))
      -- Filtro de exclusión por Coactiva
      AND NOT EXISTS (
          SELECT 1 FROM coactiva_factura cf 
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva 
          WHERE cf.id_factura = f.id AND ca.estado = 1
      )

    UNION ALL

    -- ── AGUA POTABLE (Módulo 3) ────────────────────────────
 SELECT
        c.id AS id_cliente,
        c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        f.id_modulo,
        fd."fechaCreacion" AS fecha_emision,
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
    WHERE f.id_modulo = 3
      -- Filtro de Cédula Válida
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '0000000000000') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND lower(r.descripcion) NOT LIKE 'interes%'
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0))
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27'))
      -- Filtro de exclusión por Coactiva
      AND NOT EXISTS (
          SELECT 1 FROM coactiva_factura cf 
          INNER JOIN coactiva ca ON ca.id = cf.id_coactiva 
          WHERE cf.id_factura = f.id AND ca.estado = 1
      )

) t
GROUP BY
    t.id_cliente, t.cedula, t.tipo_id, t.nombre_cliente,
    t.id_modulo, t.base_referencia, t.extra_info_1, t.extra_info_2
ORDER BY t.nombre_cliente;