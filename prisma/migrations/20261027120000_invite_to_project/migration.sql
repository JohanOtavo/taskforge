-- NOTA: `prisma migrate diff` genera un DROP del indice trigram
-- `Issue_title_trgm_idx` en CADA migracion, porque es DDL escrito a mano que
-- el esquema de Prisma no puede representar. Ese DROP se borra siempre.
-- Los demas objetos de prisma/sql/constraints.sql (indices funcionales,
-- indice parcial, CHECKs) Prisma no los ve en absoluto y no los toca.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "projectRole" "ProjectRole";

-- CreateIndex
CREATE INDEX "Invitation_projectId_idx" ON "Invitation"("projectId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

