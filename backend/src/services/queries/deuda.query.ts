export const GET_DEUDAS_SIIM_SQL = (
  fechaStr: string,
  modulos: { urbano: number; rural: number; agua: number }
) => {
  return `
    WITH 
-- 1. Identificar Predios Urbanos bloqueados por coactiva
bloqueo_urbano AS (
    SELECT DISTINCT la.id_predio FROM coactiva_factura cf
    JOIN coactiva ca ON ca.id = cf.id_coactiva
    JOIN liquidacion_avaluo la ON la.id_factura = cf.id_factura
    WHERE ca.estado = 1
),
-- 2. Identificar Predios Rurales bloqueados por coactiva
bloqueo_rural AS (
    SELECT DISTINCT lar.id_predio_rural FROM coactiva_factura cf
    JOIN coactiva ca ON ca.id = cf.id_coactiva
    JOIN liquidacion_avaluo_rural lar ON lar.id_factura = cf.id_factura
    WHERE ca.estado = 1
),
-- 3. Identificar Cuentas de Agua bloqueadas por coactiva
bloqueo_agua AS (
    SELECT DISTINCT al.id_abonado FROM coactiva_factura cf
    JOIN coactiva ca ON ca.id = cf.id_coactiva
    JOIN agua_liquidacion al ON al.id_factura = cf.id_factura
    WHERE ca.estado = 1
)

SELECT * FROM (
    -- MÓDULO 1: URBANO
    SELECT 
        f.id AS id_factura, f.id_modulo, f."fechaCreacion" AS fecha_creacion,
        c.id AS id_cliente, TRIM(c.cedula) AS cedula, CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre) AS nombre_cliente,
        ROUND(SUM(CASE WHEN fd.estado = 1 AND r.id_rubro_tipo <> 6 THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2) AS total_nominal,
        ROUND(SUM(CASE WHEN fd.estado = 1 AND (r.id_rubro_tipo = 2 OR r.id = 140) THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2) AS servicio_administrativo,
        ROUND(SUM(CASE WHEN fd.estado = 1 AND LOWER(r.descripcion) LIKE '%bombero%' THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2) AS bomberos,
        ROUND(SUM(CASE WHEN fd.estado = 1 AND r.id_rubro_tipo NOT IN (2, 6) AND r.id <> 140 AND LOWER(r.descripcion) NOT LIKE '%bombero%' AND (LOWER(r.descripcion) LIKE '%predial%' OR LOWER(r.descripcion) LIKE '%impuesto%') THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2) AS base_predial_pura,
        COALESCE((SELECT CONCAT(pro.codigo, can.codigo, par.codigo, BTRIM(zon.codigo), BTRIM(sec.codigo), BTRIM(pol.codigo), BTRIM(pre.predio))
                  FROM provincia pro, canton can, parroquia par, zona zon, sector sec, poligono pol, predio pre
                  WHERE pre.id = la.id_predio AND pol.id = pre.id_poligono AND sec.id = pol.id_sector AND zon.id = sec.id_zona 
                    AND par.id = zon.id_parroquia AND can.id = par.id_canton AND pro.id = can.id_provincia), '') AS contrapartida,
        'Urbano Año: ' || EXTRACT(YEAR FROM f."fechaCreacion") AS referencia
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN cliente c ON c.id = f."idPropietarioEmision"
    JOIN liquidacion_avaluo la ON la.id_factura = f.id
    WHERE f.id_modulo = ${modulos.urbano} AND f."convenioPago" = 0
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      AND (f.estado = 1 OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}'))
      -- FILTRO DE CÉDULA
      AND c.cedula IS NOT NULL 
      AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND NOT EXISTS (SELECT 1 FROM bloqueo_urbano bu WHERE bu.id_predio = la.id_predio)
    GROUP BY f.id, c.id, la.id_predio

    UNION ALL

    -- MÓDULO 2: RURAL
    SELECT 
        f.id, f.id_modulo, f."fechaCreacion", c.id, TRIM(c.cedula), CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND r.id_rubro_tipo <> 6 THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND (r.id_rubro_tipo = 2 OR r.id = 140) THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND LOWER(r.descripcion) LIKE '%bombero%' THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND r.id_rubro_tipo NOT IN (2, 6) AND r.id <> 140 AND LOWER(r.descripcion) NOT LIKE '%bombero%' AND (LOWER(r.descripcion) LIKE '%predial%' OR LOWER(r.descripcion) LIKE '%impuesto%') THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        COALESCE((SELECT CONCAT(pro.codigo, can.codigo, par.codigo, BTRIM(zon.codigo), BTRIM(sec.codigo), BTRIM(pol.codigo), BTRIM(pre.predio))
                  FROM provincia pro, canton can, parroquia par, zona_rural zon, sector_rural sec, poligono_rural pol, predio_rural pre
                  WHERE pre.id = lar.id_predio_rural AND pol.id = pre.id_poligono AND sec.id = pol.id_sector AND zon.id = sec.id_zona 
                    AND par.id = zon.id_parroquia AND can.id = par.id_canton AND pro.id = can.id_provincia), ''),
        'Rural Año: ' || EXTRACT(YEAR FROM f."fechaCreacion")
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN cliente c ON c.id = f."idPropietarioEmision"
    JOIN liquidacion_avaluo_rural lar ON lar.id_factura = f.id
    WHERE f.id_modulo = ${modulos.rural} AND f."convenioPago" = 0
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      AND (f.estado = 1 OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}'))
      -- FILTRO DE CÉDULA
      AND c.cedula IS NOT NULL 
      AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND NOT EXISTS (SELECT 1 FROM bloqueo_rural br WHERE br.id_predio_rural = lar.id_predio_rural)
    GROUP BY f.id, c.id, lar.id_predio_rural

    UNION ALL

    -- MÓDULO 3: AGUA (AAPP)
    SELECT 
        f.id, f.id_modulo, f."fechaCreacion", c.id, TRIM(c.cedula), CASE WHEN LENGTH(TRIM(c.cedula)) = 10 THEN 'C' WHEN LENGTH(TRIM(c.cedula)) = 13 THEN 'R' ELSE 'P' END AS tipo_id,
        TRIM(c.apellido || ' ' || c.nombre),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND r.id_rubro_tipo <> 6 THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        ROUND(SUM(CASE WHEN fd.estado = 1 AND (r.id_rubro_tipo = 2 OR r.id = 7) THEN fd.cantidad * fd."valorUnitario" ELSE 0 END)::numeric, 2),
        0.00,
        0.00,
        ab.id::text,
        'Agua. Med: ' || COALESCE(ab."nroMedidor", '0') || ' Emisión: ' || ae.emision
    FROM factura f
    JOIN factura_detalle fd ON fd.id_factura = f.id
    JOIN rubro r ON r.id = fd.id_rubro
    JOIN agua_liquidacion al ON al.id_factura = f.id
    JOIN abonado ab ON ab.id = al.id_abonado
    JOIN cliente c ON c.id = ab."abonadoCliente"
    JOIN agua_emision_ruta aer ON aer.id = al.id_emision_ruta
    JOIN agua_emision ae ON ae.id = aer.id_agua_emision
    WHERE f.id_modulo = ${modulos.agua} AND f."convenioPago" = 0
      AND fd."fechaCreacion" <= '${fechaStr}'
      AND (f.pagado = 0 OR (f.pagado = 1 AND f."fechaCobro" > '${fechaStr}'))
      AND (f.estado = 1 OR (f.estado = 0 AND f."fechaEliminacion" > '${fechaStr}'))
      -- FILTRO DE CÉDULA
      AND c.cedula IS NOT NULL 
      AND TRIM(c.cedula) NOT IN ('000', '000000000', '0000000000', '9999999999999') 
      AND LENGTH(TRIM(c.cedula)) >= 10
      AND NOT EXISTS (SELECT 1 FROM bloqueo_agua ba WHERE ba.id_abonado = ab.id)
    GROUP BY f.id, c.id, ab.id, ae.emision
) AS facturas
ORDER BY nombre_cliente, fecha_creacion ASC;
  `;
};
