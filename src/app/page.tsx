import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  Calendar,
  ChevronRight,
  Coffee,
  MapPin,
  Pill,
  Plane,
  Sparkles,
} from "lucide-react";

export default function NewTripPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Hero */}
      <div className="mb-8 text-center">
        <Link href="/science">
          <Badge className="transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-orange-100 mb-4 bg-white/80 text-orange-600 border-0 font-medium shadow-sm cursor-pointer">
            <Sparkles className="mr-1 h-3 w-3" />
            Science-backed jet lag optimization
          </Badge>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Arrive ready, not wrecked
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">
          Personalized light, sleep, and caffeine schedules to shift your
          circadian rhythm before you land.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        {/* Left column: Form */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <MapPin className="h-5 w-5 text-sky-500" />
              Plan Your Trip
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your flight details to generate a personalized schedule
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Airport selects */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Departing from</Label>
                <div className="flex h-10 items-center rounded-md border bg-white px-3">
                  <span className="font-medium text-foreground">SFO</span>
                  <span className="ml-2 text-muted-foreground">
                    San Francisco
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Arriving at</Label>
                <div className="flex h-10 items-center rounded-md border bg-white px-3">
                  <span className="font-medium text-foreground">SIN</span>
                  <span className="ml-2 text-muted-foreground">Singapore</span>
                </div>
              </div>
            </div>

            {/* Datetime pickers */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Departure</Label>
                <Input
                  type="datetime-local"
                  defaultValue="2026-01-28T08:30"
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Arrival</Label>
                <Input
                  type="datetime-local"
                  defaultValue="2026-01-29T06:45"
                  className="bg-white"
                />
              </div>
            </div>

            {/* Add Connection */}
            <button className="w-full text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg py-2 hover:bg-slate-50 mb-6">
              + Add Connection
            </button>

            <hr className="border-slate-200 mb-6" />

            {/* Preferences */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground mb-4">
                Your Preferences
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50/80 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                      <Pill className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Use melatonin</p>
                      <p className="text-xs text-slate-500">
                        Low-dose timed supplements
                      </p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-orange-50/80 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
                      <Coffee className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Strategic caffeine</p>
                      <p className="text-xs text-slate-500">
                        Coffee timing recommendations
                      </p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-sky-50/80 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100">
                      <Activity className="h-4 w-4 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Include exercise</p>
                      <p className="text-xs text-slate-500">
                        Physical activity can help shift rhythms
                      </p>
                    </div>
                  </div>
                  <Switch />
                </div>
              </div>

              <hr className="border-slate-200 my-6" />

              {/* Wake/Sleep times */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usual wake time</Label>
                  <Input type="time" defaultValue="07:00" className="bg-white" />
                </div>
                <div className="space-y-2">
                  <Label>Usual sleep time</Label>
                  <Input type="time" defaultValue="23:00" className="bg-white" />
                </div>
              </div>
            </div>

            <Button className="w-full bg-sky-500 hover:bg-sky-600 text-white" size="lg">
              Generate My Schedule
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Right column: Preview cards */}
        <div className="space-y-6">
          {/* Trip Preview */}
          <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
            <CardContent className="pt-6">
              <div className="text-center mb-4">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-2xl font-bold">SFO</span>
                  <Plane className="h-5 w-5 text-sky-500 -rotate-45" />
                  <span className="text-2xl font-bold">SIN</span>
                </div>
                <p className="text-sm text-slate-500">+16h time shift</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-sky-600">2</p>
                  <p className="text-xs text-slate-500">Days before</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-orange-600">17h</p>
                  <p className="text-xs text-slate-500">Flight time</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold text-purple-600">1</p>
                  <p className="text-xs text-slate-500">Day after</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Sync */}
          <div className="bg-white/50 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
              <Calendar className="h-6 w-6 text-orange-500" />
            </div>
            <p className="font-medium">Sync to Google Calendar</p>
            <p className="text-sm text-slate-500 mb-3">
              Get reminders pushed directly to your calendar
            </p>
            <button className="px-4 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
              Connect Calendar
            </button>
          </div>

          {/* How it works */}
          <div className="p-4 rounded-xl bg-white/60 border border-purple-100">
            <p className="text-sm font-medium text-purple-700 mb-1">How it works</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Dawnward uses the Forger-Jewett-Kronauer circadian model to
              calculate optimal light exposure, melatonin timing, and caffeine
              windows based on your specific flight and sleep patterns.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
