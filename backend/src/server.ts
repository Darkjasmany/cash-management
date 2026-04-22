import { env } from "./config/env.js";

import app from "./app.js";
import { prisma, siimPool } from "./lib/db.js";

const startServer = async () => {
  try {
    // Verifica conexión a la BD antes de arrancar
    await prisma.$connect();
    console.log("✅ Conectado a la BD propia (Cash Management)");

    const siimClient = await siimPool.connect();
    siimClient.release();
    console.log("✅ Conectado al SIIM (lectura)");

    app.listen(env!.PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${env!.PORT}`);
      console.log(`📋 Ambiente: ${env!.NODE_ENV}`);
      console.log(`🏥 Health check: http://localhost:${env!.PORT}/health`);
    });
  } catch (error) {
    console.error("❌ Error al arrancar el servidor:", error);
    await prisma.$disconnect();
    await siimPool.end();
    process.exit(1);
  }
};

// Manejo de errores no capturados
process.on("unhandledRejection", reason => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", error => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

startServer();
