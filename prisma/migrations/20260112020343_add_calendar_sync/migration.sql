-- CreateTable
CREATE TABLE "CalendarSync" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEventIds" TEXT[],
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarSync_tripId_idx" ON "CalendarSync"("tripId");

-- CreateIndex
CREATE INDEX "CalendarSync_userId_idx" ON "CalendarSync"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSync_tripId_userId_key" ON "CalendarSync"("tripId", "userId");

-- AddForeignKey
ALTER TABLE "CalendarSync" ADD CONSTRAINT "CalendarSync_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "SharedSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSync" ADD CONSTRAINT "CalendarSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
