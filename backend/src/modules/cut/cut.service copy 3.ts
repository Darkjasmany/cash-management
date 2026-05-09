import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRecargoProntoPago,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { ModuloSiim, RegistroDeuda, ResultadoProceso } from "@/types";
import ExcelJS from "exceljs";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ─────────────────────────────────────────────────────────────
// Utilidad: tipo de identificación desde la longitud de cédula
// ─────────────────────────────────────────────────────────────
function getTipoId(cedula: string): string {
  const len = cedula.trim().length;
  if (len === 10) return "C";
  if (len === 13) return "R";
  return "P";
}

// ─────────────────────────────────────────────────────────────
// Clave de agrupación:
//   cliente + módulo + contrapartida (clave catastral o cuenta)
//
// ¿Por qué agrupar?
//   El query devuelve una fila por FACTURA.
//   Un predio con deudas de 2022, 2023 y 2024 → 3 filas.
//   Deben consolidarse en UNA línea en el archivo del banco.
//   Lo que se suma: totalFinal de cada factura del mismo predio.
// ─────────────────────────────────────────────────────────────
interface GrupoDeuda {
  cedula: string;
  tipoId: string;
  nombre_cliente: string;
  id_cliente: number;
  id_modulo: number;
  contrapartida: string;
  periodos: Set<string>;
  // FIX 2: Acumulamos el interés SIN redondear por factura.
  // Solo redondeamos al final cuando construimos el registro.
  totalNominalAcum: number; // suma de total_nominal de cada factura del grupo
  totalInteresAcum: number; // suma de intereses SIN redondear individualmente
  totalFinal: number; // totalNominalAcum + totalInteresAcum (redondeado al final)
  refBaseAgua: string;
}

// Extrae el código de emisión del texto del query
// Ej: "Agua. Med: 08070514 Emisión: 2604" → "2604"
function extraerEmision(referencia: string): string {
  const match = referencia.match(/Emisión:\s*(\S+)/);
  return match ? match[1] : "";
}

// Extrae la parte fija del agua: "Agua. Med: 08070514"
// (todo antes de " Emisión:")
function extraerRefBaseAgua(referencia: string): string {
  const idx = referencia.indexOf(" Emisión:");
  return idx > 0 ? referencia.substring(0, idx) : referencia;
}

export class CutService {
  // ─────────────────────────────────────────────────────────────
  // PROCESAR CORTE
  //
  // Paso a paso:
  //   1. Desactiva el corte anterior
  //   2. Crea el nuevo corte
  //   3. Borra deudas de cortes INACTIVOS
  //   4. Consulta el SIIM → facturas individuales
  //   5. Por cada factura: calcula interes + pronto pago
  //   6. Agrupa por cliente+módulo+contrapartida
  //   7. Construye registros finales y los inserta en lotes
  // ─────────────────────────────────────────────────────────────

