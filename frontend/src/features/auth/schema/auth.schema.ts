import { z } from "zod";

// Validaciones reutilizables
const emailValidation = z
  .string({ required_error: "El email es requerido" })
  .email("Email inválido")
  .toLowerCase()
  .trim();

const passwordValidation = z
  .string({ required_error: "La contraseña es requerida" })
  .min(8, "Mínimo 8 caracteres")
  .trim();

// Schema de login
export const loginSchema = z.object({
  email: emailValidation,
  password: passwordValidation,
});

// Types inferidos
export type LoginInput = z.infer<typeof loginSchema>;
