/*
  Warnings:

  - Added the required column `fechaCreacion` to the `deuda_banco` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "deuda_banco" ADD COLUMN     "fechaCreacion" DATE NOT NULL;
