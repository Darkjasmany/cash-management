import { useState } from "react";
import { AiOutlineFileText } from "react-icons/ai";
import { RiFileExcel2Line } from "react-icons/ri";
import { dowloadExcel, dowloadTxt } from "../api/cut.api";

type DownloadButtonsProps = {
  variant?: "compact" | "full";
  onLoadingChange?: (isLoading: boolean) => void;
};

export const DownloadButtons = ({ variant = "full", onLoadingChange }: DownloadButtonsProps) => {
  const [isDownloadingTxt, setIsDownloadingTxt] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [consolidar, setConsolidar] = useState(false);

  const anyPending = isDownloadingTxt || isDownloadingExcel;

  const handleDownloadTxt = async () => {
    setIsDownloadingTxt(true);
    if (onLoadingChange) onLoadingChange(true);

    try {
      await dowloadTxt(consolidar);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloadingTxt(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);
    if (onLoadingChange) onLoadingChange(true);

    try {
      await dowloadExcel(consolidar);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloadingExcel(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  };

  const isCompact = variant === "compact";

  return (
    <div
      className={`flex items-center gap-2 ${isCompact ? "justify-end" : "w-full flex-wrap gap-3"}`}
    >
      <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none mr-auto">
        <input
          type="checkbox"
          checked={consolidar}
          onChange={(e) => setConsolidar(e.target.checked)}
          className="rounded bg-slate-800 border-slate-600 text-sky-500 focus:ring-sky-500/50"
        />
        Consolidar deuda (agrupa por cliente y módulo)
      </label>

      <button
        onClick={handleDownloadTxt}
        disabled={anyPending}
        className={`flex items-center justify-center gap-2 font-bold rounded-lg transition-all active:scale-95 shadow-md disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700/50 disabled:shadow-none bg-amber-500 hover:bg-amber-400 text-slate-950 ${
          isCompact ? "h-8 px-3 text-xs" : "h-11 px-5 text-sm shadow-amber-500/10"
        }`}
      >
        {isDownloadingTxt ? (
          <div
            className={`animate-spin rounded-full border-2 border-slate-950 border-t-transparent ${isCompact ? "h-3.5 w-3.5" : "h-4 w-4"}`}
          />
        ) : (
          <AiOutlineFileText className={isCompact ? "text-base" : "text-xl"} />
        )}
        {isDownloadingTxt ? (isCompact ? "TXT..." : "Generando TXT...") : "Descargar TXT"}
      </button>

      <button
        onClick={handleDownloadExcel}
        disabled={anyPending}
        className={`flex items-center justify-center gap-2 font-bold rounded-lg transition-all active:scale-95 shadow-md disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700/50 disabled:shadow-none bg-emerald-600 hover:bg-emerald-500 text-white ${
          isCompact ? "h-8 px-3 text-xs" : "h-11 px-5 text-sm shadow-emerald-600/10"
        }`}
      >
        {isDownloadingExcel ? (
          <div
            className={`animate-spin rounded-full border-2 border-white border-t-transparent ${isCompact ? "h-3.5 w-3.5" : "h-4 w-4"}`}
          />
        ) : (
          <RiFileExcel2Line className={isCompact ? "text-base" : "text-xl"} />
        )}
        {isDownloadingExcel ? (isCompact ? "Excel..." : "Generando Excel...") : "Descargar Excel"}
      </button>
    </div>
  );
};
