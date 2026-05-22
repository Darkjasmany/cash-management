import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { getActiveCutting, getCuttings, getDashboardStats, proccessCutting } from "../api/cut.api";

export const CUTS_KEYS = "cuttings";
export const DASHBOARD_STATS_KEY = "dashboard-stats";

export function useCuttings() {
  return useQuery({
    queryKey: [CUTS_KEYS],
    queryFn: getCuttings,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: [DASHBOARD_STATS_KEY],
    queryFn: getDashboardStats,
  });
}

export function useProccessCut() {
  const queryClient = useQueryClient();
  return useMutation({
    // mutationFn: ({ fechaCorte }: { fechaCorte: string }) => proccessCutting(fechaCorte),
    mutationFn: (fechaCorte: string) => proccessCutting(fechaCorte),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CUTS_KEYS] });
      queryClient.invalidateQueries({ queryKey: [DASHBOARD_STATS_KEY] });
      toast.success("Proceso completado");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useGetActiveCut() {
  return useMutation({
    mutationFn: ({ page, limit }: { page: number; limit: number }) => getActiveCutting(page, limit),
    onSuccess: () => {
      toast.success("Corte Activo Completado");
    },
  });
}
