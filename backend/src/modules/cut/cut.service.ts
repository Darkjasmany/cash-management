import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularInteres,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { RegistroDeuda, ResultadoProceso } from "@/types";
import ExcelJS from "exceljs";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// Contrapartida según módulo (configurable, por defecto todas → 1)
/**
 * CNB (PICHINCHA MI VECINO)    1
 * VENTANILLA	2
 * APP (PAGO DE SERVICIOS)	3
 * WEB	4
 */
const CONTRAPARTIDA_POR_MODULO: Record<number, number> = {
  [MODULO_CATASTRO_URBANO]: 1,
  [MODULO_CATASTRO_RURAL]: 1,
  [MODULO_AGUA_POTABLE]: 1,
};
export class CutService {
  static async processCut(
    fechaCorte: Date,
    usuarioId: number,
    nombreUsuario: string
  ): Promise<ResultadoProceso> {
    // 1. Desactiva el corte activo anterior (si existe)
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "ACTIVO" },
    });

    // 2. Crea nuevo corte
    const corte = await prisma.parametrosCorte.create({
      data: {
        fechaCorte,
        estado: "ACTIVO",
        creadoPor: usuarioId,
        nombreUsuario,
      },
    });

    // 3. Elimina deudas del corte anterior (el nuevo aún no tiene)
    //    (las deudas de cortes INACTIVOS se borran para no acumular)
    await prisma.deudaBanco.deleteMany({
      where: {
        parametro: { estado: "INACTIVO" },
      },
    });

    // 4. Consulta el SIIM
    const [filasRaw, intereses] = await Promise.all([
      getDeudasSiim(fechaCorte),
      getInteresesSiim(),
    ]);

    // 5. Para cada fila, calcula intereses y construye registro
    const registros: RegistroDeuda[] = [];

    for (const fila of filasRaw) {
      const modulo = await getModuloSiim(fila.id_modulo);
      if (!modulo) continue; // Si no se encuentra configuración del módulo, omitir

      // El total ya viene sumado de la BD (rubros sin intereses)
      // Calculamos el interés adicional sobre ese total
      const interes = calcularInteres(
        fila.total_deuda,
        new Date(), //fecha de creación (approx: usamos hoy si no la traemos)
        fechaCorte,
        modulo,
        intereses
      );

      const totalConInteres = Math.round((fila.total_deuda + interes) * 100) / 100; // Convertimos a centavos enteros para el formato requerido
      const valorCentavos = Math.round(totalConInteres * 100); // sin decimales

      if (valorCentavos <= 0) continue; // Si la deuda total con intereses es cero o negativa, omitimos

      // Completar con los campos necesarios, usando fila y las constantes de configuración
      registros.push({
        tipo: "CO",
        contrapartida: fila.contrapartida ?? "", //clave catastral o referencia de aagua
        moneda: "USD",
        valor: valorCentavos,
        formaCobro: "REC",
        ref1: "",
        ref2: "",
        referencia: fila.referencia ?? "",
        tipoId: fila.tipo_id ?? "C",
        numeroId: fila.cedula ?? "",
        nombreCliente: fila.nombre_cliente ?? "",
        idCliente: fila.id_cliente,
        totalDecimal: totalConInteres,
      });
    }

    // 6. Guarda en BD propia (batch insert)
    if (registros.length > 0) {
      await prisma.deudaBanco.createMany({
        data: registros.map(r => ({
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
    }

    // 7. Retorna resultado del proceso
    const totalDeuda = registros.reduce((acc, r) => acc + r.totalDecimal, 0);
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
      { header: "CONTRAPARTIDA", key: "contrapartida", width: 14 },
      { header: "MONEDA", key: "moneda", width: 8 },
      { header: "VALOR (cents.)", key: "valor", width: 14 },
      { header: "VALOR (USD)", key: "valorDecimal", width: 14 },
      { header: "FORMA COBRO", key: "formaCobro", width: 12 },
      { header: "EN BLANCO", key: "ref1", width: 10 },
      { header: "EN BLANCO", key: "ref2", width: 10 },
      { header: "REFERENCIA", key: "referencia", width: 30 },
      { header: "TIPO ID", key: "tipoId", width: 9 },
      { header: "NUMERO ID", key: "numeroId", width: 14 },
      { header: "NOMBRE CLIENTE", key: "nombreCliente", width: 35 },
    ];

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

      // Filas alternas
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
