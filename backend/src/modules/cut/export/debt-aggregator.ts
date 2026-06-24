import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import type { DeudaBanco } from "@prisma/client";

const MODULO_CATASTRO_URBANO = parseInt(env?.MODULO_CATASTRO_URBANO ?? "1");
const MODULO_CATASTRO_RURAL = parseInt(env?.MODULO_CATASTRO_RURAL ?? "2");

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

function extraerEmision(referencia: string): string {
  // const match = referencia.match(/Emisión:\s*(\S+)/);
  const match = referencia.match(/Emisi[oó]n:?\s*(\S+)/i);
  return match ? match[1] : "";
}

function extraerRefBaseAgua(referencia: string): string {
  // const idx = referencia.indexOf(" Emisión:");
  // return idx > 0 ? referencia.substring(0, idx) : referencia;
  const match = referencia.match(/Emisi[oó]n:?\s*(\S+)/i);
  if (match && match.index !== undefined) {
    return referencia.substring(0, match.index).trim();
  }
  // Si no encuentra la palabra "Emision", devuelve un texto vacío en lugar de la referencia entera
  return referencia ?? "";
}

export class DebtAggregator {
  static async getAggregated(idParametro: number): Promise<GrupoArchivo[]> {
    const filas = await prisma.deudaBanco.findMany({
      where: { idParametro },
      orderBy: [{ nombreCliente: "asc" }, { contrapartida: "asc" }, { fechaCreacion: "asc" }],
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

    return grupos.sort((a, b) => {
      const cmp = a.nombreCliente.localeCompare(b.nombreCliente);
      if (cmp !== 0) return cmp;
      return a.contrapartida.localeCompare(b.contrapartida);
    });
  }

  static async getDetailed(idParametro: number): Promise<DeudaBanco[]> {
    return prisma.deudaBanco.findMany({
      where: { idParametro },
      orderBy: [{ nombreCliente: "asc" }, { contrapartida: "asc" }, { fechaCreacion: "asc" }],
    });
  }

  static construirReferencia(g: GrupoArchivo): string {
    const periodosUnicos = [...new Set(g.periodos)].sort();

    const textoRango =
      periodosUnicos.length > 1
        ? `${periodosUnicos[0]} a ${periodosUnicos[periodosUnicos.length - 1]}`
        : periodosUnicos[0];

    let ref: string;

    // Evaluar segun el módulo
    if (g.id_modulo === MODULO_CATASTRO_URBANO) ref = `Catastro urbano anios ${textoRango}`;
    else if (g.id_modulo === MODULO_CATASTRO_RURAL) ref = `Catastro rural anios ${textoRango}`;
    else ref = `${g.refBaseAgua} Emisiones: ${textoRango}`;

    // Sanitizamos la referencia
    return ref.replace(/Ñ/g, "N").replace(/ñ/g, "n").replace(/[:.]/g, "");
  }

  // private static formatearPeriodos(lista: string[]): string {
  //   if (lista.length === 0) return "";
  //   if (lista.length === 1) return lista[0];

  //   const nums = lista.map(Number);
  //   const consecutivo = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);

  //   if (consecutivo) return `${lista[0]} a ${lista[lista.length - 1]}`;

  //   return lista.join(" ");
  // }
}
