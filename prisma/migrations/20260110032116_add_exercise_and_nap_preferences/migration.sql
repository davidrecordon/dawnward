-- AlterTable
ALTER TABLE "User" ADD COLUMN     "napPreference" TEXT NOT NULL DEFAULT 'flight_only',
ADD COLUMN     "usesExercise" BOOLEAN NOT NULL DEFAULT false;
