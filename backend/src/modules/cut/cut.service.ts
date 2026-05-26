import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import {
  calcularDescuentoRural,
  calcularDescuentoUrbano,
  calcularInteresRedondeado,
  calcularMora,
  getDeudasSiim,
  getInteresesSiim,
  getModuloSiim,
} from "@/services/siim.service";
import type { CuttingParams, ModuloSiim, ResultadoProceso, ResumenModuloDashboard } from "@/types";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");
const MODULO_AGUA_POTABLE = parseInt(env?.MODULO_AGUA_POTABLE ?? "3");

function getTipoId(cedula: string): string {
  const len = cedula.trim().length;
  if (len === 10) return "C";
  if (len === 13) return "R";
  return "P";
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
  fechaCreacion: Date;
  montoNominal: number;
  montoInteres: number;
  montoMora: number;
  montoDescuento: number;
  montoRecargo: number;
  totalFactura: number;
  impuestoPredial: number;
  exoneracion: number;
  cem: number;
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

    // 1. Desactivar corte anterior
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "INACTIVO" },
    });

    // 2. Crear nuevo corte
    const corte = await prisma.parametrosCorte.create({
      data: {
        fechaCorte,
        estado: "ACTIVO",
        creadoPor: usuarioId,
        nombreUsuario,
        totalRegistros: "0",
        totalDeuda: "0.00",
      },
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
      const impuestoPredial = Number(fila.impuesto_predial) || 0;
      const exoneracion = Number(fila.exoneracion) || 0;
      const cem = Number(fila.cem) || 0;

      // Si queda un sobrante, se calculará solo sobre ese valor.
      const impuestoNeto = Math.max(0, impuestoPredial + exoneracion); // filtro para evitar valores negativos, garantizando si es negativo muestra 0

      // Si no hay nominal ni impuesto que cobrar, saltamos la fila
      // Para agua, impuestoPredial será 0 (no aplica)
      if (totalNominal <= 0 && impuestoNeto <= 0) continue;

      const esCatastro =
        Number(fila.id_modulo) === Number(MODULO_CATASTRO_URBANO) ||
        Number(fila.id_modulo) === Number(MODULO_CATASTRO_RURAL);
      const fechaCreacion = new Date(fila.fecha_creacion);
      const anioEmision = fechaCreacion.getFullYear();
      const esAnioActual = anioEmision === anioCorte;

      /// ---- 1. Descuento/Recargo (solo catastro año actual, usando impuestoPredial) ----
      let descuento = 0;
      let recargo = 0;
      if (esCatastro && esAnioActual) {
        let dr = 0;
        if (Number(fila.id_modulo) === MODULO_CATASTRO_URBANO) {
          // Si el impuestoNeto es 0, el descuento será 0
          dr = calcularDescuentoUrbano(impuestoNeto, anioEmision);
        } else {
          // dr = calcularDescuentoRural(impuestoPredial, anioEmision);
          dr = calcularDescuentoRural(impuestoNeto, anioEmision);
        }
        if (dr < 0) descuento = dr;
        if (dr > 0) recargo = dr;
      }

      // ---- 2. Base imponible del interés (según Java) ----
      let baseInteres = 0;
      if (esCatastro) {
        baseInteres = impuestoNeto; // Aquí se vuelve 0 (0.00 predial + 0.00 exoneración)

        if (Number(fila.id_modulo) === MODULO_CATASTRO_URBANO && esAnioActual) {
          baseInteres += descuento + recargo;
        } else if (Number(fila.id_modulo) === MODULO_CATASTRO_RURAL) {
          baseInteres += cem; // Aquí 0 + 0.42 = 0.42
        }
      } else {
        baseInteres = totalNominal - sa;
      }
      baseInteres = Math.max(0, baseInteres);

      // ---- 3. Interés redondeado ----
      const interes = calcularInteresRedondeado(
        baseInteres,
        fechaCreacion,
        fechaCorte,
        modulo,
        intereses
      );

      // ---- 4. Mora (solo años anteriores, usando impuestoPredial) ----
      let mora = 0;
      if (esCatastro && anioEmision < anioCorte) {
        mora = calcularMora(impuestoNeto, anioEmision, Number(fila.id_modulo));
      }

      // ---- 5. Total de la factura ----
      const totalFactura =
        Math.round((totalNominal + descuento + recargo + interes + mora) * 100) / 100;

      // ---- 6. Guardar ----
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
        fechaCreacion: new Date(fila.fecha_creacion),
        montoNominal: totalNominal,
        montoInteres: interes,
        montoMora: mora,
        montoDescuento: descuento,
        montoRecargo: recargo,
        totalFactura: totalFactura,
        impuestoPredial: impuestoPredial,
        exoneracion: exoneracion,
        cem: cem,
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
            fechaCreacion: f.fechaCreacion,
            montoNominal: f.montoNominal,
            montoInteres: f.montoInteres,
            montoMora: f.montoMora,
            montoDescuento: f.montoDescuento,
            montoRecargo: f.montoRecargo,
            totalFactura: f.totalFactura,
            impuestoPredial: f.impuestoPredial,
            exoneracion: f.exoneracion,
            cem: f.cem,
          })),
        });
        console.log(`  ✅ ${Math.min(i + chunkSize, facturas.length)} / ${facturas.length}`);
      }
    }

    // Totales finales númericos
    const totalRegistrosCalc = facturas.length;
    const totalDeudaCalc = facturas.reduce((acc, f) => acc + f.totalFactura, 0);
    const totalDeudaRedondeado = Math.round(totalDeudaCalc * 100) / 100;

    // Actualizamos los totales reales en la fila de ParametrosCorte
    console.log(`📝 Actualizando totales en ParametrosCorte para el Corte #${corte.id}...`);
    await prisma.parametrosCorte.update({
      where: { id: corte.id },
      data: {
        totalRegistros: totalRegistrosCalc.toString(), // Guardado como String
        totalDeuda: totalDeudaRedondeado.toFixed(2).toString(), // Guardado como String con 2 decimales
      },
    });

    console.log(
      `🎉 Corte completado. Facturas: ${totalRegistrosCalc} | Total: $${totalDeudaRedondeado.toFixed(2)}\n`
    );

    return {
      idParametro: corte.id,
      fechaCorte: fechaCorteStr,
      totalRegistros: totalRegistrosCalc,
      totalDeuda: totalDeudaRedondeado,
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

  static async findAll(): Promise<CuttingParams[]> {
    const cortes = await prisma.parametrosCorte.findMany({
      orderBy: { estado: "asc" },
    });

    return cortes.map(corte => ({
      ...corte,
      fechaCorte: corte.fechaCorte.toISOString().split("T")[0],
      creadoEn: corte.creadoEn.toISOString().split("T")[0],
    }));
  }

  static async findAllByType(): Promise<ResumenModuloDashboard[]> {
    const resultadoAgrupado = await prisma.deudaBanco.groupBy({
      by: ["id_modulo"],
      _count: { idCliente: true },
      _sum: { totalFactura: true },
      orderBy: { id_modulo: "asc" },
    });

    const nombresModulos: Record<number, string> = {
      1: "MODULO URBANO",
      2: "MODULO RURAL",
      3: "MODULO AGUA POTABLE",
    };

    return resultadoAgrupado.map(result => {
      const idModulo = result.id_modulo;

      const totalDeuda = Number(result._sum.totalFactura) || 0;

      return {
        id_modulo: idModulo,
        modulo: nombresModulos[idModulo] || "S/N",
        totalClientes: result._count.idCliente,
        totalDeuda: Math.round(totalDeuda * 100) / 100,
      };
    });
  }
}
