"use client";

import { useState, useMemo } from "react";
import { TripHistoryCard } from "@/components/trip-history-card";
import { detectTripDuplicates } from "@/lib/trip-duplicate-detection";

interface Trip {
  id: string;
  routeLabel: string | null;
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
  code: string | null;
  // Preference fields for duplicate detection
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
}

interface TripHistoryListProps {
  initialTrips: Trip[];
}

function isUpcoming(departureDatetime: string): boolean {
  const departure = new Date(departureDatetime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return departure >= today;
}

export function TripHistoryList({ initialTrips }: TripHistoryListProps) {
  const [trips, setTrips] = useState(initialTrips);

  const { upcoming, past, duplicateDiffs } = useMemo(() => {
    const upcomingTrips: Trip[] = [];
    const pastTrips: Trip[] = [];

    for (const trip of trips) {
      if (isUpcoming(trip.departureDatetime)) {
        upcomingTrips.push(trip);
      } else {
        pastTrips.push(trip);
      }
    }

    // Sort upcoming by departure date (soonest first)
    upcomingTrips.sort(
      (a, b) =>
        new Date(a.departureDatetime).getTime() -
        new Date(b.departureDatetime).getTime()
    );

    // Sort past by departure date (most recent first)
    pastTrips.sort(
      (a, b) =>
        new Date(b.departureDatetime).getTime() -
        new Date(a.departureDatetime).getTime()
    );

    // Detect duplicate trips with different preferences
    const diffs = detectTripDuplicates(trips);

    return { upcoming: upcomingTrips, past: pastTrips, duplicateDiffs: diffs };
  }, [trips]);

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/trips/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete trip");
    }

    // Remove from local state after successful deletion
    setTrips((prev) => prev.filter((trip) => trip.id !== id));
  };

  const renderTrip = (trip: Trip) => (
    <TripHistoryCard
      key={trip.id}
      id={trip.id}
      routeLabel={trip.routeLabel}
      originTz={trip.originTz}
      destTz={trip.destTz}
      departureDatetime={trip.departureDatetime}
      code={trip.code}
      differences={duplicateDiffs.get(trip.id)}
      onDelete={handleDelete}
    />
  );

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-500">Upcoming</h2>
          <div className="space-y-3">{upcoming.map(renderTrip)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-500">Past</h2>
          <div className="space-y-3">{past.map(renderTrip)}</div>
        </section>
      )}
    </div>
  );
}
