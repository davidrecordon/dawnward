import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  mapSharedScheduleToTripData,
  incrementViewCount,
} from "@/lib/trip-utils";
import { TripScheduleView } from "@/components/trip-schedule-view";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TripByIdPage({ params }: Props) {
  const { id } = await params;

  // Load trip and auth in parallel to avoid waterfall
  const [trip, session] = await Promise.all([
    prisma.sharedSchedule.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    }),
    auth(),
  ]);

  if (!trip) {
    notFound();
  }
  const isOwner = session?.user?.id === trip.userId;

  // SECURITY: Only allow viewing if:
  // 1. Owner viewing their own trip (isOwner)
  // 2. Trip is shared publicly (has code)
  // 3. Trip is anonymous (userId is null) - creator can view via direct link
  // Prevents IDOR - can't view other users' private trips by guessing ID
  if (!isOwner && !trip.code && trip.userId !== null) {
    notFound();
  }

  // Increment view count for non-owners viewing shared trips
  if (!isOwner && trip.code) {
    incrementViewCount(prisma, trip.id);
  }

  return (
    <TripScheduleView
      tripId={trip.id}
      tripData={mapSharedScheduleToTripData(trip)}
      isOwner={isOwner}
      isLoggedIn={!!session?.user}
      hasCalendarScope={session?.hasCalendarScope ?? false}
      sharerName={trip.user?.name ?? null}
    />
  );
}
