-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_stateId_fkey";

-- DropIndex
DROP INDEX "AuditLog_entityType_entityId_idx";

-- DropIndex
DROP INDEX "Issue_columnId_archivedAt_position_idx";

-- DropIndex
DROP INDEX "Issue_orgId_idx";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "editedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "acceptedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Issue" ALTER COLUMN "dueDate" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "archivedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Membership" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "archivedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "archivedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "ProjectEvent" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "ProjectMember" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Invitation_invitedById_idx" ON "Invitation"("invitedById");

-- CreateIndex
CREATE INDEX "Issue_reporterId_idx" ON "Issue"("reporterId");

-- CreateIndex
CREATE INDEX "Issue_stateId_idx" ON "Issue"("stateId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "WorkflowState"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ===========================================================================
-- Indices parciales que Prisma no sabe expresar.
-- ===========================================================================

-- Lectura del tablero. Prisma carga una relacion anidada con UNA consulta por
-- nivel, acotada solo por la clave del padre: la consulta real es
-- `WHERE "columnId" IN (...) AND "archivedAt" IS NULL ORDER BY position, id`,
-- SIN projectId. Por eso el indice tiene que empezar por columnId.
--
-- Al ser parcial excluye los archivados y el backlog (columnId NULL), que es
-- justo lo que el tablero nunca lee, y al incluir id cubre la ordenacion
-- completa sin volver a la tabla.
CREATE INDEX "Issue_column_board_idx"
  ON "Issue" ("columnId", "position", "id")
  WHERE "archivedAt" IS NULL AND "columnId" IS NOT NULL;

-- Listado de issues con el orden por defecto (updatedAt DESC). Sin este
-- indice la consulta mas comun de la aplicacion no tenia ninguno: el otro
-- indice solo sirve si quien llama filtra ademas por stateId.
CREATE INDEX "Issue_projectId_updatedAt_id_idx"
  ON "Issue" ("projectId", "updatedAt" DESC, "id")
  WHERE "archivedAt" IS NULL;

-- Conteo de comentarios vivos por issue. Hace que el agregado del tablero se
-- resuelva solo con el indice.
CREATE INDEX "Comment_issueId_live_idx"
  ON "Comment" ("issueId")
  WHERE "deletedAt" IS NULL;
