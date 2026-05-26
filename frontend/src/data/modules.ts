export interface ConfigVisualModulo {
  color: string;
}
// Usamos Record<number, ...> porque los IDs del SIIM son numéricos (1, 2, 3)
export const CONFIG_MODULOS: Record<number, ConfigVisualModulo> = {
  1: { color: "#0ea5e9" },
  2: { color: "#10b981" },
  3: { color: "#f59e0b" },
};
