-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "phaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Phase_projectId_name_key" ON "Phase"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_id_projectId_key" ON "Phase"("id", "projectId");

-- CreateIndex
CREATE INDEX "Phase_projectId_position_idx" ON "Phase"("projectId", "position");

-- CreateIndex
CREATE INDEX "Issue_projectId_phaseId_idx" ON "Issue"("projectId", "phaseId");

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_phaseId_projectId_fkey" FOREIGN KEY ("phaseId", "projectId") REFERENCES "Phase"("id", "projectId") ON DELETE NO ACTION ON UPDATE CASCADE;
