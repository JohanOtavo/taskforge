-- DropForeignKey
ALTER TABLE "BoardColumn" DROP CONSTRAINT "BoardColumn_stateId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_columnId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_stateId_fkey";

-- DropForeignKey
ALTER TABLE "IssueLabel" DROP CONSTRAINT "IssueLabel_issueId_fkey";

-- DropForeignKey
ALTER TABLE "IssueLabel" DROP CONSTRAINT "IssueLabel_labelId_fkey";

-- DropIndex
DROP INDEX "BoardColumn_stateId_key";

-- AlterTable
-- En tres pasos a proposito: ADD COLUMN NOT NULL falla en cuanto la tabla
-- tiene una sola fila. Se anade nullable, se rellena desde el issue al que
-- pertenece cada union, y solo entonces se endurece.
ALTER TABLE "IssueLabel" ADD COLUMN "orgId" TEXT;

UPDATE "IssueLabel" il
SET "orgId" = i."orgId"
FROM "Issue" i
WHERE i.id = il."issueId" AND il."orgId" IS NULL;

-- Cualquier fila huerfana que quedase sin orgId no tiene issue: sobra.
DELETE FROM "IssueLabel" WHERE "orgId" IS NULL;

ALTER TABLE "IssueLabel" ALTER COLUMN "orgId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_id_projectId_key" ON "BoardColumn"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_stateId_projectId_key" ON "BoardColumn"("stateId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_id_projectId_key" ON "Issue"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_id_orgId_key" ON "Label"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowState_id_projectId_key" ON "WorkflowState"("id", "projectId");

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_stateId_projectId_fkey" FOREIGN KEY ("stateId", "projectId") REFERENCES "WorkflowState"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_stateId_projectId_fkey" FOREIGN KEY ("stateId", "projectId") REFERENCES "WorkflowState"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_columnId_projectId_fkey" FOREIGN KEY ("columnId", "projectId") REFERENCES "BoardColumn"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentId_projectId_fkey" FOREIGN KEY ("parentId", "projectId") REFERENCES "Issue"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLabel" ADD CONSTRAINT "IssueLabel_issueId_orgId_fkey" FOREIGN KEY ("issueId", "orgId") REFERENCES "Issue"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLabel" ADD CONSTRAINT "IssueLabel_labelId_orgId_fkey" FOREIGN KEY ("labelId", "orgId") REFERENCES "Label"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- CHECKs baratos que faltaban.
-- ===========================================================================

-- Una posicion vacia rompe el orden del tablero sin que nada lo detecte.
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_position_not_empty" CHECK (length("position") > 0);

-- Una invitacion que caduca antes de crearse nace muerta.
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_expires_after_created" CHECK ("expiresAt" > "createdAt");

-- Un comentario en blanco ocupa sitio en el hilo y no dice nada.
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_body_not_empty" CHECK (length(btrim(body)) > 0);
