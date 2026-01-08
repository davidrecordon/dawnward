import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Plane } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  // Placeholder data - will come from database
  const trips = [
    {
      id: "1",
      origin: "SFO",
      destination: "NRT",
      originCity: "San Francisco",
      destinationCity: "Tokyo",
      shift: "+17h",
      status: "completed" as const,
      date: "Dec 15, 2024",
      rating: 4,
    },
    {
      id: "2",
      origin: "SFO",
      destination: "SIN",
      originCity: "San Francisco",
      destinationCity: "Singapore",
      shift: "+16h",
      status: "active" as const,
      date: "Jan 5, 2025",
    },
    {
      id: "3",
      origin: "SIN",
      destination: "SFO",
      originCity: "Singapore",
      destinationCity: "San Francisco",
      shift: "-16h",
      status: "planned" as const,
      date: "Jan 20, 2025",
    },
  ];

  const statusStyles = {
    completed: "bg-muted text-muted-foreground",
    active: "bg-sage/20 text-sage border-sage/30",
    planned: "bg-muted text-muted-foreground",
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Trip History
          </h1>
          <p className="text-muted-foreground">
            Your past, active, and upcoming trips
          </p>
        </div>

        <div className="space-y-3">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trip/${trip.id}`}>
              <Card
                className={`bg-white/90 backdrop-blur-sm transition-colors hover:bg-white ${
                  trip.status === "active" ? "ring-sage/50 ring-2" : ""
                }`}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="bg-sky/10 flex h-10 w-10 items-center justify-center rounded-full">
                    <Plane className="text-sky h-5 w-5" />
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {trip.origin} → {trip.destination}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {trip.shift}
                      </Badge>
                      <Badge className={statusStyles[trip.status]}>
                        {trip.status.charAt(0).toUpperCase() +
                          trip.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <span>
                        {trip.originCity} → {trip.destinationCity}
                      </span>
                      <span>•</span>
                      <span>{trip.date}</span>
                      {trip.rating && (
                        <>
                          <span>•</span>
                          <span>{"★".repeat(trip.rating)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="text-muted-foreground h-5 w-5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
