/**
 * Cron job to send flight day emails.
 *
 * Runs every 15 minutes via Vercel Cron.
 * Queries trips directly — no separate scheduling table needed.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sendEmail, maskEmail } from "@/lib/email/client";
import {
  renderFlightDayEmail,
  renderFlightDayEmailText,
} from "@/lib/email/templates/flight-day";
import type { ScheduleResponse, DaySchedule } from "@/types/schedule";

// Flight day constant
const FLIGHT_DAY = 0;

// Default send time: 5 AM local on departure day
const DEFAULT_SEND_HOUR = 5;

// Minimum hours notice before first intervention
const MIN_HOURS_NOTICE = 3;

// Fallback time: 7 PM night before if not enough notice
const FALLBACK_SEND_HOUR = 19;

// How far ahead to look for upcoming departures (hours)
const LOOKAHEAD_HOURS = 36;

/**
 * Calculate when to send the flight day email.
 *
 * Default: 5 AM local time on departure day.
 * Fallback: 7 PM night before if <3h notice before first intervention.
 */
export function calculateEmailSendTime(
  departureDatetime: string,
  originTz: string,
  firstInterventionTime?: string
): { sendAt: Date; isNightBefore: boolean } {
  const departureDate = departureDatetime.split("T")[0];

  const defaultSendLocal = `${departureDate}T${String(DEFAULT_SEND_HOUR).padStart(2, "0")}:00:00`;
  const defaultSendDate = parseDateInTimezone(defaultSendLocal, originTz);

  let sendAt = defaultSendDate;
  let isNightBefore = false;

  if (firstInterventionTime) {
    const firstInterventionLocal = `${departureDate}T${firstInterventionTime}:00`;
    const firstInterventionDate = parseDateInTimezone(
      firstInterventionLocal,
      originTz
    );

    const hoursNotice =
      (firstInterventionDate.getTime() - defaultSendDate.getTime()) /
      (1000 * 60 * 60);

    if (hoursNotice < MIN_HOURS_NOTICE) {
      const departureMidnight = parseDateInTimezone(
        `${departureDate}T00:00:00`,
        originTz
      );
      const dayBeforeMidnight = new Date(
        departureMidnight.getTime() - 24 * 60 * 60 * 1000
      );
      const dayBeforeDate = dayBeforeMidnight.toLocaleDateString("en-CA", {
        timeZone: originTz,
      });

      const fallbackSendLocal = `${dayBeforeDate}T${String(FALLBACK_SEND_HOUR).padStart(2, "0")}:00:00`;
      sendAt = parseDateInTimezone(fallbackSendLocal, originTz);
      isNightBefore = true;
    }
  }

  return { sendAt, isNightBefore };
}

/**
 * Parse a local datetime string in a specific timezone and return UTC Date.
 */
function parseDateInTimezone(localDatetime: string, timezone: string): Date {
  const asUTC = new Date(localDatetime + "Z");

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(asUTC);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");

  let offsetMinutes = 0;
  if (offsetPart?.value) {
    const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const minutes = parseInt(match[3], 10);
      offsetMinutes = sign * (hours * 60 + minutes);
    }
  }

  const utcTime = asUTC.getTime() - offsetMinutes * 60 * 1000;
  return new Date(utcTime);
}

/**
 * Extract HH:MM time from an ISO datetime string.
 */
function extractTime(datetime: string): string {
  const match = datetime.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  return "00:00";
}

/**
 * Get the first intervention time from a schedule's flight day.
 */
function getFirstInterventionTime(
  schedule: ScheduleResponse
): string | undefined {
  const flightDay = schedule.interventions.find(
    (day: DaySchedule) => day.day === FLIGHT_DAY
  );
  if (!flightDay || flightDay.items.length === 0) return undefined;
  // Items are sorted by time; use origin_time since we're still at origin
  return flightDay.items[0].origin_time;
}

