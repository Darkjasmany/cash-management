import cors from "cors";
import express, { Application } from "express";
import helmet from "helmet";

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
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
