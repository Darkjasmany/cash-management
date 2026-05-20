import { type Cortes } from "../api/cut.api";
import { DownloadButtons } from "./DownloadButtons";

type Props = {
  cuts: Cortes[];
  isLoading: boolean;
};

const CutTable = ({ cuts, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/60 rounded-xl">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500 mb-3"></div>
        <p className="text-slate-400 text-sm font-medium">Cargando historial de cortes...</p>
      </div>
    );
  }

  if (cuts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/60 border-dashed rounded-xl">
        <p className="text-slate-500 text-sm font-medium">No se encontraron cortes registrados</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden w-full rounded-xl border border-slate-800/80 bg-slate-950/40 backdrop-blur-md shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse table-auto">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px] w-12 text-center">
                #
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                Fecha Corte
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                Total Registros
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                Total Deuda
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                Estado
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                Creado Por
              </th>
              <th className="py-4 px-4 text-slate-400 font-semibold tracking-wider uppercase text-[10px] text-right pr-6">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {cuts.map((cut, index) => {
              const isActive = cut.estado === "ACTIVO";

              return (
                <tr key={cut.id} className="hover:bg-slate-900/30 transition-colors group/row">
                  {/* Índice */}
                  <td className="py-3.5 px-4 text-slate-600 font-mono text-center text-xs">
                    {index + 1}
                  </td>

                  {/* Fecha */}
                  <td className="py-3.5 px-4 text-slate-200 font-medium font-mono tracking-tight">
                    {cut.fechaCorte}
                  </td>

                  {/* Total Registros */}
                  <td className="py-3.5 px-4">
                    <span className="bg-sky-950/40 text-sky-400 border border-sky-900/40 font-mono text-xs px-2.5 py-0.5 rounded-md shadow-sm inline-block">
                      {Number(cut.totalRegistros || 0).toLocaleString()}
                    </span>
                  </td>

                  {/* Total Deuda */}
                  <td className="py-3.5 px-4 font-semibold text-slate-300 font-mono">
                    {cut.totalDeuda && Number(cut.totalDeuda) > 0 ? (
                      `$${Number(cut.totalDeuda).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    ) : (
                      <span className="text-slate-600 font-normal">$0.00</span>
                    )}
                  </td>

                  {/* Estado con Badge Dinámico */}
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        isActive
                          ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/40 shadow-sm"
                          : "bg-slate-900/60 text-slate-500 border-slate-800/80"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isActive
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse"
                            : "bg-slate-600"
                        }`}
                      />
                      {cut.estado}
                    </span>
                  </td>

                  {/* Usuario */}
                  <td className="py-3.5 px-4 text-slate-400 text-xs font-medium">
                    {cut.nombreUsuario || "Sistema"}
                  </td>

                  {/* Acciones Condicionales */}
                  <td className="py-3.5 px-4 text-right pr-6">
                    {isActive ? (
                      <div className="inline-block opacity-90 hover:opacity-100 transition-opacity">
                        <DownloadButtons variant="compact" />
                      </div>
                    ) : (
                      <span className="text-slate-700 font-bold pr-4 block text-right select-none">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CutTable;
