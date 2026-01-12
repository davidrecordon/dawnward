-- AlterTable
ALTER TABLE "SharedSchedule" ADD COLUMN     "currentScheduleJson" JSONB,
ADD COLUMN     "initialScheduleJson" JSONB,
ADD COLUMN     "lastRecalculatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InterventionActual" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "legIndex" INTEGER NOT NULL DEFAULT 0,
    "dayOffset" INTEGER NOT NULL,
    "interventionType" TEXT NOT NULL,
    "plannedTime" TEXT NOT NULL,
    "actualTime" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkerStateSnapshot" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "legIndex" INTEGER NOT NULL DEFAULT 0,
    "dayOffset" INTEGER NOT NULL,
    "cumulativeShift" DOUBLE PRECISION NOT NULL,
    "cbtminMinutes" INTEGER NOT NULL,
    "dlmoMinutes" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkerStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterventionActual_scheduleId_idx" ON "InterventionActual"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionActual_scheduleId_legIndex_dayOffset_interventi_key" ON "InterventionActual"("scheduleId", "legIndex", "dayOffset", "interventionType");

-- CreateIndex
CREATE INDEX "MarkerStateSnapshot_scheduleId_idx" ON "MarkerStateSnapshot"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "MarkerStateSnapshot_scheduleId_legIndex_dayOffset_key" ON "MarkerStateSnapshot"("scheduleId", "legIndex", "dayOffset");

-- AddForeignKey
ALTER TABLE "InterventionActual" ADD CONSTRAINT "InterventionActual_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SharedSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerStateSnapshot" ADD CONSTRAINT "MarkerStateSnapshot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "SharedSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
