-- CreateTable
CREATE TABLE "SharedSchedule" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "userId" TEXT NOT NULL,
    "originTz" TEXT NOT NULL,
    "destTz" TEXT NOT NULL,
    "departureDatetime" TEXT NOT NULL,
    "arrivalDatetime" TEXT NOT NULL,
    "prepDays" INTEGER NOT NULL,
    "wakeTime" TEXT NOT NULL,
    "sleepTime" TEXT NOT NULL,
    "usesMelatonin" BOOLEAN NOT NULL,
    "usesCaffeine" BOOLEAN NOT NULL,
    "usesExercise" BOOLEAN NOT NULL,
    "napPreference" TEXT NOT NULL DEFAULT 'flight_only',
    "scheduleIntensity" TEXT NOT NULL DEFAULT 'balanced',
    "routeLabel" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "SharedSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedSchedule_code_key" ON "SharedSchedule"("code");

-- CreateIndex
CREATE INDEX "SharedSchedule_userId_idx" ON "SharedSchedule"("userId");

-- CreateIndex
CREATE INDEX "SharedSchedule_code_idx" ON "SharedSchedule"("code");

-- AddForeignKey
ALTER TABLE "SharedSchedule" ADD CONSTRAINT "SharedSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
