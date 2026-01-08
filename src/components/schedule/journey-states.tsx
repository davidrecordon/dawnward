"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass, PartyPopper, Sparkles } from "lucide-react";
import Link from "next/link";

export function PostTripCard() {
  return (
    <Card className="relative overflow-hidden border-emerald-200/50 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Decorative sparkles */}
      <div className="absolute top-3 right-6 opacity-20">
        <Sparkles className="h-12 w-12 text-emerald-500" />
      </div>
      <div className="absolute bottom-4 left-4 opacity-15">
        <Sparkles className="h-8 w-8 text-teal-500" />
      </div>

      <CardContent className="relative py-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25">
          <PartyPopper className="h-8 w-8 text-white" />
        </div>

        <h3 className="mb-2 text-xl font-semibold text-slate-800">
          Journey complete!
        </h3>

        <p className="mx-auto mb-4 max-w-sm text-slate-600">
          You&apos;ve finished your jet lag adaptation schedule. Your body
          should now be adjusted to the new timezone.
        </p>

        <p className="text-sm font-medium text-emerald-700">
          Welcome to your new rhythm.
        </p>
      </CardContent>
    </Card>
  );
}

interface ScheduleNotFoundCardProps {
  message?: string | null;
}

export function ScheduleNotFoundCard({
  message,
}: ScheduleNotFoundCardProps = {}) {
  return (
    <Card className="bg-white/90 backdrop-blur-sm">
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100">
          <Compass className="h-7 w-7 text-slate-400" />
        </div>

        <h2 className="mb-2 text-lg font-semibold text-slate-800">
          {message ? "Something went wrong" : "Schedule Not Found"}
        </h2>

        <p className="mb-4 text-sm text-slate-500">
          {message ||
            "This schedule may have been deleted or the link is invalid."}
        </p>

        <Button asChild>
          <Link href="/">Create a New Schedule</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
