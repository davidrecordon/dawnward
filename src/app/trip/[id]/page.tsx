import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Calendar,
  Check,
  Coffee,
  Glasses,
  Moon,
  Pill,
  Sun,
} from "lucide-react";

// Placeholder intervention data
const interventions = [
  {
    id: "1",
    type: "light_seek",
    title: "Seek bright light early",
    description: "Get outside or use a light box for 30+ minutes",
    time: "6:00 AM",
    completed: false,
    icon: Sun,
    color: "bg-sunrise/20 text-sunrise",
  },
  {
    id: "2",
    type: "caffeine_ok",
    title: "Coffee window opens",
    description: "Caffeine is fine until your cutoff time",
    time: "7:00 AM",
    completed: true,
    icon: Coffee,
    color: "bg-sunset/20 text-sunset",
  },
  {
    id: "3",
    type: "light_avoid",
    title: "Avoid bright light",
    description: "Dim screens, wear blue blockers if needed",
    time: "4:00 PM",
    completed: false,
    icon: Glasses,
    color: "bg-sky/20 text-sky",
  },
  {
    id: "4",
    type: "caffeine_cutoff",
    title: "Last caffeine",
    description: "No coffee, tea, or energy drinks after this",
    time: "2:00 PM",
    completed: false,
    icon: Coffee,
    color: "bg-sunset/20 text-sunset",
  },
  {
    id: "5",
    type: "melatonin",
    title: "Take melatonin (0.5mg)",
    description: "Low dose to help initiate sleep shift",
    time: "9:30 PM",
    completed: false,
    icon: Pill,
    color: "bg-sage/20 text-sage",
  },
  {
    id: "6",
    type: "sleep_target",
    title: "Target bedtime",
    description: "1 hour earlier than your usual time",
    time: "10:00 PM",
    completed: false,
    icon: Moon,
    color: "bg-night/20 text-night",
  },
];

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const completedCount = interventions.filter((i) => i.completed).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        {/* Back button */}
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to History
        </Link>

        {/* Trip header */}
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold">SFO → SIN</span>
                  <Badge variant="secondary">+16h shift</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Jan 28-29, 2025 • 17h flight
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day tabs */}
        <Tabs defaultValue="day-1" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto bg-transparent">
            <TabsTrigger value="day-2" className="data-[state=active]:bg-white">
              <div className="text-center">
                <div className="text-xs font-medium">Day -2</div>
                <div className="text-[10px] text-muted-foreground">Jan 26</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="day-1"
              className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <div className="text-center">
                <div className="text-xs font-medium">Day -1</div>
                <div className="text-[10px] text-muted-foreground">Jan 27</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="flight"
              className="data-[state=active]:bg-white"
            >
              <div className="text-center">
                <div className="text-xs font-medium">Flight</div>
                <div className="text-[10px] text-muted-foreground">Jan 28</div>
              </div>
            </TabsTrigger>
            <TabsTrigger
              value="arrival"
              className="data-[state=active]:bg-white"
            >
              <div className="text-center">
                <div className="text-xs font-medium">Arrival</div>
                <div className="text-[10px] text-muted-foreground">Jan 29</div>
              </div>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Today&apos;s progress</span>
            <span className="font-medium">
              {completedCount} / {interventions.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-sage transition-all"
              style={{
                width: `${(completedCount / interventions.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Intervention cards */}
        <div className="space-y-3">
          {interventions.map((intervention) => {
            const Icon = intervention.icon;
            return (
              <Card
                key={intervention.id}
                className={`bg-white/90 backdrop-blur-sm transition-opacity ${
                  intervention.completed ? "opacity-60" : ""
                }`}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Checkbox */}
                  <button
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      intervention.completed
                        ? "border-sage bg-sage text-white"
                        : "border-muted-foreground/30 hover:border-sage"
                    }`}
                  >
                    {intervention.completed && <Check className="h-4 w-4" />}
                  </button>

                  {/* Icon */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${intervention.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-medium ${
                        intervention.completed ? "line-through" : ""
                      }`}
                    >
                      {intervention.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {intervention.description}
                    </p>
                  </div>

                  {/* Time badge */}
                  <Badge variant="secondary" className="shrink-0">
                    {intervention.time}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1">
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Button className="flex-1">Sign in to Save</Button>
        </div>
      </div>
    </div>
  );
}
