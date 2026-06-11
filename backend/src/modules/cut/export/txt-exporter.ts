import { prisma } from "@/lib/db";
import { DebtAggregator } from "./debt-aggregator";

export class TxtExporter {
  static async generate(consolidado: boolean): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!corte) throw new Error("No hay corte activo.");

    if (consolidado) {
      return this.generateConsolidated(corte.id);
    }
    return this.generateDetailed(corte.id);
  }

  private static async generateConsolidated(idParametro: number): Promise<string> {
    const grupos = await DebtAggregator.getAggregated(idParametro);
    if (grupos.length === 0) throw new Error("No hay datos en el corte activo.");

    const lineas = grupos.map(g => {
      const nombreSanitizado = (g.nombreCliente || "")
        .replace(/Ñ/g, "N")
        .replace(/ñ/g, "n")
        .replace(/[.,()+'\-]/g, "") // El guion (-) va al final para que no se confunda con un rango
        .trim()
        .substring(0, 30)
        .trim();

      return [
        "CO",
        g.contrapartida,
        "USD",
        g.totalCentavos,
        "REC",
        "",
        "",
        DebtAggregator.construirReferencia(g),
        "N", // g.tipoId,
        g.numeroId,
        nombreSanitizado,
      ].join("\t");
    });

    return lineas.join("\r\n");
  }

  private static async generateDetailed(idParametro: number): Promise<string> {
    const deudas = await DebtAggregator.getDetailed(idParametro);
    if (deudas.length === 0) throw new Error("No hay datos en el corte activo.");

    const lineas = deudas.map(d => {
      const centavos = Math.round(parseFloat(d.totalFactura.toString()) * 100);
      const nombreSanitizado = (d.nombreCliente || "")
        .replace(/Ñ/g, "N")
        .replace(/ñ/g, "n")
        .replace(/[.,()+'\-]/g, "") // El guion (-) va al final para que no se confunda con un rango
        .trim()
        .substring(0, 30)
        .trim();

      return [
        "CO",
        d.contrapartida,
        "USD",
        centavos,
        "REC",
        "",
        "",
        d.referencia.replace(/:/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N"),
        "N", // d.tipoId,
        d.numeroId,
        nombreSanitizado,
      ].join("\t");
    });

    return lineas.join("\r\n");
  }
}
