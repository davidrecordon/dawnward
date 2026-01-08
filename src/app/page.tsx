import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { TripPlanner } from "@/components/trip-planner";

export default function NewTripPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Hero */}
      <div className="mb-8 text-center">
        <Link href="/science">
          <Badge className="focus:ring-ring mb-4 cursor-pointer border-0 border-transparent bg-white/80 font-medium text-orange-600 shadow-sm transition-colors hover:bg-orange-100 focus:ring-2 focus:ring-offset-2 focus:outline-none">
            <Sparkles className="mr-1 h-3 w-3" />
            Science-backed jet lag optimization
          </Badge>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Arrive ready, not wrecked
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-lg">
          Personalized light, sleep, and caffeine schedules to shift your
          circadian rhythm before you land.
        </p>
      </div>

      {/* Trip Planner Form */}
      <TripPlanner />
    </div>
  );
}
