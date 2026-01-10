import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { revalidatePath } from "next/cache";

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
      usesMelatonin: true,
      usesCaffeine: true,
      scheduleIntensity: true,
    },
  });

  if (!user) {
    redirect("/auth/signin?callbackUrl=/settings");
  }

  async function updatePreferences(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user?.id) return;

    const wakeTime = formData.get("wakeTime") as string;
    const sleepTime = formData.get("sleepTime") as string;
    const usesMelatonin = formData.get("usesMelatonin") === "on";
    const usesCaffeine = formData.get("usesCaffeine") === "on";

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        defaultWakeTime: wakeTime,
        defaultSleepTime: sleepTime,
        usesMelatonin,
        usesCaffeine,
      },
    });

    revalidatePath("/settings");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Your default preferences for new trips
          </p>
        </div>

        <form action={updatePreferences} className="space-y-6">
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">Sleep Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wakeTime">Usual wake time</Label>
                  <Input
                    id="wakeTime"
                    name="wakeTime"
                    type="time"
                    defaultValue={user.defaultWakeTime}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sleepTime">Usual bedtime</Label>
                  <Input
                    id="sleepTime"
                    name="sleepTime"
                    type="time"
                    defaultValue={user.defaultSleepTime}
                    className="bg-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/90 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg">
                Intervention Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="usesMelatonin">Include melatonin</Label>
                  <p className="text-muted-foreground text-sm">
                    Low-dose timed supplements (0.5mg)
                  </p>
                </div>
                <Switch
                  id="usesMelatonin"
                  name="usesMelatonin"
                  defaultChecked={user.usesMelatonin}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="usesCaffeine">Include caffeine timing</Label>
                  <p className="text-muted-foreground text-sm">
                    Strategic coffee or tea windows and cutoffs
                  </p>
                </div>
                <Switch
                  id="usesCaffeine"
                  name="usesCaffeine"
                  defaultChecked={user.usesCaffeine}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full sm:w-auto">
            Save Preferences
          </Button>
        </form>

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
