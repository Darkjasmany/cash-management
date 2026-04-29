import { z } from "zod";

export const createSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").trim(),
  email: z.string().email("Email inválido").toLowerCase().trim(),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMIN", "ORGANIZER"]),
});

export const editSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").trim(),
  role: z.enum(["ADMIN", "ORGANIZER"]),
  isActive: z.boolean(),
});

export type CreateUserFormValues = z.infer<typeof createSchema>;
export type EditUserFormValues = z.infer<typeof editSchema>;

// Estilos compartidos
export const inputStyles = (hasError: boolean) =>
  `w-full h-10 px-3 rounded-lg bg-slate-800 border text-white text-sm
   placeholder:text-slate-500 focus:outline-none focus:ring-2 transition
   ${hasError ? "border-red-500 focus:ring-red-500" : "border-slate-700 focus:ring-sky-500"}`;

export const labelStyles = "text-xs text-slate-400 mb-1 block";
