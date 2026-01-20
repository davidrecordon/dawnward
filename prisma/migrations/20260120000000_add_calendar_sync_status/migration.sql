-- AlterTable
ALTER TABLE "CalendarSync" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "eventsCreated" INTEGER,
ADD COLUMN     "eventsFailed" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'completed';
