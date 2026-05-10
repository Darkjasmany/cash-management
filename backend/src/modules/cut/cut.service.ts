import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRural,
  calcularDescuentoUrbano,
  calcularInteresRedondeado,
  calcularMoraRedondeada,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { ModuloSiim, ResultadoProceso } from "@/types";
import ExcelJS from "exceljs";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ─── Cédula para debug (vacía = desactivado) ─────────────────
const DEBUG_CEDULA = "0701581357"; // cédula de ALVARADO PROCEL NARCISA MACLOVIA

function getTipoId(cedula: string): string {
  const len = cedula.trim().length;
  if (len === 10) return "C";
  if (len === 13) return "R";
  return "P";
}

function extraerEmision(referencia: string): string {
  const match = referencia.match(/Emisión:\s*(\S+)/);
  return match ? match[1] : "";
}

function extraerRefBaseAgua(referencia: string): string {
  const idx = referencia.indexOf(" Emisión:");
  return idx > 0 ? referencia.substring(0, idx) : referencia;
}

// ─── Tipo para guardar una factura individual ────────────────
interface FacturaGuardada {
  idFacturaSiim: number;
  id_modulo: number;
  tipo: string;
  contrapartida: string;
  moneda: string;
  formaCobro: string;
  referencia: string;
  tipoId: string;
  numeroId: string;
  nombreCliente: string;
  idCliente: string;
  montoNominal: number;
  montoInteres: number;
  montoMora: number;
  montoDescuento: number;
  montoRecargo: number;
  totalFactura: number;
  // Nuevos campos para auditoría
  impuestoPredial: number;
  exoneracion: number;
  cem: number;
}

// ─── Grupo para archivo TXT/Excel ────────────────────────────
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

