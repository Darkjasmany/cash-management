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

// Schema de registro — solo ADMIN puede crear usuarios
export const registerSchema = z.object({
  name: z
    .string({
      required_error: "El nombre es requerido",
    })
    .min(2, "Mínimo 2 caracteres")
    .trim(),
  email: emailValidation,
  password: passwordValidation,
  role: z.enum(["ADMIN", "ORGANIZER"]).default("ORGANIZER"),
});

// Schema para cambiar password
export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: "La contraseña actual es requerida" }),
    newPassword: passwordValidation,
    confirmPassword: passwordValidation,
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine(data => data.currentPassword !== data.newPassword, {
    message: "La nueva contraseña debe ser diferente a la actual",
    path: ["newPassword"],
  });

// Types inferidos
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
