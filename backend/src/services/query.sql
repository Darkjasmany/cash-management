SELECT
    t.id_cliente,
    t.cedula,
    t.tipo_id,
    t.nombre_cliente,
    t.id_modulo,
    -- Construcción de la referencia final agrupada
    CASE 
        WHEN t.id_modulo = 1 THEN 'Catastro urbano: ' || t.base_referencia || ' Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = 2 THEN 'Catastro rural: ' || t.base_referencia || ' Años: ' || STRING_AGG(DISTINCT t.periodo, ', ' ORDER BY t.periodo)
        WHEN t.id_modulo = 3 THEN 'Módulo de AA.PP. Cuenta: ' || t.base_referencia || ' Medidor: ' || t.extra_info_2 || ' Ruta: ' || t.extra_info_1 || ' Emisiones: ' || STRING_AGG(DISTINCT t.periodo, ', ')
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
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) <> ''
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0) OR f.estado = 3)
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27') OR (f.pagado = 1 AND f."fechaCobro" <= '2026-04-27' AND f.estado = 3))

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
      AND c.cedula IS NOT NULL AND TRIM(c.cedula) <> ''
      AND fd."valorUnitario" <> 0 AND r.id_rubro_tipo <> 6
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND ((f.estado = 1 AND fd.estado = 1) OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0) OR f.estado = 3)
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27') OR (f.pagado = 1 AND f."fechaCobro" <= '2026-04-27' AND f.estado = 3))

    UNION ALL

    -- ── AGUA POTABLE (Módulo 3) ────────────────────────────
  SELECT
        c.id AS id_cliente,
        c.cedula,
        CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        f.id_modulo,
        fd."fechaCreacion" AS fecha_emision,
        ae.emision AS periodo, -- Nombre de la emisión (ej: Marzo 2026)
        ROUND((fd.cantidad * fd."valorUnitario")::numeric, 2) AS valor,
        a.id::text AS base_referencia, -- ID del Abonado
        ru.descripcion AS extra_info_1, -- Ruta
        '' AS extra_info_2
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
      AND lower(r.descripcion) NOT LIKE 'interes%' -- Tal cual el SIIM
      AND fd."fechaCreacion" <= '2026-04-27'
      AND f."convenioPago" = 0
      AND (
          (f.estado = 1 AND fd.estado = 1) -- DEUDA ACTIVA
          OR (f.estado = 0 AND f."fechaEliminacion" > '2026-04-27' AND fd.estado = 0) -- ELIMINADA DESPUES DEL CORTE
          OR (f.estado = 3) -- COACTIVA / SUSPENDIDO
      )
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '2026-04-27'))

) t
GROUP BY
    t.id_cliente, t.cedula, t.tipo_id, t.nombre_cliente,
    t.id_modulo, t.base_referencia, t.extra_info_1, t.extra_info_2
ORDER BY t.nombre_cliente;