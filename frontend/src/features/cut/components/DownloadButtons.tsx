import { useState } from "react";
import { AiOutlineFileText } from "react-icons/ai";
import { RiFileExcel2Line } from "react-icons/ri";
import { dowloadExcel, dowloadTxt } from "../api/cut.api";

type DownloadButtonsProps = {
  variant?: "compact" | "full";
};

export const DownloadButtons = ({ variant = "full" }: DownloadButtonsProps) => {
  // Estados para controlar el feedback de los botones de descarga
  const [isDownloadingTxt, setIsDownloadingTxt] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  // Manejador para la descarga de TXT
  const handleDownloadTxt = async () => {
    setIsDownloadingTxt(true);
    try {
      await dowloadTxt();
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloadingTxt(false);
    }
  };

  // Manejador para la descarga de Excel
  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);
    try {
      await dowloadExcel();
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // Si cualquiera de las dos descargas está activa
  const anyPending = isDownloadingTxt || isDownloadingExcel;
  const isCompact = variant === "compact";

  return (
    <div
      className={`flex items-center gap-2 ${isCompact ? "justify-end" : "pt-4  flex-wrap gap-3"}`}
    >
      {/* BOTÓN TXT */}
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

      {/* BOTÓN EXCEL */}
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
