-- AlterTable
ALTER TABLE "User" ADD COLUMN "scheduleViewMode" TEXT NOT NULL DEFAULT 'summary',
ADD COLUMN "showDualTimezone" BOOLEAN NOT NULL DEFAULT false;
