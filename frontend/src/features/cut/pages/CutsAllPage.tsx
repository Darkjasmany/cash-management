import { useState } from "react";
import { FiSearch } from "react-icons/fi";
import CutTable from "../components/CutTable";
import { useCuttings } from "../hooks/useCut";

const CutsAllPage = () => {
  const [search, setSearch] = useState("");
  const { data: cuts = [], isLoading } = useCuttings();

  const filtered = cuts.filter(
    c =>
      c.fechaCorte.includes(search) ||
      c.estado.toLowerCase().includes(search.toLowerCase()) ||
      (c.nombreUsuario && c.nombreUsuario.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-8xl mx-auto p-4 animate-in fade-in duration-500">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Históricos de Cortes Procesados
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Historial de reportes generados para Banco de Pichincha
        </p>
      </div>

      {/* Contenedor del Filtro */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 backdrop-blur-md">
        <div className="relative max-w-sm">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <FiSearch className="h-4 w-4 text-slate-500" />
          </span>
          <input
            type="text"
            placeholder="Buscar por fecha, estado o usuario..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-lg bg-slate-950/60 border border-slate-800 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
          />
        </div>
      </div>

      {/* Componente de la tabla */}
      <div className="mt-6">
        <CutTable cuts={filtered} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default CutsAllPage;
