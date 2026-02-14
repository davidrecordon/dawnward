-- AlterTable
ALTER TABLE "SharedSchedule" ADD COLUMN "flightDayEmailSentAt" TIMESTAMP(3);

-- DropTable (if exists from feature branch deploys)
DROP TABLE IF EXISTS "EmailSchedule";
