import { z } from "zod";

// Schema
export const processSchema = z.object({
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
});

// Type
export type ProcessInput = z.infer<typeof processSchema>;
