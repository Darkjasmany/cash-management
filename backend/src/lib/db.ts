import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

// Aquí estamos usando globalThis (un objeto que persiste mientras el proceso de Node.js esté vivo, incluso si los módulos se recargan). Le decimos a TypeScript: "Oye, en el objeto global puede que exista una propiedad llamada prisma"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// ─── Cliente Prisma para la BD propia (Cash Management) ──────
// Si ya existe una instancia de Prisma en el objeto global, úsala. Si no existe (es la primera vez que arranca la app), crea una nueva
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

// ─── Pool de conexión directa al SIIM (solo lectura) ─────────
// Usamos pg directamente porque Prisma no puede apuntar a 2 BDs
// distintas en el mismo proceso sin schemas separados.
export const siimPool = new Pool({
  connectionString: process.env.SIIM_DATABASE_URL,
  max: 5, // máximo 5 conexiones simultáneas al SIIM
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

siimPool.on("error", err => {
  console.error("[SIIM Pool] Error inesperado:", err.message);
});

//   En Desarrollo: Guardamos la instancia en el objeto global. Así, cuando guardes un archivo y todo se recargue, el paso #2 encontrará la instancia anterior y no creará una nueva.

// En Producción: No guardamos nada en el global. En producción no hay "Hot Reloading", así que se crea una sola instancia al iniciar y listo. Es más limpio y eficiente.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
