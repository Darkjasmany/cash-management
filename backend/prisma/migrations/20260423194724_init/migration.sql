-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "EstadoCorte" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ORGANIZER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_corte" (
    "id" SERIAL NOT NULL,
    "fechaCorte" DATE NOT NULL,
    "estado" "EstadoCorte" NOT NULL DEFAULT 'ACTIVO',
    "creadoPor" INTEGER NOT NULL,
    "nombreUsuario" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_corte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deuda_banco" (
    "id" SERIAL NOT NULL,
    "idParametro" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'CO',
    "contrapartida" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'USD',
    "valor" INTEGER NOT NULL,
    "formaCobro" TEXT NOT NULL DEFAULT 'REC',
    "referencia" TEXT NOT NULL DEFAULT '',
    "tipoId" TEXT NOT NULL,
    "numeroId" TEXT NOT NULL,
    "nombreCliente" TEXT NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "totalDecimal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "deuda_banco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- AddForeignKey
ALTER TABLE "deuda_banco" ADD CONSTRAINT "deuda_banco_idParametro_fkey" FOREIGN KEY ("idParametro") REFERENCES "parametros_corte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
