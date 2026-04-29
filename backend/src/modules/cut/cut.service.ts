import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { calcularInteres, getModuloSiim } from "@/services/siim.service";
import { getDeudasSiim, getInteresesSiim } from "@/services/siim.service copy";
import type { RegistroDeuda, ResultadoProceso } from "@/types";

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

  static async getActiveCut() {}

  static async generateExcel() {}

  static async generateTxt() {}
}
