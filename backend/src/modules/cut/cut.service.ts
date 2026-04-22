import { env } from "@/config/env";

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
  static async processCut(fechaCorteStr: string, usuarioId: number, nombreUsuario: string) {}

  static async getActiveCut() {}

  static async generateExcel() {}

  static async generateTxt() {}
}
