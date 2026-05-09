import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRural,
  calcularDescuentoUrbano,
  calcularInteres,
  calcularMora,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { ModuloSiim, RegistroDeuda, ResultadoProceso } from "@/types";
import ExcelJS from "exceljs";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

// ─── Cédula para debug — cambia a la que quieres rastrear ────
// Deja en "" para no filtrar (mucho output si tienes 37k registros)
let DEBUG_CEDULA = "";

function getTipoId(cedula: string): string {
  const len = cedula.trim().length;
  if (len === 10) return "C";
  if (len === 13) return "R";
  return "P";
}

// ─── Grupo acumulado por cliente+módulo+contrapartida ────────
interface GrupoDeuda {
  cedula: string;
  tipoId: string;
  nombre_cliente: string;
  id_cliente: number;
  id_modulo: number;
  contrapartida: string;
  periodos: Set<string>;
  // Acumuladores SIN redondear (redondeo solo al final)
  nominalAcum: number;
  interesAcum: number;
  moraAcum: number;
  descuentoAcum: number; // negativo = descuento, positivo = recargo
  totalFinal: number;
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
    if (DEBUG_CEDULA) console.log(`🔍 Modo debug activado para cédula: ${DEBUG_CEDULA}`);

    // 1. Desactiva corte anterior
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "INACTIVO" },
    });

    // 2. Crea nuevo corte
    const corte = await prisma.parametrosCorte.create({
      data: { fechaCorte, estado: "ACTIVO", creadoPor: usuarioId, nombreUsuario },
    });
    console.log(`✅ Corte #${corte.id} creado`);

    // 3. Borra deudas de cortes INACTIVOS
    await prisma.deudaBanco.deleteMany({
      where: { parametro: { estado: "INACTIVO" } },
    });

    // 4. Consulta el SIIM
    console.log("📡 Consultando SIIM...");
    const [filasRaw, intereses, moduloUrbano, moduloRural, moduloAgua] = await Promise.all([
      getDeudasSiim(fechaCorte),
      getInteresesSiim(),
      getModuloSiim(MODULO_CATASTRO_URBANO),
      getModuloSiim(MODULO_CATASTRO_RURAL),
      getModuloSiim(MODULO_AGUA_POTABLE),
    ]);

    console.log(`📊 Facturas SIIM: ${filasRaw.length} | Intereses: ${intereses.length}`);

    if (filasRaw.length === 0) {
      return { idParametro: corte.id, fechaCorte: fechaCorteStr, totalRegistros: 0, totalDeuda: 0 };
    }

    const moduloMap: Record<number, ModuloSiim | null> = {
      [MODULO_CATASTRO_URBANO]: moduloUrbano,
      [MODULO_CATASTRO_RURAL]: moduloRural,
      [MODULO_AGUA_POTABLE]: moduloAgua,
    };

    const mapa = new Map<string, GrupoDeuda>();

    for (const fila of filasRaw) {
      const modulo = moduloMap[fila.id_modulo];
      if (!modulo) continue;

      const totalNominal = Number(fila.total_nominal) || 0;
      const sa = Number(fila.servicio_administrativo) || 0;
      const basePredial = Number(fila.base_predial_pura) || 0;

      if (totalNominal <= 0) continue;

      const esCatastro =
        fila.id_modulo === MODULO_CATASTRO_URBANO || fila.id_modulo === MODULO_CATASTRO_RURAL;
      const fechaCreacion = new Date(fila.fecha_creacion);
      const anioEmision = fechaCreacion.getFullYear();
      const esAnioActual = anioEmision === anioCorte;

      // ── 1. Descuento / Recargo de Pronto Pago ─────────────
      // Solo catastro del año actual.
      // NOTA: El descuento YA viene en total_nominal como rubro negativo
      // si el SIIM lo generó. Pero si la factura es del año actual
      // y no tiene ese rubro, lo calculamos aquí.
      // Para saber si YA viene en BD, el campo base_predial_pura
      // excluye bomberos y SA pero incluye el impuesto y la exoneración.
      // El descuento se calcula SOBRE base_predial_pura, no sobre total_nominal.
      let descuentoRecargo = 0;
      if (esCatastro && esAnioActual) {
        if (fila.id_modulo === MODULO_CATASTRO_URBANO) {
          // descuentoRecargo = calcularDescuentoUrbano(basePredial, anioEmision, fechaCorte);
          descuentoRecargo = calcularDescuentoUrbano(basePredial, anioEmision);
        } else {
          // descuentoRecargo = calcularDescuentoRural(basePredial, anioEmision, fechaCorte);
          descuentoRecargo = calcularDescuentoRural(basePredial, anioEmision);
        }
      }

      // ── 2. Base imponible del interés ──────────────────────
      // Java: total - servicioAdministrativo
      // Para urbano: si hay descuento, se suma a la base
      // (el Java ajusta la base incluyendo el descuento/recargo)
      let baseInteres = totalNominal - sa;
      if (fila.id_modulo === MODULO_CATASTRO_URBANO && esAnioActual) {
        baseInteres += descuentoRecargo; // descuento es negativo → reduce base
      }
      baseInteres = Math.max(0, baseInteres);

      // ── 3. Interés (exacto, sin redondear) ────────────────
      const interesExacto = calcularInteres(
        baseInteres,
        fechaCreacion,
        fechaCorte,
        modulo,
        intereses,
        esCatastro
      );

      // ── 4. Mora (solo años anteriores al actual) ──────────
      const moraExacta = esCatastro
        ? // ? await calcularMora(basePredial, anioEmision, fila.id_modulo, fechaCorte)
          await calcularMora(basePredial, anioEmision, fila.id_modulo)
        : 0;

      // ── 5. Total de esta factura ───────────────────────────
      const totalFactura = totalNominal + descuentoRecargo + interesExacto + moraExacta;

      // ── DEBUG ─────────────────────────────────────────────
      const esDebug = DEBUG_CEDULA && fila.cedula.trim() === DEBUG_CEDULA.trim();
      if (esDebug) {
        console.log(
          `\n📌 DEBUG Factura ${fila.id_factura} | Módulo ${fila.id_modulo} | Año ${anioEmision}`
        );
        console.log(`   total_nominal:     ${totalNominal}`);
        console.log(`   sa:                ${sa}`);
        console.log(`   base_predial_pura: ${basePredial}`);
        console.log(`   baseInteres:       ${baseInteres}`);
        console.log(`   descuentoRecargo:  ${descuentoRecargo}`);
        console.log(`   interesExacto:     ${interesExacto}`);
        console.log(`   moraExacta:        ${moraExacta}`);
        console.log(`   totalFactura:      ${totalFactura}`);
        console.log(`   referencia:        ${fila.referencia}`);
      }

      // ── 6. Período y clave de agrupación ──────────────────
      let periodo: string;
      let refBaseAgua = "";

      if (esCatastro) {
        periodo = anioEmision.toString();
      } else {
        periodo = extraerEmision(fila.referencia);
        refBaseAgua = extraerRefBaseAgua(fila.referencia);
        if (!periodo) periodo = anioEmision.toString();
      }

      const clave = `${fila.id_cliente}|${fila.id_modulo}|${fila.contrapartida}`;
      const existing = mapa.get(clave);

      if (existing) {
        existing.nominalAcum += totalNominal;
        existing.interesAcum += interesExacto;
        existing.moraAcum += moraExacta;
        existing.descuentoAcum += descuentoRecargo;
        existing.totalFinal =
          existing.nominalAcum + existing.interesAcum + existing.moraAcum + existing.descuentoAcum;
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
          nominalAcum: totalNominal,
          interesAcum: interesExacto,
          moraAcum: moraExacta,
          descuentoAcum: descuentoRecargo,
          totalFinal: totalFactura,
          refBaseAgua,
        });
      }
    }

    console.log(`📦 Grupos consolidados: ${mapa.size}`);

    // ── DEBUG — resumen del grupo si se filtró por cédula ────
    if (DEBUG_CEDULA) {
      for (const [clave, g] of mapa) {
        if (g.cedula.trim() === DEBUG_CEDULA.trim()) {
          console.log(`\n📌 GRUPO FINAL clave=${clave}`);
          console.log(`   nominalAcum:   ${g.nominalAcum.toFixed(4)}`);
          console.log(`   interesAcum:   ${g.interesAcum.toFixed(4)}`);
          console.log(`   moraAcum:      ${g.moraAcum.toFixed(4)}`);
          console.log(`   descuentoAcum: ${g.descuentoAcum.toFixed(4)}`);
          console.log(`   totalFinal:    ${g.totalFinal.toFixed(4)}`);
          console.log(`   redondeado:    ${(Math.round(g.totalFinal * 100) / 100).toFixed(2)}`);
        }
      }
    }

    // ── 7. Construye registros finales ────────────────────────
    const registros: RegistroDeuda[] = [];

    for (const [, grupo] of mapa) {
      // Redondeo UNA SOLA VEZ al final del grupo completo
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
        // Desglose redondeado para auditoría
        montoNominal: Math.round(grupo.nominalAcum * 100) / 100,
        montoInteres: Math.round(grupo.interesAcum * 100) / 100,
        montoMora: Math.round(grupo.moraAcum * 100) / 100,
        montoDescuento: grupo.descuentoAcum < 0 ? Math.round(grupo.descuentoAcum * 100) / 100 : 0,
        montoRecargo: grupo.descuentoAcum > 0 ? Math.round(grupo.descuentoAcum * 100) / 100 : 0,
      });
    }

    console.log(`💾 Registros a insertar: ${registros.length}`);

    // ── 8. Inserta en lotes ───────────────────────────────────
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
            montoNominal: r.montoNominal,
            montoInteres: r.montoInteres,
            montoMora: r.montoMora,
            montoDescuento: r.montoDescuento,
            montoRecargo: r.montoRecargo,
          })),
        });
        console.log(`  ✅ ${Math.min(i + chunkSize, registros.length)} / ${registros.length}`);
      }
    }

    const totalDeuda = registros.reduce((acc, r) => acc + r.totalDecimal, 0);
    console.log(`🎉 Registros: ${registros.length} | Total: $${totalDeuda.toFixed(2)}\n`);

    return {
      idParametro: corte.id,
      fechaCorte: fechaCorteStr,
      totalRegistros: registros.length,
      totalDeuda: Math.round(totalDeuda * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GET CORTE ACTIVO
  // ─────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────
  // GENERAR TXT
  // ─────────────────────────────────────────────────────────────
  static async generateTxt(): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: { nombreCliente: "asc" } } },
    });

    if (!corte || corte.deudas.length === 0) throw new Error("No hay datos en el corte activo.");

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

  // ─────────────────────────────────────────────────────────────
  // GENERAR EXCEL
  // ─────────────────────────────────────────────────────────────
  static async generateExcel(): Promise<Buffer> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
      include: { deudas: { orderBy: { nombreCliente: "asc" } } },
    });

    if (!corte || corte.deudas.length === 0) throw new Error("No hay datos en el corte activo.");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Cash Management - GAD Naranjal";
    wb.created = new Date();

    const ws = wb.addWorksheet("Deudas", { pageSetup: { paperSize: 9, orientation: "landscape" } });

    ws.mergeCells("A1:P1");
    ws.getCell("A1").value =
      `REPORTE DE DEUDAS — Corte: ${corte.fechaCorte.toISOString().split("T")[0]}` +
      `  |  Usuario: ${corte.nombreUsuario}` +
      `  |  ${new Date().toLocaleString("es-EC")}`;
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 28;

    ws.columns = [
      { header: "TIPO", key: "tipo", width: 8 },
      { header: "CONTRAPARTIDA", key: "contrapartida", width: 22 },
      { header: "MONEDA", key: "moneda", width: 8 },
      { header: "VALOR (cents.)", key: "valor", width: 14 },
      { header: "TOTAL USD", key: "valorDecimal", width: 14 },
      { header: "NOMINAL", key: "montoNominal", width: 12 },
      { header: "INTERÉS", key: "montoInteres", width: 12 },
      { header: "MORA", key: "montoMora", width: 10 },
      { header: "DESCUENTO", key: "montoDescuento", width: 12 },
      { header: "RECARGO", key: "montoRecargo", width: 10 },
      { header: "FORMA COBRO", key: "formaCobro", width: 12 },
      { header: "EN BLANCO", key: "ref1", width: 10 },
      { header: "EN BLANCO", key: "ref2", width: 10 },
      { header: "REFERENCIA", key: "referencia", width: 50 },
      { header: "TIPO ID", key: "tipoId", width: 9 },
      { header: "NUMERO ID", key: "numeroId", width: 15 },
      { header: "NOMBRE CLIENTE", key: "nombreCliente", width: 38 },
    ];

    const headerRow = ws.getRow(2);
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF1E40AF" } } };
    });
    headerRow.height = 22;

    const usd = '"$"#,##0.00';

    corte.deudas.forEach((d, idx) => {
      const row = ws.addRow({
        tipo: d.tipo,
        contrapartida: d.contrapartida,
        moneda: d.moneda,
        valor: d.valor,
        valorDecimal: parseFloat(d.totalDecimal.toString()),
        montoNominal: parseFloat((d as any).montoNominal?.toString() ?? "0"),
        montoInteres: parseFloat((d as any).montoInteres?.toString() ?? "0"),
        montoMora: parseFloat((d as any).montoMora?.toString() ?? "0"),
        montoDescuento: parseFloat((d as any).montoDescuento?.toString() ?? "0"),
        montoRecargo: parseFloat((d as any).montoRecargo?.toString() ?? "0"),
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

      [
        "valorDecimal",
        "montoNominal",
        "montoInteres",
        "montoMora",
        "montoDescuento",
        "montoRecargo",
      ].forEach(k => {
        row.getCell(k).numFmt = usd;
      });
      row.getCell("valor").alignment = { horizontal: "right" };
      row.height = 18;
    });

    const totalRow = ws.addRow({
      tipo: "TOTAL",
      contrapartida: `${corte.deudas.length} registros`,
      valorDecimal: corte.deudas.reduce((acc, d) => acc + parseFloat(d.totalDecimal.toString()), 0),
    });
    totalRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    });
    totalRow.getCell("valorDecimal").numFmt = usd;

    ws.autoFilter = { from: "A2", to: "Q2" };
    ws.views = [{ state: "frozen", ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
