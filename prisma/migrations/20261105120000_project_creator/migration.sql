-- AlterTable
ALTER TABLE "Project" ADD COLUMN "createdById" TEXT;

-- Relleno: quien creo cada proyecto existente sale de la auditoria.
UPDATE "Project" p
SET "createdById" = a."actorId"
FROM "AuditLog" a
WHERE a."action" = 'project.created'
  AND a."entityId" = p."id"
  AND a."actorId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
