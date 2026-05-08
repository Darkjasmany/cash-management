import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRecargoProntoPago,
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
  anios: Set<string>; // años de las facturas agrupadas
  totalFinal: number; // suma de (nominal + interes + prontoPago) por factura
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
    const [filasRaw, intereses] = await Promise.all([
      getDeudasSiim(new Date(fechaCorte)),
      getInteresesSiim(),
    ]);

    // 5. Para cada fila, calcula intereses y construye registro
    const registros: RegistroDeuda[] = [];

    for (const fila of filasRaw) {
      const modulo = await getModuloSiim(fila.id_modulo);
      if (!modulo) continue; // Si no se encuentra configuración del módulo, omitir

      // El total ya viene sumado de la BD (rubros sin intereses)
      // Calculamos el interés adicional sobre ese total
      const totalNominal = Number(fila.total_deuda) || 0;
      const interes = calcularInteres(
        totalNominal,
        new Date(fila.fecha_emision_max), //fecha de creación (approx: usamos hoy si no la traemos)
        fechaCorte,
        modulo,
        intereses
      );

      // Lógica de Pronto Pago (Aplica solo si el periodo es el año actual y es Predio)
      let ajusteProntoPago = 0;
      const anioEmision = new Date(fila.fecha_emision_max).getFullYear();
      // periodoEmision: YYYY como número
      // const toPeriodo = (d: Date): number => d.getFullYear() * 100 + (d.getMonth() + 1);
      // const periodoActual = toPeriodo(fechaCorte);

      if (
        anioEmision === 2026 &&
        (fila.id_modulo === MODULO_CATASTRO_URBANO || fila.id_modulo === MODULO_CATASTRO_RURAL)
      ) {
        ajusteProntoPago = calcularDescuentoRecargoProntoPago(totalNominal, fechaCorte);
      }

      // Suma final
      // const totalConInteres = Math.round((fila.total_deuda + interes) * 100) / 100; // Convertimos a centavos enteros para el formato requerido
      // const valorCentavos = Math.round(totalConInteres * 100); // sin decimales

      const totalConAjustes = totalNominal + interes + ajusteProntoPago;
      // const totalConAjustes = Math.round((totalNominal + interes + ajusteProntoPago) * 100) / 100; // Convertimos a centavos enteros para el formato requerido
      const valorCentavos = Math.round(totalConAjustes * 100);

      // if (valorCentavos <= 0) continue; // Si la deuda total con intereses es cero o negativa, omitimos
      if (isNaN(valorCentavos) || valorCentavos <= 0) continue;

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
        idCliente: String(fila.id_cliente),
        // totalDecimal: totalConInteres,
        totalDecimal: totalConAjustes,
      });
    }

    // 6. Guarda en BD propia (batch insert)
    /*if (registros.length > 0) {
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
    } */

    /**
       * El for y su contador (i += chunkSize)
        Normalmente usamos i++ (sumar 1), pero aquí estamos procesando por lotes:
        let i = 0: Empezamos en la posición cero.
        i < registros.length: Seguimos mientras no hayamos llegado al final de los 37k.
        i += chunkSize: En lugar de saltar de 1 en 1, saltamos de 5,000 en 5,000.
        Iteración 1: i es 0.
        Iteración 2: i es 5,000.
        Iteración 3: i es 10,000... y así sucesivamente.
       * El slice(i, i + chunkSize)
        El método slice sirve para "cortar" una parte de un arreglo sin modificar el original.
        ¿Cómo funciona?: Toma los elementos desde el índice i hasta el i + chunkSize (sin incluir el último).
        En la primera vuelta: registros.slice(0, 5000).
        En la segunda vuelta: registros.slice(5000, 10000).
        Esto te asegura que cada llamada a prisma.createMany solo reciba una lista de 5,000 elementos.
       */

    if (registros.length > 0) {
      const chunkSize = 5000;
      for (let i = 0; i < registros.length; i += chunkSize) {
        const chunk = registros.slice(i, i + chunkSize);
        console.log("Primer registro a insertar:", JSON.stringify(chunk[0], null, 2));
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
            idCliente: String(r.idCliente),
            totalDecimal: r.totalDecimal,
          })),
        });
        console.log(`✅ Insertados ${i + chunk.length} de ${registros.length}...`);
      }
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
