import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string({ required_error: "El nombre es requerido" }).min(2, "Mínimo 2 caracteres").trim(),
  email: z
    .string({ required_error: "El email es requerido" })
    .email("Email inválido")
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: "La contraseña es requerida" })
    .min(8, "Mínimo 8 caracteres"),
  role: z.enum(["ADMIN", "ORGANIZER"]).default("ORGANIZER"),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).trim().optional(),
  role: z.enum(["ADMIN", "ORGANIZER"]).optional(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  newPassword: z
    .string({ required_error: "La contraseña es requerida" })
    .min(8, "Mínimo 8 caracteres"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