export class CutService {
  // ─────────────────────────────────────────────────────────────
  // PROCESAR CORTE
  // ─────────────────────────────────────────────────────────────
  static async processCut(
    fechaCorteStr: string,
    usuarioId: number,
    nombreUsuario: string
  ): Promise<ResultadoProceso> {
    const fechaCorte = new Date(fechaCorteStr);
    const anioCorte = fechaCorte.getFullYear();

    console.log(`\n🔄 Corte: ${fechaCorteStr} | ${nombreUsuario}`);
    console.log(`   Fecha actual del servidor: ${new Date().toISOString()}`);
    if (DEBUG_CEDULA) console.log(`🔍 Debug cédula: ${DEBUG_CEDULA}`);

    // 1. Desactivar corte anterior
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "INACTIVO" },
    });

    // 2. Crear nuevo corte
    const corte = await prisma.parametrosCorte.create({
      data: { fechaCorte, estado: "ACTIVO", creadoPor: usuarioId, nombreUsuario },
    });
    console.log(`✅ Corte #${corte.id} creado`);

    // 3. Limpiar deudas de cortes INACTIVOS
    await prisma.deudaBanco.deleteMany({
      where: { parametro: { estado: "INACTIVO" } },
    });

    // 4. Obtener datos del SIIM
    console.log("📡 Consultando SIIM...");
    const [filasRaw, intereses, moduloUrbano, moduloRural, moduloAgua] = await Promise.all([
      getDeudasSiim(fechaCorte),
      getInteresesSiim(),
      getModuloSiim(MODULO_CATASTRO_URBANO),
      getModuloSiim(MODULO_CATASTRO_RURAL),
      getModuloSiim(MODULO_AGUA_POTABLE),
    ]);

    console.log(`📊 Facturas: ${filasRaw.length} | Intereses: ${intereses.length}`);

    if (filasRaw.length === 0) {
      return { idParametro: corte.id, fechaCorte: fechaCorteStr, totalRegistros: 0, totalDeuda: 0 };
    }

    const moduloMap: Record<number, ModuloSiim | null> = {
      [MODULO_CATASTRO_URBANO]: moduloUrbano,
      [MODULO_CATASTRO_RURAL]: moduloRural,
      [MODULO_AGUA_POTABLE]: moduloAgua,
    };

    const facturas: FacturaGuardada[] = [];

    for (const fila of filasRaw) {
      const modulo = moduloMap[fila.id_modulo];
      if (!modulo) continue;

      const totalNominal = Number(fila.total_nominal) || 0;
      const sa = Number(fila.servicio_administrativo) || 0;
      const impuestoPredial = Number(fila.impuesto_predial) || 0; // ← nueva base
      const exoneracion = Number(fila.exoneracion) || 0;
      const cem = Number(fila.cem) || 0;

      // Para agua, impuestoPredial será 0 (no aplica)
      if (totalNominal <= 0) continue;

      const esCatastro =
        fila.id_modulo === MODULO_CATASTRO_URBANO || fila.id_modulo === MODULO_CATASTRO_RURAL;
      const fechaCreacion = new Date(fila.fecha_creacion);
      const anioEmision = fechaCreacion.getFullYear();
      const esAnioActual = anioEmision === anioCorte;

      /// ---- 1. Descuento/Recargo (solo catastro año actual, usando impuestoPredial) ----
      let descuento = 0;
      let recargo = 0;
      if (esCatastro && esAnioActual) {
        let dr = 0;
        if (fila.id_modulo === MODULO_CATASTRO_URBANO) {
          dr = calcularDescuentoUrbano(impuestoPredial, anioEmision);
        } else {
          dr = calcularDescuentoRural(impuestoPredial, anioEmision);
        }
        if (dr < 0) descuento = dr;
        if (dr > 0) recargo = dr;
      }

      // ---- 2. Base imponible del interés (según Java) ----
      // base = totalNominal - servicios_administrativos
      let baseInteres = totalNominal - sa;
      // En urbano, si hay descuento/recargo, se suma a la base (según Java)
      if (fila.id_modulo === MODULO_CATASTRO_URBANO && esAnioActual) {
        baseInteres += descuento + recargo;
      }
      baseInteres = Math.max(0, baseInteres);

      // ---- 3. Interés redondeado (con logs para depurar) ----
      const interes = calcularInteresRedondeado(
        baseInteres,
        fechaCreacion,
        fechaCorte,
        modulo,
        intereses,
        esCatastro
      );

      // ---- 4. Mora (solo años anteriores, usando impuestoPredial) ----
      const mora = esCatastro
        ? await calcularMoraRedondeada(impuestoPredial, anioEmision, fila.id_modulo)
        : 0;

      // ---- 5. Total de la factura ----
      const totalFactura =
        Math.round((totalNominal + descuento + recargo + interes + mora) * 100) / 100;

      // ---- 6. Logs de depuración ----
      if (DEBUG_CEDULA && fila.cedula.trim() === DEBUG_CEDULA) {
        console.log(`\n📌 FACTURA ${fila.id_factura} | mod=${fila.id_modulo} | año=${anioEmision}`);
        console.log(
          `   totalNominal=${totalNominal}, sa=${sa}, impuestoPredial=${impuestoPredial}`
        );
        console.log(`   baseInteres=${baseInteres}, descuento=${descuento}, recargo=${recargo}`);
        console.log(`   interes=${interes}, mora=${mora}, total=${totalFactura}`);
        console.log(`   referencia="${fila.referencia}"`);
      }

      // ---- 7. Guardar (incluyendo los nuevos campos) ----
      facturas.push({
        idFacturaSiim: Number(fila.id_factura),
        id_modulo: Number(fila.id_modulo),
        tipo: "CO",
        contrapartida: fila.contrapartida,
        moneda: "USD",
        formaCobro: "REC",
        referencia: fila.referencia,
        tipoId: getTipoId(fila.cedula),
        numeroId: fila.cedula,
        nombreCliente: fila.nombre_cliente,
        idCliente: String(fila.id_cliente),
        montoNominal: totalNominal,
        montoInteres: interes,
        montoMora: mora,
        montoDescuento: descuento,
        montoRecargo: recargo,
        totalFactura: totalFactura,
        // --- NUEVOS campos ---
        impuestoPredial: impuestoPredial, // viene de fila.impuesto_predial
        exoneracion: fila.exoneracion ?? 0,
        cem: fila.cem ?? 0,
      });
    }

    console.log(`💾 Insertando ${facturas.length} facturas...`);
    if (facturas.length > 0) {
      const chunkSize = 5000;
      for (let i = 0; i < facturas.length; i += chunkSize) {
        const chunk = facturas.slice(i, i + chunkSize);
        await prisma.deudaBanco.createMany({
          data: chunk.map(f => ({
            idParametro: corte.id,
            idFacturaSiim: f.idFacturaSiim,
            id_modulo: f.id_modulo,
            tipo: f.tipo,
            contrapartida: f.contrapartida,
            moneda: f.moneda,
            formaCobro: f.formaCobro,
            referencia: f.referencia,
            tipoId: f.tipoId,
            numeroId: f.numeroId,
            nombreCliente: f.nombreCliente,
            idCliente: f.idCliente,
            montoNominal: f.montoNominal,
            montoInteres: f.montoInteres,
            montoMora: f.montoMora,
            montoDescuento: f.montoDescuento,
            montoRecargo: f.montoRecargo,
            totalFactura: f.totalFactura,
            // Nuevos campos
            impuestoPredial: f.impuestoPredial,
            exoneracion: f.exoneracion,
            cem: f.cem,
          })),
        });
        console.log(`  ✅ ${Math.min(i + chunkSize, facturas.length)} / ${facturas.length}`);
      }
    }

    const totalDeuda = facturas.reduce((acc, f) => acc + f.totalFactura, 0);
    console.log(
      `🎉 Corte completado. Facturas: ${facturas.length} | Total: $${totalDeuda.toFixed(2)}\n`
    );

    return {
      idParametro: corte.id,
      fechaCorte: fechaCorteStr,
      totalRegistros: facturas.length,
      totalDeuda: Math.round(totalDeuda * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GET CORTE ACTIVO (facturas individuales paginadas)
  // ─────────────────────────────────────────────────────────────
  static async getActiveCut(page = 1, limit = 50) {
    const corte = await prisma.parametrosCorte.findFirst({ where: { estado: "ACTIVO" } });
    if (!corte) return null;

    const [deudas, total] = await Promise.all([
      prisma.deudaBanco.findMany({
        where: { idParametro: corte.id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ nombreCliente: "asc" }, { idFacturaSiim: "asc" }],
      }),
      prisma.deudaBanco.count({ where: { idParametro: corte.id } }),
    ]);

    const sumTotal = await prisma.deudaBanco.aggregate({
      where: { idParametro: corte.id },
      _sum: { totalFactura: true },
    });

    return {
      corte: {
        id: corte.id,
        fechaCorte: corte.fechaCorte,
        creadoEn: corte.creadoEn,
        nombreUsuario: corte.nombreUsuario,
      },
      deudas,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      resumen: {
        totalFacturas: total,
        totalDeuda: sumTotal._sum.totalFactura ?? 0,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // AGRUPAR para TXT/Excel
  // ─────────────────────────────────────────────────────────────
  private static async agruparParaArchivo(idParametro: number): Promise<GrupoArchivo[]> {
    const filas = await prisma.deudaBanco.findMany({
      where: { idParametro },
      orderBy: [{ nombreCliente: "asc" }],
    });

    const mapa = new Map<string, GrupoArchivo>();

    for (const f of filas) {
      const esCatastro =
        f.id_modulo === MODULO_CATASTRO_URBANO || f.id_modulo === MODULO_CATASTRO_RURAL;
      let periodo: string;
      let refBaseAgua = "";

      if (esCatastro) {
        const match = f.referencia.match(/(\d{4})$/);
        periodo = match ? match[1] : "";
      } else {
        periodo = extraerEmision(f.referencia);
        refBaseAgua = extraerRefBaseAgua(f.referencia);
        if (!periodo) periodo = "";
      }

      const clave = `${f.idCliente}|${f.id_modulo}|${f.contrapartida}`;
      const totalFact = parseFloat(f.totalFactura.toString());

      const existing = mapa.get(clave);
      if (existing) {
        existing.totalExacto += totalFact;
        if (periodo) existing.periodos.add(periodo);
        if (!esCatastro && refBaseAgua && !existing.refBaseAgua) existing.refBaseAgua = refBaseAgua;
      } else {
        mapa.set(clave, {
          contrapartida: f.contrapartida,
          tipoId: f.tipoId,
          numeroId: f.numeroId,
          nombreCliente: f.nombreCliente,
          idCliente: f.idCliente,
          id_modulo: f.id_modulo,
          periodos: periodo ? new Set([periodo]) : new Set(),
          refBaseAgua,
          totalExacto: totalFact,
          totalDecimal: 0,
          totalCentavos: 0,
        });
      }
    }

    const grupos: GrupoArchivo[] = [];
    for (const [, g] of mapa) {
      const redondeado = Math.round(g.totalExacto * 100) / 100;
      const centavos = Math.round(redondeado * 100);
      if (centavos <= 0) continue;
      g.totalDecimal = redondeado;
      g.totalCentavos = centavos;
      grupos.push(g);
    }
    return grupos.sort((a, b) => a.nombreCliente.localeCompare(b.nombreCliente));
  }

  private static construirReferencia(g: GrupoArchivo): string {
    const periodos = [...g.periodos].sort().join(", ");
    if (g.id_modulo === MODULO_CATASTRO_URBANO) return `Catastro urbano. Años: ${periodos}`;
    if (g.id_modulo === MODULO_CATASTRO_RURAL) return `Catastro rural. Años: ${periodos}`;
    return `${g.refBaseAgua} Emisiones: ${periodos}`;
  }

  // ─────────────────────────────────────────────────────────────
  // GENERAR TXT
  // ─────────────────────────────────────────────────────────────
  static async generateTxt(): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({ where: { estado: "ACTIVO" } });
    if (!corte) throw new Error("No hay corte activo.");
    const grupos = await CutService.agruparParaArchivo(corte.id);
    if (grupos.length === 0) throw new Error("No hay datos en el corte activo.");
    const lineas = grupos.map(g =>
      [
        "CO",
        g.contrapartida,
        "USD",
        g.totalCentavos,
        "REC",
        "",
        "",
        CutService.construirReferencia(g),
        g.tipoId,
        g.numeroId,
        g.nombreCliente,
      ].join("\t")
    );
    return lineas.join("\r\n");
  }

  // ─────────────────────────────────────────────────────────────
  // GENERAR EXCEL
  // ─────────────────────────────────────────────────────────────
  static async generateExcel(): Promise<Buffer> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: [{ nombreCliente: "asc" }, { idFacturaSiim: "asc" }] } },
    });
    if (!corte || corte.deudas.length === 0) throw new Error("No hay datos en el corte activo.");

    const grupos = await CutService.agruparParaArchivo(corte.id);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Cash Management - GAD Naranjal";
    wb.created = new Date();
    const encabezado = `Corte: ${corte.fechaCorte.toISOString().split("T")[0]}  |  ${corte.nombreUsuario}  |  ${new Date().toLocaleString("es-EC")}`;
    const usd = '"$"#,##0.00';

    const ws1 = wb.addWorksheet("Consolidado Banco", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });
    ws1.mergeCells("A1:J1");
    ws1.getCell("A1").value = `REPORTE CONSOLIDADO — ${encabezado}`;
    ws1.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws1.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws1.getRow(1).height = 26;
    ws1.columns = [
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
    const h1 = ws1.getRow(2);
    h1.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { horizontal: "center" };
    });
    h1.height = 20;
    grupos.forEach((g, idx) => {
      const row = ws1.addRow({
        tipo: "CO",
        contrapartida: g.contrapartida,
        moneda: "USD",
        valor: g.totalCentavos,
        totalUsd: g.totalDecimal,
        cobro: "REC",
        b1: "",
        b2: "",
        referencia: CutService.construirReferencia(g),
        tipoId: g.tipoId,
        numeroId: g.numeroId,
        nombre: g.nombreCliente,
      });
      if (idx % 2 === 0)
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7FF" } };
        });
      row.getCell("totalUsd").numFmt = usd;
      row.getCell("valor").alignment = { horizontal: "right" };
      row.height = 18;
    });
    const t1 = ws1.addRow({
      tipo: "TOTAL",
      contrapartida: `${grupos.length} registros`,
      totalUsd: grupos.reduce((a, g) => a + g.totalDecimal, 0),
    });
    t1.eachCell(c => {
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    });
    t1.getCell("totalUsd").numFmt = usd;
    ws1.autoFilter = { from: "A2", to: "L2" };
    ws1.views = [{ state: "frozen", ySplit: 2 }];

    const ws2 = wb.addWorksheet("Detalle por Factura", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });
    ws2.mergeCells("A1:M1");
    ws2.getCell("A1").value = `DETALLE POR FACTURA — ${encabezado}`;
    ws2.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws2.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws2.getRow(1).height = 26;
    ws2.columns = [
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
    const h2 = ws2.getRow(2);
    h2.eachCell(c => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { horizontal: "center" };
    });
    h2.height = 20;
    corte.deudas.forEach((d, idx) => {
      const row = ws2.addRow({
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
        ref: d.referencia,
        tipoId: d.tipoId,
      });
      if (idx % 2 === 0)
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7FF" } };
        });
      ["nominal", "interes", "mora", "desc", "rec", "total"].forEach(
        k => (row.getCell(k).numFmt = usd)
      );
      row.height = 18;
    });
    ws2.autoFilter = { from: "A2", to: "M2" };
    ws2.views = [{ state: "frozen", ySplit: 2 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
