"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ScheduleNotFoundCard } from "@/components/schedule/journey-states";

/**
 * Trip detail page for saved schedules (requires sign-in).
 *
 * This page will load schedules from the database once auth is implemented.
 * For now, anonymous users should use /trip which regenerates from form state.
 */
export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // TODO: Load schedule from database when auth is implemented
  // For now, show not found since we don't have database storage yet
  console.log("Trip ID requested:", id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>
        <ScheduleNotFoundCard message="Sign in to access saved schedules. For now, generate a new schedule from the homepage." />
      </div>
    </div>
  );
}