  static async processCut(
    fechaCorteStr: string,
    usuarioId: number,
    nombreUsuario: string
  ): Promise<ResultadoProceso> {
    const fechaCorte = new Date(fechaCorteStr);
    const anioCorte = fechaCorte.getFullYear();

    console.log(`\n🔄 Iniciando corte: ${fechaCorteStr} | Usuario: ${nombreUsuario}`);

    // ── 1. Desactiva el corte activo anterior ─────────────────
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "INACTIVO" },
    });

    // ── 2. Crea el nuevo corte ────────────────────────────────
    const corte = await prisma.parametrosCorte.create({
      data: {
        fechaCorte,
        estado: "ACTIVO",
        creadoPor: usuarioId,
        nombreUsuario,
      },
    });
    console.log(`✅ Corte #${corte.id} creado`);

    // ── 3. Borra deudas de cortes INACTIVOS ───────────────────
    await prisma.deudaBanco.deleteMany({
      where: {
        parametro: { estado: "INACTIVO" },
      },
    });

    // ── 4. Consulta el SIIM ───────────────────────────────────
    console.log("📡 Consultando SIIM...");
    const [filasRaw, intereses, moduloUrbano, moduloRural, moduloAgua] = await Promise.all([
      getDeudasSiim(fechaCorte), // facturas individuales
      getInteresesSiim(), // tabla de % de intereses
      getModuloSiim(MODULO_CATASTRO_URBANO),
      getModuloSiim(MODULO_CATASTRO_RURAL),
      getModuloSiim(MODULO_AGUA_POTABLE),
    ]);

    console.log(`📊 Facturas del SIIM: ${filasRaw.length}`);
    console.log(`📊 Registros de intereses: ${intereses.length}`);

    if (filasRaw.length === 0) {
      console.warn("⚠️  No se encontraron facturas en el SIIM para esta fecha de corte.");
      return {
        idParametro: corte.id,
        fechaCorte: corte.fechaCorte.toISOString().split("T")[0],
        totalRegistros: 0,
        totalDeuda: 0,
      };
    }

    const moduloMap: Record<number, ModuloSiim | null> = {
      [MODULO_CATASTRO_URBANO]: moduloUrbano,
      [MODULO_CATASTRO_RURAL]: moduloRural,
      [MODULO_AGUA_POTABLE]: moduloAgua,
    };

    // ── 5 y 6. Procesa y agrupa ───────────────────────────────
    //
    // Por cada factura:
    //   a) base_interes = total_nominal - servicio_administrativo
    //      (el Java excluye SA de la base imponible del interés)
    //
    //   b) interes = calcularInteres(base_interes, fechaCreacion, fechaCorte, modulo)
    //      → usa la fecha REAL de la factura, no un promedio
    //
    //   c) pronto pago (solo catastro del año en curso):
    //      base = base_predial_pura (impuesto predial + exoneración)
    //      Ene-Jun → descuento negativo escalonado por quincena
    //      Jul-Dic → recargo positivo fijo +10%
    //
    //   d) total_factura = total_nominal + interes + prontoPago
    //
    //   e) Agrupa: mismo cliente+módulo+contrapartida → suma total_factura
    //

    // ─────────────────────────────────────────────────────────
    // 5. Procesa cada factura y agrupa
    //
    // LÓGICA POR MÓDULO:
    //
    // CATASTRO (urbano/rural):
    //   - base_interes = total_nominal - servicio_administrativo
    //   - interes solo cuenta desde el año siguiente si la factura
    //     es de un año anterior (regla Java esCatastro)
    //   - pronto pago solo si anio_factura == anio_corte
    //   - agrupa por: cliente + modulo + contrapartida (clave catastral)
    //   - período = año de la factura
    //
    // AGUA:
    //   - base_interes = total_nominal - servicio_administrativo
    //   - sin pronto pago
    //   - agrupa por: cliente + modulo + contrapartida (id_abonado)
    //     IMPORTANTE: una cuenta puede tener N emisiones del mismo año
    //     → se deben agrupar todas con sus emisiones como períodos
    //   - período = código de emisión (ej: "2604")
    // ─────────────────────────────────────────────────────────

    const mapa = new Map<string, GrupoDeuda>();

    for (const fila of filasRaw) {
      const modulo = moduloMap[fila.id_modulo];
      if (!modulo) {
        console.warn(`⚠️  Módulo ${fila.id_modulo} sin config, factura ${fila.id_factura} omitida`);
        continue;
      }

      const totalNominal = Number(fila.total_nominal) || 0;
      const sa = Number(fila.servicio_administrativo) || 0;
      const basePredial = Number(fila.base_predial_pura) || 0;

      // 1. Calcular pronto pago (solo para catastro del año actual)
      let descuentoRecargo = 0;
      const anioFactura = new Date(fila.fecha_creacion).getFullYear();

      // Ignorar facturas sin valor
      if (totalNominal <= 0) continue;

      const esCatastro =
        fila.id_modulo === MODULO_CATASTRO_URBANO || fila.id_modulo === MODULO_CATASTRO_RURAL;

      if (esCatastro && anioFactura === anioCorte) {
        descuentoRecargo = calcularDescuentoRecargoProntoPago(
          basePredial,
          fechaCorte,
          fila.id_modulo
        );
      }

      // a) Base imponible del interés, base del interés — total sin SA, nunca negativo
      // const baseInteres = Math.max(0, totalNominal - sa);
      // 2. Base del interés
      let baseInteres = totalNominal - sa;
      if (esCatastro && fila.id_modulo === MODULO_CATASTRO_URBANO) {
        // Urbano: se suma el descuento/recargo a la base
        baseInteres += descuentoRecargo;
      }
      // En Rural y Agua no se suma descuento/recargo a la base
      baseInteres = Math.max(0, baseInteres);

      // b) Interés con la fecha real de la factura
      // 3. Interés (sin redondear)
      const interesExacto = calcularInteresExacto(
        baseInteres,
        new Date(fila.fecha_creacion),
        fechaCorte,
        modulo,
        intereses,
        esCatastro
      );
      // TODO
      // c) Pronto pago (solo catastro del año actual)
      // let prontoPago = 0;
      // if (esCatastro && new Date(fila.fecha_creacion).getFullYear() === anioCorte) {
      //   prontoPago = calcularDescuentoRecargoProntoPago(basePredial, fechaCorte);
      // }

      // d) Total de esta factura
      // const totalFactura = totalNominal + interesExacto + prontoPago;

      // TODO Agrega esto después de calcular interes en el loop:
      // if (esCatastro) {
      //   console.log(
      //     `Factura ${fila.id_factura} | base: ${baseInteres} | interes: ${interesExacto} | prontoPago: ${prontoPago}`
      //   );
      // }

      // FIX 1: SIN pronto pago — el descuento/recargo ya está en total_nominal
      // total_factura = lo que ya tiene el SIIM en BD (nominal) + interés
      // const totalFactura = totalNominal + interesExacto;

      // 4. Total de la factura
      const totalFactura = totalNominal + descuentoRecargo + interesExacto;

      // Período
      let periodo: string;
      let refBaseAgua = "";

      if (esCatastro) {
        periodo = new Date(fila.fecha_creacion).getFullYear().toString();
      } else {
        // El query ya trae: "Agua. Med: 08070514 Emisión: 2604"
        periodo = extraerEmision(fila.referencia);
        refBaseAgua = extraerRefBaseAgua(fila.referencia);
        // Si por alguna razón no hay emisión, usamos el año
        if (!periodo) periodo = new Date(fila.fecha_creacion).getFullYear().toString();
      }

      // Para agua: agrupamos por cliente + modulo + contrapartida (id_abonado)
      // NO incluimos la emisión en la clave → todas las emisiones de un
      // mismo abonado se consolidan en una sola línea con sus emisiones listadas

      const clave = `${fila.id_cliente}|${fila.id_modulo}|${fila.contrapartida}`;
      const existing = mapa.get(clave);

      if (existing) {
        // FIX 2: acumulamos sin redondear
        existing.totalNominalAcum += totalNominal;
        existing.totalInteresAcum += interesExacto;
        existing.totalFinal = existing.totalNominalAcum + existing.totalInteresAcum;
        existing.periodos.add(periodo);
        if (!esCatastro && refBaseAgua && !existing.refBaseAgua) {
          existing.refBaseAgua = refBaseAgua;
        }
      } else {
        mapa.set(clave, {
          cedula: fila.cedula,
          tipoId: getTipoId(fila.cedula),
          nombre_cliente: fila.nombre_cliente,
          id_cliente: fila.id_cliente,
          id_modulo: fila.id_modulo,
          contrapartida: fila.contrapartida,
          periodos: new Set([periodo]),
          totalNominalAcum: totalNominal,
          totalInteresAcum: interesExacto,
          totalFinal: totalFactura,
          refBaseAgua,
        });
      }
    }

    console.log(`📦 Grupos consolidados: ${mapa.size}`);

    // ── 7. Construye registros finales ────────────────────────
    const registros: RegistroDeuda[] = [];

    for (const [, grupo] of mapa) {
      // FIX 2: redondeo una sola vez al final del grupo
      const totalRedondeado = Math.round(grupo.totalFinal * 100) / 100;
      const valorCentavos = Math.round(totalRedondeado * 100);

      if (isNaN(valorCentavos) || valorCentavos <= 0) continue;

      // Texto de referencia según módulo
      const periodosOrdenados = [...grupo.periodos].sort().join(", ");
      let referencia = "";

      if (grupo.id_modulo === MODULO_CATASTRO_URBANO) {
        // Ejemplo: "Catastro urbano. Clave: 0911501401016004 Años: 2023, 2024, 2026"
        referencia = `Catastro urbano. Años: ${periodosOrdenados}`;
      } else if (grupo.id_modulo === MODULO_CATASTRO_RURAL) {
        referencia = `Catastro rural. Años: ${periodosOrdenados}`;
      } else {
        // Agua: "Agua. Med: 08070514 Emisiones: 2602, 2603, 2604"
        // refBaseAgua ya trae "Agua. Med: 08070514"
        referencia = `${grupo.refBaseAgua} Emisiones: ${periodosOrdenados}`;
      }

      registros.push({
        tipo: "CO",
        contrapartida: grupo.contrapartida,
        moneda: "USD",
        valor: valorCentavos,
        formaCobro: "REC",
        ref1: "",
        ref2: "",
        referencia,
        tipoId: grupo.tipoId,
        numeroId: grupo.cedula,
        nombreCliente: grupo.nombre_cliente,
        idCliente: String(grupo.id_cliente),
        totalDecimal: totalRedondeado,
      });
    }

    console.log(`💾 Registros a insertar en BD: ${registros.length}`);

    // ── 8. Inserta en lotes de 5000 ───────────────────────────
    if (registros.length > 0) {
      const chunkSize = 5000;
      for (let i = 0; i < registros.length; i += chunkSize) {
        const chunk = registros.slice(i, i + chunkSize);
        await prisma.deudaBanco.createMany({
          data: chunk.map(r => ({
            idParametro: corte.id,
            tipo: r.tipo,
            contrapartida: r.contrapartida,
            moneda: r.moneda,
            valor: r.valor,
            formaCobro: r.formaCobro,
            referencia: r.referencia,
            tipoId: r.tipoId,
            numeroId: r.numeroId,
            nombreCliente: r.nombreCliente,
            idCliente: r.idCliente,
            totalDecimal: r.totalDecimal,
          })),
        });
        console.log(
          `  ✅ ${Math.min(i + chunkSize, registros.length)} / ${registros.length} insertados`
        );
      }
    }

    const totalDeuda = registros.reduce((acc, r) => acc + r.totalDecimal, 0);
    console.log(
      `🎉 Corte completado. Registros: ${registros.length} | Total: $${Math.round(totalDeuda * 100) / 100}\n`
    );

    return {
      idParametro: corte.id,
      fechaCorte: corte.fechaCorte.toISOString().split("T")[0],
      totalRegistros: registros.length,
      totalDeuda: Math.round(totalDeuda * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GET CORTE ACTIVO: devuelve el corte activo con sus registros
  // ─────────────────────────────────────────────────────────────
  static async getActiveCut(page = 1, limit = 50) {
    const corte = await prisma.parametrosCorte.findFirst({ where: { estado: "ACTIVO" } });
    if (!corte) return null;

    // Para paginar, obtenemos el total de registros y la pagina actual de deudas asociadas al corte activo
    const [deudas, total] = await Promise.all([
      prisma.deudaBanco.findMany({
        where: { idParametro: corte.id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { nombreCliente: "asc" },
      }),

      // Total de registros para paginación
      prisma.deudaBanco.count({ where: { idParametro: corte.id } }),
    ]);

    // También calculamos el total de deuda sumando el campo totalDecimal de las deudas del corte activo
    const sumTotal = await prisma.deudaBanco.aggregate({
      where: { idParametro: corte.id },
      _sum: { totalDecimal: true },
    });

    // Retornamos el corte activo con sus deudas paginadas y un resumen con el total de registros y total de deuda
    return {
      corte: {
        id: corte.id,
        fechaCorte: corte.fechaCorte,
        creadoEn: corte.creadoEn,
        nombreUsuario: corte.nombreUsuario,
      },
      deudas,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      resumen: {
        totalRegistros: total,
        totalDeuda: sumTotal._sum.totalDecimal ?? 0,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GENERAR TXT: formato exacto Banco de Pichincha (tab-separado)
  //
  // Columnas tab-separadas, terminación CRLF:
  // TIPO | CONTRAPARTIDA | MONEDA | VALOR | COBRO | '' | '' | REFERENCIA | TIPOID | NUMEROID | NOMBRE
  //
  // VALOR: entero en centavos sin punto decimal (123.90 → 12390)
  // ─────────────────────────────────────────────────────────────
  static async generateTxt(): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: { nombreCliente: "asc" } } },
    });

    if (!corte || corte.deudas.length === 0) {
      throw new Error("No hay datos en el corte activo para generar el archivo.");
    }

    // Cada línea: TIPO\tCONTRAPARTIDA\tMONEDA\tVALOR\tFORMA_COBRO\t\t\tREFERENCIA\tTIPO_ID\tNUMERO_ID\tNOMBRE_CLIENTE
    const lineas = corte.deudas.map(d =>
      [
        d.tipo,
        d.contrapartida,
        d.moneda,
        d.valor, // entero sin punto decimal
        d.formaCobro,
        "", // EN BLANCO
        "", // EN BLANCO
        d.referencia,
        d.tipoId,
        d.numeroId,
        d.nombreCliente,
      ].join("\t")
    );

    return lineas.join("\r\n"); // CRLF según convención de archivos bancarios
  }

  // ─────────────────────────────────────────────────────────────
  // GENERAR EXCEL: mismo contenido, formato legible con cabeceras
  // ─────────────────────────────────────────────────────────────
  static async generateExcel(): Promise<Buffer> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: { nombreCliente: "asc" } } },
    });

    if (!corte || corte.deudas.length === 0) {
      throw new Error("No hay datos en el corte activo para generar el archivo.");
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Cash Management - GAD Naranjal";
    wb.created = new Date();

    const ws = wb.addWorksheet("Deudas", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    // Fila 1: encabezado de información
    // ── Cabecera de información ─────────────────────────────────
    ws.mergeCells("A1:K1");
    ws.getCell("A1").value =
      `REPORTE DE DEUDAS — Fecha de Corte: ${corte.fechaCorte.toISOString().split("T")[0]}  |  Generado por: ${corte.nombreUsuario}  |  ${new Date().toLocaleString("es-EC")}`;
    ws.getCell("A1").font = { bold: true, size: 11 };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 28;

    // ── Columnas ────────────────────────────────────────────────
    ws.columns = [
      { header: "TIPO", key: "tipo", width: 8 },
      { header: "CONTRAPARTIDA", key: "contrapartida", width: 22 },
      { header: "MONEDA", key: "moneda", width: 8 },
      { header: "VALOR (cents.)", key: "valor", width: 14 },
      { header: "VALOR (USD)", key: "valorDecimal", width: 14 },
      { header: "FORMA COBRO", key: "formaCobro", width: 12 },
      { header: "EN BLANCO", key: "ref1", width: 10 },
      { header: "EN BLANCO", key: "ref2", width: 10 },
      { header: "REFERENCIA", key: "referencia", width: 42 },
      { header: "TIPO ID", key: "tipoId", width: 9 },
      { header: "NUMERO ID", key: "numeroId", width: 15 },
      { header: "NOMBRE CLIENTE", key: "nombreCliente", width: 38 },
    ];

    // Fila 2: cabecera de columnas
    // Estilo de cabecera de columnas (fila 2)
    const headerRow = ws.getRow(2);
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF1E40AF" } },
      };
    });
    headerRow.height = 22;

    // ── Datos ────────────────────────────────────────────────────
    corte.deudas.forEach((d, idx) => {
      const row = ws.addRow({
        tipo: d.tipo,
        contrapartida: d.contrapartida,
        moneda: d.moneda,
        valor: d.valor,
        valorDecimal: parseFloat(d.totalDecimal.toString()),
        formaCobro: d.formaCobro,
        ref1: "",
        ref2: "",
        referencia: d.referencia,
        tipoId: d.tipoId,
        numeroId: d.numeroId,
        nombreCliente: d.nombreCliente,
      });

      // Filas alternas con fondo suave
      if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7FF" } };
        });
      }

      // Formato USD en la columna valorDecimal
      row.getCell("valorDecimal").numFmt = '"$"#,##0.00';
      row.getCell("valor").alignment = { horizontal: "right" };
      row.height = 18;
    });

    // ── Fila de totales ──────────────────────────────────────────
    const totalRow = ws.addRow({
      tipo: "TOTAL",
      contrapartida: corte.deudas.length,
      valorDecimal: corte.deudas.reduce((acc, d) => acc + parseFloat(d.totalDecimal.toString()), 0),
    });
    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    });
    totalRow.getCell("valorDecimal").numFmt = '"$"#,##0.00';

    // ── Auto-filtro ──────────────────────────────────────────────
    ws.autoFilter = { from: "A2", to: "L2" };

    // ── Freeze header ────────────────────────────────────────────
    ws.views = [{ state: "frozen", ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

// ─────────────────────────────────────────────────────────────
// calcularInteresExacto — igual que calcularInteres del siim.service
// pero retorna el valor SIN redondear para evitar error acumulado
// cuando se suman muchas facturas (FIX 2).
// ─────────────────────────────────────────────────────────────
function calcularInteresExacto(
  baseImponible: number,
  fechaCreacion: Date,
  fechaCorte: Date,
  modulo: ModuloSiim,
  intereses: Array<{ ano: number; mes: number; porcentaje: number }>,
  esCatastro: boolean = false
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

  // const anioFactura = new Date(fechaCreacion).getFullYear();
  // const anioCorte = fechaCorte.getFullYear();
  // const subirMeses = !esCatastro || (esCatastro && anioFactura === anioCorte);

  // fechaInicio ya tiene los días adicionales sumados
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
  // ← SIN Math.round — valor exacto para acumular sin error
  return isNaN(totalIntereses * baseImponible) ? 0 : totalIntereses * baseImponible;
}
