import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane } from "lucide-react";
import Link from "next/link";

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/history");
  }

  // TODO: Query trips from database once trip persistence is implemented
  const trips: never[] = [];

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

        {trips.length === 0 ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-50">
                <Plane className="h-8 w-8 text-sky-500" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                No trips yet
              </h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Plan your first trip and save it to see it here. Your saved
                trips will appear in this list.
              </p>
              <Button asChild className="mt-6">
                <Link href="/">Plan a Trip</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Trip list will go here when persistence is implemented */}
          </div>
        )}
      </div>
    </div>
  );
}
