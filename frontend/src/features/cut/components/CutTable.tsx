import { type Cortes } from "../api/cut.api";
import { DownloadButtons } from "./DownloadButtons";

type Props = {
  cuts: Cortes[];
  isLoading: boolean;
};

const CutTable = ({ cuts, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        Cargando cortes...
      </div>
    );
  }

  if (cuts.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        No hay cortes registrados
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full rounded-xl border border-slate-800 bg-slate-950/40 backdrop-blur-sm">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50">
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px] w-12 text-center">
              #
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
              Fecha Corte
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
              Total Registros
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
              Total Deuda
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
              Estado
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px]">
              Creado Por
            </th>
            <th className="py-3.5 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[11px] text-right">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {cuts.map((cut, index) => {
            const isActive = cut.estado === "ACTIVO";

            return (
              <tr key={cut.id} className="hover:bg-slate-900/40 transition-colors group">
                {/* Índice */}
                <td className="py-4 px-4 text-slate-500 font-mono text-center">{index + 1}</td>

                {/* Fecha */}
                <td className="py-4 px-4 text-white font-medium font-mono">{cut.fechaCorte}</td>

                {/* Total Registros */}
                <td className="py-4 px-4">
                  <span className="bg-sky-950/60 text-sky-400 border border-sky-900/50 font-medium text-xs px-2.5 py-1 rounded-md shadow-sm">
                    {Number(cut.totalRegistros || 0).toLocaleString()}
                  </span>
                </td>

                {/* Total Deuda */}
                <td className="py-4 px-4 font-semibold text-slate-300">
                  {cut.totalDeuda
                    ? `$${Number(cut.totalDeuda).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : "—"}
                </td>

                {/* Estado con Badge Dinámico */}
                <td className="py-4 px-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      isActive
                        ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-slate-500"}`}
                    />
                    {cut.estado}
                  </span>
                </td>

                {/* Usuario */}
                <td className="py-4 px-4 text-slate-400 font-medium">{cut.nombreUsuario}</td>

                {/* Acciones Condicionales */}
                <td className="py-4 px-4 text-right">
                  {isActive ? (
                    <DownloadButtons variant="compact" />
                  ) : (
                    <span className="text-slate-600 font-bold pr-4 block text-right">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CutTable;
