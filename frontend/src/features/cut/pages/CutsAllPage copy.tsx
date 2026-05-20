import { useState } from "react";
import CutTable from "../components/CutTable";
import { useCuttings } from "../hooks/useCut";

const CutsAllPage = () => {
  const [search, setSearch] = useState("");

  const { data: cuts = [], isLoading } = useCuttings();

  const filtered = cuts.filter(
    c => c.fechaCorte.includes(search) || c.estado.includes(search.toUpperCase())
  );
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Historicos de Cortes Procesados</h1>
        <p className="text-slate-400 text-sm mt-1">
          Historial de reportes generados para Banco de Pichincha
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-5">
        <div className="p-4 border-b border-slate-800">
          <input
            type="text"
            placeholder="Buscar por nombre o categoría..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm h-10 px-3 rounded-lg bg-slate-800 border
                       border-slate-700 text-white text-sm placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
          />
        </div>
        <CutTable cuts={filtered} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default CutsAllPage;
