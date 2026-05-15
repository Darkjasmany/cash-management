import { useState } from "react";
import CutForm from "../components/CutForm";
import CutTable from "../components/CutTable";
import { useCuttings, useProccessCut } from "../hooks/useCut";

const CutsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: cuttings = [], isLoading } = useCuttings();
  const createCut = useProccessCut();

  const filtered = cuttings.filter(c => c.fechaCorte.includes(searchTerm));

  const handleCreateCut = (data: { fechaCorte: string }) => {
    createCut.mutate(data.fechaCorte);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Cortes Realizados</h1>
        <p className="text-slate-400 text-sm mt-1">
          Administra los cortes para cargar en la plataforma CashManagement
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-5">
        <CutForm onSubmit={handleCreateCut} isPending={createCut.isPending} />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <input
            type="text"
            placeholder="Busca cortes historicos..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-10 px-3 w-full max-w-sm rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>

        <CutTable cutttings={filtered} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default CutsPage;
