-- AlterTable
ALTER TABLE "SharedSchedule" ADD COLUMN     "leg2ArrivalDatetime" TEXT,
ADD COLUMN     "leg2DepartureDatetime" TEXT,
ADD COLUMN     "leg2DestTz" TEXT,
ADD COLUMN     "leg2OriginTz" TEXT;