export async function GET(request: Request) {
  const emailNotificationsEnabled =
    process.env.ENABLE_FLIGHT_DAY_EMAILS === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (!emailNotificationsEnabled) {
    console.log("[Cron] Email notifications disabled, skipping");
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "disabled",
    });
  }

  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${cronSecret}`;
  const isValidAuth =
    authHeader.length === expectedAuth.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedAuth));

  if (!isValidAuth) {
    console.error("[Cron] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] Starting email send job");

  try {
    const now = new Date();
    const lookaheadEnd = new Date(
      now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000
    );

    // Find trips departing in the next 36 hours that haven't been emailed
    const candidateTrips = await prisma.sharedSchedule.findMany({
      where: {
        userId: { not: null },
        flightDayEmailSentAt: null,
        currentScheduleJson: { not: Prisma.JsonNullValueFilter.JsonNull },
        user: {
          emailNotifications: true,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            use24HourFormat: true,
          },
        },
      },
    });

    // Filter by departure time (stored as string, need to parse)
    const dueTrips = candidateTrips.filter((trip) => {
      const depDate = new Date(trip.departureDatetime);
      return depDate >= now && depDate <= lookaheadEnd;
    });

    console.log(
      `[Cron] Found ${dueTrips.length} candidate trips (from ${candidateTrips.length} unsent)`
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const trip of dueTrips) {
      const { user } = trip;
      if (!user?.email) {
        console.warn(`[Cron] Trip ${trip.id}: missing user email, skipping`);
        skipped++;
        continue;
      }

      const schedule = trip.currentScheduleJson as unknown as ScheduleResponse;
      const flightDaySchedule = schedule.interventions.find(
        (day: DaySchedule) => day.day === FLIGHT_DAY
      );

      if (!flightDaySchedule) {
        console.warn(
          `[Cron] Trip ${trip.id}: no flight day in schedule, skipping`
        );
        skipped++;
        continue;
      }

      // Calculate send time at runtime
      const firstInterventionTime = getFirstInterventionTime(schedule);
      const { sendAt, isNightBefore } = calculateEmailSendTime(
        trip.departureDatetime,
        trip.originTz,
        firstInterventionTime
      );

      // Not due yet
      if (sendAt > now) {
        skipped++;
        continue;
      }

      // Extract route info
      const routeParts = trip.routeLabel?.split(" → ") ?? [];
      const originCode = routeParts[0] ?? "???";
      const destCode = routeParts[1] ?? "???";
      const departureTime = extractTime(trip.departureDatetime);
      const arrivalTime = extractTime(trip.arrivalDatetime);

      const emailProps = {
        userName: user.name ?? undefined,
        flightDaySchedule,
        routeLabel: trip.routeLabel ?? `${originCode} → ${destCode}`,
        departureTime,
        arrivalTime,
        originCode,
        destCode,
        use24Hour: user.use24HourFormat,
        isNightBefore,
        tripId: trip.id,
      };

      try {
        const html = await renderFlightDayEmail(emailProps);
        const text = renderFlightDayEmailText(emailProps);

        const dayLabel = isNightBefore ? "[Tomorrow]" : "[Today]";
        const subject = `${dayLabel} Your jet lag plan for ${trip.routeLabel ?? "your flight"}`;

        const result = await sendEmail({
          to: user.email,
          subject,
          html,
          text,
        });

        if (result.success) {
          await prisma.sharedSchedule.update({
            where: { id: trip.id },
            data: { flightDayEmailSentAt: now },
          });
          sent++;
          console.log(
            `[Cron] Sent flight day email for trip ${trip.id} to ${maskEmail(user.email)}`
          );
        } else {
          failed++;
          console.error(
            `[Cron] Failed to send email for trip ${trip.id}: ${result.error}`
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        failed++;
        console.error(
          `[Cron] Exception sending email for trip ${trip.id}: ${errorMessage}`
        );
      }
    }

    console.log(
      `[Cron] Completed: ${sent} sent, ${failed} failed, ${skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      processed: dueTrips.length,
      sent,
      failed,
      skipped,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cron] Job failed:", errorMessage);
    return NextResponse.json(
      { error: "Job failed", message: errorMessage },
      { status: 500 }
    );
  }
}
