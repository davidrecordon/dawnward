import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapSharedScheduleToTripData } from "@/lib/trip-utils";
import { TripScheduleView } from "@/components/trip-schedule-view";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function SharedSchedulePage({ params }: Props) {
  const { code } = await params;

  // Look up share in database
  const shared = await prisma.sharedSchedule.findUnique({
    where: { code },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
  });

  if (!shared) {
    notFound();
  }

  // Check if current user is the owner
  const session = await auth();
  const isOwner = session?.user?.id === shared.userId;

  // Increment view count only for non-owners (fire and forget)
  if (!isOwner) {
    prisma.sharedSchedule
      .update({
        where: { id: shared.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
      .catch(() => {
        // Ignore errors - analytics shouldn't break the page
      });
  }

  return (
    <TripScheduleView
      tripId={shared.id}
      tripData={mapSharedScheduleToTripData(shared)}
      isOwner={isOwner}
      isLoggedIn={!!session?.user}
      sharerName={shared.user?.name ?? null}
    />
  );
}
