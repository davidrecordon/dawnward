import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isValidTimeFormat, DEFAULT_TIME_FORMAT } from "@/lib/time-format";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsForm } from "@/components/settings-form";

function getInitials(name: string | null | undefined): string {
  if (!name) return "U";
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      defaultWakeTime: true,
      defaultSleepTime: true,
      defaultPrepDays: true,
      usesMelatonin: true,
      usesCaffeine: true,
      usesExercise: true,
      caffeineCutoffHours: true,
      lightExposureMinutes: true,
      napPreference: true,
      scheduleIntensity: true,
      showDualTimezone: true,
      scheduleViewMode: true,
      timeFormat: true,
    },
  });

  if (!user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Your default preferences for new trips
          </p>
        </div>

        <SettingsForm
          initialPreferences={{
            defaultWakeTime: user.defaultWakeTime,
            defaultSleepTime: user.defaultSleepTime,
            defaultPrepDays: user.defaultPrepDays,
            usesMelatonin: user.usesMelatonin,
            usesCaffeine: user.usesCaffeine,
            usesExercise: user.usesExercise,
            caffeineCutoffHours: user.caffeineCutoffHours,
            lightExposureMinutes: user.lightExposureMinutes,
            napPreference: user.napPreference,
            scheduleIntensity: user.scheduleIntensity,
            showDualTimezone: user.showDualTimezone,
            scheduleViewMode: user.scheduleViewMode,
            timeFormat: isValidTimeFormat(user.timeFormat) ? user.timeFormat : DEFAULT_TIME_FORMAT,
          }}
        />

        <Card className="bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={user.image ?? undefined}
                  alt={user.name ?? ""}
                />
                <AvatarFallback className="bg-sky-100 text-sky-700">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-slate-900">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
