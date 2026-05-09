import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRecargoProntoPago,
  calcularInteres,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { ModuloSiim, RegistroDeuda, ResultadoProceso } from "@/types";
import ExcelJS from "exceljs";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

function getTipoId(cedula: string): string {
  const len = cedula.trim().length;
  if (len === 10) return "C";
  if (len === 13) return "R";
  return "P";
}

interface GrupoDeuda {
  cedula: string;
  tipoId: string;
  nombre_cliente: string;
  id_cliente: number;
  id_modulo: number;
  contrapartida: string;
  periodos: Set<string>;
  totalNominalAcum: number;
  totalInteresAcum: number; // suma de intereses YA REDONDEADOS por factura
  totalFinal: number; // suma totalNominalAcum + totalInteresAcum (sin redondear de nuevo)
  refBaseAgua: string;
}

function extraerEmision(referencia: string): string {
  const match = referencia.match(/Emisión:\s*(\S+)/);
  return match ? match[1] : "";
}

function extraerRefBaseAgua(referencia: string): string {
  const idx = referencia.indexOf(" Emisión:");
  return idx > 0 ? referencia.substring(0, idx) : referencia;
}

export class CutService {
  static async processCut(
    fechaCorteStr: string,
    usuarioId: number,
    nombreUsuario: string
  ): Promise<ResultadoProceso> {
    const fechaCorte = new Date(fechaCorteStr);
    const anioCorte = fechaCorte.getFullYear();

    console.log(`\n🔄 Iniciando corte: ${fechaCorteStr} | Usuario: ${nombreUsuario}`);

    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "INACTIVO" },
    });

    const corte = await prisma.parametrosCorte.create({
      data: {
        fechaCorte,
        estado: "ACTIVO",
        creadoPor: usuarioId,
        nombreUsuario,
      },
    });
    console.log(`✅ Corte #${corte.id} creado`);

    await prisma.deudaBanco.deleteMany({
      where: { parametro: { estado: "INACTIVO" } },
    });

    console.log("📡 Consultando SIIM...");
    const [filasRaw, intereses, moduloUrbano, moduloRural, moduloAgua] = await Promise.all([
      getDeudasSiim(fechaCorte),
      getInteresesSiim(),
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

      if (totalNominal <= 0) continue;

      const esCatastro =
        fila.id_modulo === MODULO_CATASTRO_URBANO || fila.id_modulo === MODULO_CATASTRO_RURAL;
      const anioFactura = new Date(fila.fecha_creacion).getFullYear();

      // 1. Pronto pago (solo catastro del año actual)
      let descuentoRecargo = 0;
      if (esCatastro && anioFactura === anioCorte) {
        descuentoRecargo = calcularDescuentoRecargoProntoPago(
          basePredial,
          fechaCorte,
          fila.id_modulo
        );
      }

      // 2. Base para interés
      let baseInteres = totalNominal - sa;
      if (esCatastro && fila.id_modulo === MODULO_CATASTRO_URBANO) {
        baseInteres += descuentoRecargo;
      }
      baseInteres = Math.max(0, baseInteres);

      // 3. Interés (redondeado por factura)
      const interes = calcularInteres(
        baseInteres,
        new Date(fila.fecha_creacion),
        fechaCorte,
        modulo,
        intereses,
        esCatastro
      );

      // 4. Total de esta factura
      const totalFactura = totalNominal + descuentoRecargo + interes;

      // 5. Período
      let periodo: string;
      let refBaseAgua = "";
      if (esCatastro) {
        periodo = anioFactura.toString();
      } else {
        periodo = extraerEmision(fila.referencia);
        refBaseAgua = extraerRefBaseAgua(fila.referencia);
        if (!periodo) periodo = anioFactura.toString();
      }

      const clave = `${fila.id_cliente}|${fila.id_modulo}|${fila.contrapartida}`;
      const existing = mapa.get(clave);

      if (existing) {
        // Acumulamos valores ya redondeados (cada interés ya está redondeado)
        existing.totalNominalAcum += totalNominal;
        existing.totalInteresAcum += interes;
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
          totalInteresAcum: interes,
          totalFinal: totalFactura,
          refBaseAgua,
        });
      }
    }

    console.log(`📦 Grupos consolidados: ${mapa.size}`);

    const registros: RegistroDeuda[] = [];
    for (const [, grupo] of mapa) {
      // Redondeo final del grupo (aunque ya cada interés está redondeado, el totalFinal puede tener más de 2 decimales)
      const totalRedondeado = Math.round(grupo.totalFinal * 100) / 100;
      const valorCentavos = Math.round(totalRedondeado * 100);
      if (isNaN(valorCentavos) || valorCentavos <= 0) continue;

      const periodosOrdenados = [...grupo.periodos].sort().join(", ");
      let referencia = "";
      if (grupo.id_modulo === MODULO_CATASTRO_URBANO) {
        referencia = `Catastro urbano. Años: ${periodosOrdenados}`;
      } else if (grupo.id_modulo === MODULO_CATASTRO_RURAL) {
        referencia = `Catastro rural. Años: ${periodosOrdenados}`;
      } else {
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

  static async getActiveCut(page = 1, limit = 50) {
    const corte = await prisma.parametrosCorte.findFirst({ where: { estado: "ACTIVO" } });
    if (!corte) return null;

    const [deudas, total] = await Promise.all([
      prisma.deudaBanco.findMany({
        where: { idParametro: corte.id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { nombreCliente: "asc" },
      }),
      prisma.deudaBanco.count({ where: { idParametro: corte.id } }),
    ]);

    const sumTotal = await prisma.deudaBanco.aggregate({
      where: { idParametro: corte.id },
      _sum: { totalDecimal: true },
    });

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

  static async generateTxt(): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: { nombreCliente: "asc" } } },
    });

    if (!corte || corte.deudas.length === 0) {
      throw new Error("No hay datos en el corte activo para generar el archivo.");
    }

    const lineas = corte.deudas.map(d =>
      [
        d.tipo,
        d.contrapartida,
        d.moneda,
        d.valor,
        d.formaCobro,
        "",
        "",
        d.referencia,
        d.tipoId,
        d.numeroId,
        d.nombreCliente,
      ].join("\t")
    );

    return lineas.join("\r\n");
  }

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

    ws.mergeCells("A1:K1");
    ws.getCell("A1").value =
      `REPORTE DE DEUDAS — Fecha de Corte: ${corte.fechaCorte.toISOString().split("T")[0]}  |  Generado por: ${corte.nombreUsuario}  |  ${new Date().toLocaleString("es-EC")}`;
    ws.getCell("A1").font = { bold: true, size: 11 };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 28;

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

      if (idx % 2 === 0) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7FF" } };
        });
      }

      row.getCell("valorDecimal").numFmt = '"$"#,##0.00';
      row.getCell("valor").alignment = { horizontal: "right" };
      row.height = 18;
    });

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

    ws.autoFilter = { from: "A2", to: "L2" };
    ws.views = [{ state: "frozen", ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
