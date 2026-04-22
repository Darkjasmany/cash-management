import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  SIIM_DATABASE_URL: z.string().min(1, "SIIM_DATABASE_URL es requerida"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  MODULO_CATASTRO_URBANO: z.string().default("1"),
  MODULO_CATASTRO_RURAL: z.string().default("2"),
  MODULO_AGUA_POTABLE: z.string().default("3"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed) {
  console.error("❌ Variables de entorno inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
