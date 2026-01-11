-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lightExposureMinutes" INTEGER NOT NULL DEFAULT 60,
ALTER COLUMN "caffeineCutoffHours" SET DEFAULT 8;
