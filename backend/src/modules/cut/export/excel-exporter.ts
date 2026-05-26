import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import type { DeudaBanco } from "@prisma/client";
import { DebtAggregator } from "./debt-aggregator";

const USD_FORMAT = '"$"#,##0.00';

interface GrupoArchivo {
  contrapartida: string;
  tipoId: string;
  numeroId: string;
  nombreCliente: string;
  idCliente: string;
  id_modulo: number;
  periodos: Set<string>;
  refBaseAgua: string;
  totalExacto: number;
  totalDecimal: number;
  totalCentavos: number;
}

export class ExcelExporter {
  static async generate(consolidado: boolean): Promise<Buffer> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!corte) throw new Error("No hay corte activo.");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Cash Management - GAD Naranjal";
    wb.created = new Date();

    const encabezado = `${corte.fechaCorte.toISOString().split("T")[0]}  |  ${corte.nombreUsuario}  |  ${new Date().toLocaleString("es-EC")}`;

    if (consolidado) {
      const grupos = await DebtAggregator.getAggregated(corte.id);
      if (grupos.length === 0)
        throw new Error("No hay datos en el corte activo.");
      this.buildConsolidadoSheet(wb, grupos, encabezado);
    } else {
      const deudas = await DebtAggregator.getDetailed(corte.id);
      if (deudas.length === 0)
        throw new Error("No hay datos en el corte activo.");
      this.buildDetalleSheet(wb, deudas, encabezado);
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private static buildConsolidadoSheet(
    wb: ExcelJS.Workbook,
    grupos: GrupoArchivo[],
    encabezado: string,
  ) {
    const ws = wb.addWorksheet("Consolidado Banco", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    ws.mergeCells("A1:L1");
    ws.getCell("A1").value = `REPORTE CONSOLIDADO — ${encabezado}`;
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getRow(1).height = 26;

    ws.columns = [
      { header: "TIPO", key: "tipo", width: 8 },
      { header: "CONTRAPARTIDA", key: "contrapartida", width: 22 },
      { header: "MONEDA", key: "moneda", width: 8 },
      { header: "VALOR (cents.)", key: "valor", width: 14 },
      { header: "TOTAL USD", key: "totalUsd", width: 14 },
      { header: "FORMA COBRO", key: "cobro", width: 12 },
      { header: "EN BLANCO", key: "b1", width: 10 },
      { header: "EN BLANCO", key: "b2", width: 10 },
      { header: "REFERENCIA", key: "referencia", width: 55 },
      { header: "TIPO ID", key: "tipoId", width: 9 },
      { header: "NUMERO ID", key: "numeroId", width: 15 },
      { header: "NOMBRE CLIENTE", key: "nombre", width: 38 },
    ];

    const headerRow = ws.getRow(2);
    headerRow.eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { horizontal: "center" };
    });
    headerRow.height = 20;

    grupos.forEach((g, idx) => {
      const row = ws.addRow({
        tipo: "CO",
        contrapartida: g.contrapartida,
        moneda: "USD",
        valor: g.totalCentavos,
        totalUsd: g.totalDecimal,
        cobro: "REC",
        b1: "",
        b2: "",
        referencia: DebtAggregator.construirReferencia(g),
        tipoId: g.tipoId,
        numeroId: g.numeroId,
        nombre: g.nombreCliente,
      });

      if (idx % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0F7FF" },
          };
        });
      }

      row.getCell("totalUsd").numFmt = USD_FORMAT;
      row.getCell("valor").alignment = { horizontal: "right" };
      row.height = 18;
    });

    const totalRow = ws.addRow({
      tipo: "TOTAL",
      contrapartida: `${grupos.length} registros`,
      totalUsd: grupos.reduce((a, g) => a + g.totalDecimal, 0),
    });
    totalRow.eachCell((c) => {
      c.font = { bold: true };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };
    });
    totalRow.getCell("totalUsd").numFmt = USD_FORMAT;

    ws.autoFilter = { from: "A2", to: "L2" };
    ws.views = [{ state: "frozen", ySplit: 2 }];
  }

  private static buildDetalleSheet(
    wb: ExcelJS.Workbook,
    deudas: DeudaBanco[],
    encabezado: string,
  ) {
    const ws = wb.addWorksheet("Detalle por Factura", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    ws.mergeCells("A1:M1");
    ws.getCell("A1").value = `DETALLE POR FACTURA — ${encabezado}`;
    ws.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getRow(1).height = 26;

    ws.columns = [
      { header: "ID FACTURA", key: "idF", width: 12 },
      { header: "MÓDULO", key: "mod", width: 10 },
      { header: "CONTRAPARTIDA", key: "cp", width: 22 },
      { header: "NOMBRE", key: "nombre", width: 35 },
      { header: "CÉDULA", key: "cedula", width: 14 },
      { header: "NOMINAL", key: "nominal", width: 12 },
      { header: "INTERÉS", key: "interes", width: 12 },
      { header: "MORA", key: "mora", width: 10 },
      { header: "DESCUENTO", key: "desc", width: 12 },
      { header: "RECARGO", key: "rec", width: 10 },
      { header: "TOTAL", key: "total", width: 12 },
      { header: "REFERENCIA", key: "ref", width: 40 },
      { header: "TIPO ID", key: "tipoId", width: 8 },
    ];

    const headerRow = ws.getRow(2);
    headerRow.eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { horizontal: "center" };
    });
    headerRow.height = 20;

    deudas.forEach((d, idx) => {
      const row = ws.addRow({
        idF: d.idFacturaSiim,
        mod: d.id_modulo,
        cp: d.contrapartida,
        nombre: d.nombreCliente,
        cedula: d.numeroId,
        nominal: parseFloat(d.montoNominal.toString()),
        interes: parseFloat(d.montoInteres.toString()),
        mora: parseFloat(d.montoMora.toString()),
        desc: parseFloat(d.montoDescuento.toString()),
        rec: parseFloat(d.montoRecargo.toString()),
        total: parseFloat(d.totalFactura.toString()),
        ref: d.referencia.replace(/:/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N"),
        tipoId: d.tipoId,
      });

      if (idx % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0F7FF" },
          };
        });
      }

      ["nominal", "interes", "mora", "desc", "rec", "total"].forEach((k) => {
        row.getCell(k).numFmt = USD_FORMAT;
      });

      row.height = 18;
    });

    ws.autoFilter = { from: "A2", to: "M2" };
    ws.views = [{ state: "frozen", ySplit: 2 }];
  }
}
