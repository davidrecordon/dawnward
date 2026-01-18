import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  mapSharedScheduleToTripData,
  incrementViewCount,
} from "@/lib/trip-utils";
import { TripScheduleView } from "@/components/trip-schedule-view";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function SharedSchedulePage({ params }: Props) {
  const { code } = await params;

  // Load share and auth in parallel to avoid waterfall
  const [shared, session] = await Promise.all([
    prisma.sharedSchedule.findUnique({
      where: { code },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    }),
    auth(),
  ]);

  if (!shared) {
    notFound();
  }
  const isOwner = session?.user?.id === shared.userId;

  // Fetch user's display preferences if logged in
  const userPrefs = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { showDualTimezone: true, scheduleViewMode: true },
      })
    : null;

  // Increment view count only for non-owners (fire and forget)
  if (!isOwner) {
    incrementViewCount(prisma, shared.id);
  }

  return (
    <TripScheduleView
      tripId={shared.id}
      tripData={mapSharedScheduleToTripData(shared)}
      isOwner={isOwner}
      isLoggedIn={!!session?.user}
      hasCalendarScope={session?.hasCalendarScope ?? false}
      sharerName={shared.user?.name ?? null}
      showDualTimezone={userPrefs?.showDualTimezone ?? false}
      scheduleViewMode={
        (userPrefs?.scheduleViewMode as "summary" | "timeline") ?? "summary"
      }
    />
  );
}
