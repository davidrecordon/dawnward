/**
 * Cron job to send scheduled flight day emails.
 *
 * Runs every 15 minutes via Vercel Cron.
 * Processes pending EmailSchedule records and sends emails.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { sendEmail, maskEmail } from "@/lib/email/client";
import {
  getPendingEmails,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/scheduler";
import {
  renderFlightDayEmail,
  renderFlightDayEmailText,
} from "@/lib/email/templates/flight-day";
import type { ScheduleResponse, DaySchedule } from "@/types/schedule";

// Flight day constant
const FLIGHT_DAY = 0;

export async function GET(request: Request) {
  // Read env vars at runtime for testability
  const emailNotificationsEnabled =
    process.env.ENABLE_FLIGHT_DAY_EMAILS === "true";
  const cronSecret = process.env.CRON_SECRET;

  // Check feature flag
  if (!emailNotificationsEnabled) {
    console.log("[Cron] Email notifications disabled, skipping");
    return NextResponse.json({ success: true, skipped: true, reason: "disabled" });
  }

  // Verify authorization - fail securely if CRON_SECRET is not configured
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Use timing-safe comparison to prevent timing attacks
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
    const pendingEmails = await getPendingEmails(50);
    console.log(`[Cron] Found ${pendingEmails.length} pending emails`);

    let sent = 0;
    let failed = 0;

    for (const emailSchedule of pendingEmails) {
      const { trip, user } = emailSchedule;

      // Skip if user or trip data is missing
      if (!user?.email || !trip?.currentScheduleJson) {
        console.warn(
          `[Cron] Skipping email ${emailSchedule.id}: missing user email or schedule`
        );
        await markEmailFailed(emailSchedule.id, "Missing user email or schedule data");
        failed++;
        continue;
      }

      // Parse the schedule JSON
      const schedule = trip.currentScheduleJson as unknown as ScheduleResponse;
      const flightDaySchedule = schedule.interventions.find(
        (day: DaySchedule) => day.day === FLIGHT_DAY
      );

      if (!flightDaySchedule) {
        console.warn(
          `[Cron] Skipping email ${emailSchedule.id}: no flight day in schedule`
        );
        await markEmailFailed(emailSchedule.id, "No flight day found in schedule");
        failed++;
        continue;
      }

      // Extract route info from routeLabel (e.g., "LAX → LHR")
      const routeParts = trip.routeLabel?.split(" → ") ?? [];
      const originCode = routeParts[0] ?? "???";
      const destCode = routeParts[1] ?? "???";

      // Parse departure/arrival times from datetime strings
      const departureTime = extractTime(trip.departureDatetime);
      const arrivalTime = extractTime(trip.arrivalDatetime);

      // Determine if this is night-before email (compare dates in origin timezone)
      const departureLocalDate = trip.departureDatetime.split("T")[0];
      const nowInOriginTz = new Date().toLocaleDateString("en-CA", {
        timeZone: trip.originTz,
      });
      const isNightBefore = departureLocalDate !== nowInOriginTz;

      // Build email props
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
        // Render email
        const html = await renderFlightDayEmail(emailProps);
        const text = renderFlightDayEmailText(emailProps);

        // Determine subject line
        const dayLabel = isNightBefore ? "[Tomorrow]" : "[Today]";
        const subject = `${dayLabel} Your jet lag plan for ${trip.routeLabel ?? "your flight"}`;

        // Send email
        const result = await sendEmail({
          to: user.email,
          subject,
          html,
          text,
        });

        if (result.success) {
          await markEmailSent(emailSchedule.id);
          sent++;
          console.log(
            `[Cron] Sent email ${emailSchedule.id} to ${maskEmail(user.email)}`
          );
        } else {
          await markEmailFailed(emailSchedule.id, result.error ?? "Unknown error");
          failed++;
          console.error(
            `[Cron] Failed to send email ${emailSchedule.id}: ${result.error}`
          );
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await markEmailFailed(emailSchedule.id, errorMessage);
        failed++;
        console.error(
          `[Cron] Exception sending email ${emailSchedule.id}: ${errorMessage}`
        );
      }
    }

    console.log(`[Cron] Completed: ${sent} sent, ${failed} failed`);

    return NextResponse.json({
      success: true,
      processed: pendingEmails.length,
      sent,
      failed,
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

/**
 * Extract HH:MM time from an ISO datetime string.
 */
function extractTime(datetime: string): string {
  // Handle ISO format: "2026-01-20T09:30:00" or with timezone
  const match = datetime.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  // Fallback
  return "00:00";
}
