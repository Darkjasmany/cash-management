import { prisma } from "@/lib/db";
import { DebtAggregator } from "./debt-aggregator";

export class TxtExporter {
  static async generate(detalle: boolean): Promise<string> {
    const corte = await prisma.parametrosCorte.findFirst({
      where: { estado: "ACTIVO" },
    });
    if (!corte) throw new Error("No hay corte activo.");

    if (detalle) {
      return this.generateDetailed(corte.id);
    }
    return this.generateConsolidated(corte.id);
  }

  private static async generateConsolidated(idParametro: number): Promise<string> {
    const grupos = await DebtAggregator.getAggregated(idParametro);
    if (grupos.length === 0) throw new Error("No hay datos en el corte activo.");

    const lineas = grupos.map(g => {
      return [
        "CO",
        g.contrapartida.slice(0, 20),
        "USD",
        g.totalCentavos,
        "REC",
        "",
        "",
        DebtAggregator.construirReferencia(g).slice(0, 50),
        "N", // g.tipoId,
        "", //g.numeroId,
        DebtAggregator.nombreSanitizado(g.nombreCliente),
      ].join("\t");
    });

    return lineas.join("\r\n");
  }

  private static async generateDetailed(idParametro: number): Promise<string> {
    const deudas = await DebtAggregator.getDetailed(idParametro);
    if (deudas.length === 0) throw new Error("No hay datos en el corte activo.");

    const lineas = deudas.map(d => {
      const centavos = Math.round(parseFloat(d.totalFactura.toString()) * 100);

      return [
        "CO",
        d.contrapartida.slice(0, 20),
        "USD",
        centavos,
        "REC",
        "",
        "",
        d.referencia.replace(/:/g, "").replace(/ñ/g, "n").replace(/Ñ/g, "N").slice(0, 50),
        "N", // d.tipoId,
        "", //d.numeroId,
        DebtAggregator.nombreSanitizado(d.nombreCliente),
      ].join("\t");
    });

    return lineas.join("\r\n");
  }
}
