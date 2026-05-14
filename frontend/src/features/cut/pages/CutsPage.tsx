import { useState } from "react";
import { useCuttings, useProccessCut } from "../hooks/useCut";

const CutsPage = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: cuttings = [], isLoading } = useCuttings();
  const createCut = useProccessCut();

  const filtered = cuttings.filter(c => c.fechaCorte.includes(searchTerm));

  return <div>CutsPage</div>;
};

export default CutsPage;
