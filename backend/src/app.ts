import cors from "cors";
import express, { Application } from "express";
import helmet from "helmet";
import { prisma, siimPool } from "./lib/db";
import { errorMiddleware } from "./middlewares/error.middleware";
import adminRouter from "./modules/admin/admin.router";
import authRouter from "./modules/auth/auth.router";
import cutRouter from "./modules/cut/cut.router";

const app: Application = express();

// Seguridad
app.use(helmet());

// CORS — en desarrollo acepta el origen del frontend
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production" ? "https://tu-dominio.com" : "http://localhost:5173",
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Permite cargar recursos de otro origen
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "http://localhost:3000"], // Añade tu URL de backend
      },
    },
  })
);

// Parseo de JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check — para verificar que el servidor responde
app.get("/api/health", async (_req, res) => {
  // res.json({ status: "ok", timestamp: new Date().toISOString() });
  try {
    // Se ejecuta promesas en paralelo para verificar conexiones a BD y SIIM
    const [dbCheck, siimCheck] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`, // Verifica conexión a la BD propia
      siimPool.query("SELECT 1"), // Verifica conexión al SIIM
    ]);

    const isDbOk = dbCheck.status === "fulfilled";
    const isSiimOk = siimCheck.status === "fulfilled";

    const statusCode = isDbOk && isSiimOk ? 200 : 503;

    res.status(statusCode).json({
      status: statusCode === 200 ? "ok" : "unhealthy",
      db: isDbOk ? "ok" : "error",
      siim: isSiimOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    });
  } catch (error: Error | any) {
    res.status(500).json({ status: "error", message: `Health check failed: ${error.message}` });
  }
});

// Rutas
app.use("/api/auth", authRouter);
app.use("/api/admin/users", adminRouter);
app.use("/api/cut", cutRouter);

app.use(errorMiddleware);

export default app;
