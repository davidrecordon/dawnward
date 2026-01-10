"use client";

import { useState } from "react";
import { TripHistoryCard } from "@/components/trip-history-card";

interface Trip {
  id: string;
  routeLabel: string | null;
  originTz: string;
  destTz: string;
  departureDatetime: string;
  code: string | null;
}

interface TripHistoryListProps {
  initialTrips: Trip[];
}

export function TripHistoryList({ initialTrips }: TripHistoryListProps) {
  const [trips, setTrips] = useState(initialTrips);

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

  return (
    <div className="space-y-3">
      {trips.map((trip) => (
        <TripHistoryCard
          key={trip.id}
          id={trip.id}
          routeLabel={trip.routeLabel}
          originTz={trip.originTz}
          destTz={trip.destTz}
          departureDatetime={trip.departureDatetime}
          code={trip.code}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
