import { useState } from "react";
import { BiInfoCircle } from "react-icons/bi";
import { type ResultadoProceso } from "../api/cut.api";
import CutForm from "../components/CutForm";
import { DownloadButtons } from "../components/DownloadButtons";
import { useProccessCut } from "../hooks/useCut";

const CutsPage = () => {
  const createCut = useProccessCut();
  const result = createCut.data as ResultadoProceso | undefined;

  // Estado local para capturar si el componente hijo está descargando
  const [anyDownloadPending, setAnyDownloadPending] = useState(false);

  const handleCreateCut = (data: { fechaCorte: string }) => {
    createCut.mutate(data.fechaCorte);
  };

  return (
    <div className="max-w-8xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Parámetros de Corte</h1>
        <p className="text-slate-400 text-sm mt-1">
          Generación de reporte para Banco de Pichincha — Predios Urbanos, Rurales y Agua Potable
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-5">
        <CutForm onSubmit={handleCreateCut} isPending={createCut.isPending} />
      </div>

      {/* SECCIÓN DE RESULTADOS */}
      {createCut.isSuccess && result?.data && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <h2 className="text-lg font-medium text-white">{result.message}</h2>
            </div>

            {/* Grid de información resumida */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                  Fecha de Corte
                </p>
                <p className="text-xl font-mono text-sky-400">{result.data.fechaCorte}</p>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                  Total Registros
                </p>
                <p className="text-xl font-semibold text-white">
                  {(result.data.totalRegistros || 0).toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Deuda</p>
                <p className="text-xl font-semibold text-emerald-400">
                  $
                  {(result.data.totalDeuda || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>

            {/* Alerta de procesamiento pesado */}
            {anyDownloadPending && (
              <div className="flex items-start gap-3 bg-blue-950/40 border border-blue-800/60 p-3 rounded-lg mb-6 text-blue-400 text-xs animate-pulse">
                <BiInfoCircle className="text-base shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">
                    Generando archivo en el navegador
                  </span>
                  Por favor espere. Al ser {(result.data.totalRegistros || 0).toLocaleString()}{" "}
                  registros, el navegador puede demorar unos segundos en estructurar el archivo
                  binario antes de mostrar la ventana de guardado.
                </div>
              </div>
            )}

            {/* BOTONES DE DESCARGA */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-800">
              {/* Le pasamos la función setAnyDownloadPending para escuchar sus cambios de estado */}
              <DownloadButtons variant="full" onLoadingChange={setAnyDownloadPending} />
            </div>
          </div>
        </div>
      )}

      {/* Estado de carga opcional */}
      {createCut.isPending && (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 border border-slate-800 border-dashed rounded-xl">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mb-3"></div>
          <p className="text-slate-400 text-sm">Procesando información del SIIM...</p>
        </div>
      )}
    </div>
  );
};

export default CutsPage;
