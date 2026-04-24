import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import type { ResultadoProceso } from "@/types";

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
    fechaCorteStr: string,
    usuarioId: number,
    nombreUsuario: string
  ): Promise<ResultadoProceso> {
    // 1. Desactiva el corte activo anterior (si existe)
    await prisma.parametrosCorte.updateMany({
      where: { estado: "ACTIVO" },
      data: { estado: "ACTIVO" },
    });

    // 2. Crea nuevo corte
    const nuevoCorte = await prisma.parametrosCorte.create({
      data: {
        fechaCorte: fechaCorteStr,
        estado: "ACTIVO",
        creadoPor: usuarioId,
        nombreUsuario,
      },
    });

    // 3. Elimina deudas del corte anterior (el nuevo aún no tiene)
    await prisma.deudaBanco.deleteMany({
      where: {
        parametro: { estado: "INACTIVO" },
      },
    });

    //    (las deudas de cortes INACTIVOS se borran para no acumular)
    // 4. Consulta el SIIM
    // 5. Para cada fila, calcula intereses y construye registro
    // 6. Guarda en BD propia (batch insert)
  }

  static async getActiveCut() {}

  static async generateExcel() {}

  static async generateTxt() {}
}
