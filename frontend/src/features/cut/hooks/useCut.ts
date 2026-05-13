import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { getActiveCutting, getCuttings, proccessCutting } from "../api/cut.api";

export const CUTS_KEYS = "cuttings";

export function useCuttings() {
  return useQuery({
    queryKey: [CUTS_KEYS],
    queryFn: getCuttings,
  });
}

export function proccessCut() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutationFn: ({ fechaCorte }: { fechaCorte: string }) => proccessCutting(fechaCorte),
    mutationFn: (fechaCorte: string) => proccessCutting(fechaCorte),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CUTS_KEYS] });
      toast.success("Proceso completado");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function getActiveCut() {
  return useMutation({
    mutationFn: ({ page, limit }: { page: number; limit: number }) => getActiveCutting(page, limit),
    onSuccess: () => {
      toast.success("Corte Activo Completado");
    },
  });
}
