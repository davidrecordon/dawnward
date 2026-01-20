/**
 * Email scheduling logic for flight day notifications.
 *
 * Calculates optimal send times and manages EmailSchedule records.
 */

import { prisma } from "@/lib/prisma";

// Default send time: 5 AM local on departure day
const DEFAULT_SEND_HOUR = 5;
const DEFAULT_SEND_MINUTE = 0;

// Minimum hours notice before first intervention
const MIN_HOURS_NOTICE = 3;

// Fallback time: 7 PM night before if not enough notice
const FALLBACK_SEND_HOUR = 19;
const FALLBACK_SEND_MINUTE = 0;

export type EmailType = "flight_day";

export interface ScheduleEmailOptions {
  tripId: string;
  userId: string;
  emailType: EmailType;
  /** Departure datetime in ISO format */
  departureDatetime: string;
  /** Origin timezone (IANA format) */
  originTz: string;
  /** Optional: first intervention time in HH:MM format */
  firstInterventionTime?: string;
}

/**
 * Calculate when to send the flight day email.
 *
 * Default: 5 AM local time on departure day
 * Fallback: 7 PM night before if <3h notice before first intervention
 *
 * @returns Object with sendAt (UTC Date) and isNightBefore flag
 */
export function calculateEmailSendTime(
  departureDatetime: string,
  originTz: string,
  firstInterventionTime?: string
): { sendAt: Date; isNightBefore: boolean } {
  // Parse departure datetime
  const departure = new Date(departureDatetime);

  // Create default send time (5 AM on departure day in origin timezone)
  const departureDate = departure.toLocaleDateString("en-CA", {
    timeZone: originTz,
  }); // YYYY-MM-DD format

  // Build 5 AM local time string
  const defaultSendLocal = `${departureDate}T${String(DEFAULT_SEND_HOUR).padStart(2, "0")}:${String(DEFAULT_SEND_MINUTE).padStart(2, "0")}:00`;

  // Convert to UTC by parsing in the origin timezone context
  // We need to calculate the UTC offset for this datetime in the origin timezone
  const defaultSendDate = parseDateInTimezone(defaultSendLocal, originTz);

  // Check if we have enough notice before first intervention
  let sendAt = defaultSendDate;
  let isNightBefore = false;

  if (firstInterventionTime) {
    // Parse first intervention time on departure day
    const firstInterventionLocal = `${departureDate}T${firstInterventionTime}:00`;
    const firstInterventionDate = parseDateInTimezone(
      firstInterventionLocal,
      originTz
    );

    // Calculate hours between send time and first intervention
    const hoursNotice =
      (firstInterventionDate.getTime() - defaultSendDate.getTime()) /
      (1000 * 60 * 60);

    // If not enough notice, send night before
    if (hoursNotice < MIN_HOURS_NOTICE) {
      // Get the day before departure
      const dayBefore = new Date(departure);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeDate = dayBefore.toLocaleDateString("en-CA", {
        timeZone: originTz,
      });

      // 7 PM night before
      const fallbackSendLocal = `${dayBeforeDate}T${String(FALLBACK_SEND_HOUR).padStart(2, "0")}:${String(FALLBACK_SEND_MINUTE).padStart(2, "0")}:00`;
      sendAt = parseDateInTimezone(fallbackSendLocal, originTz);
      isNightBefore = true;
    }
  }

  return { sendAt, isNightBefore };
}

/**
 * Parse a local datetime string in a specific timezone and return UTC Date.
 *
 * @param localDatetime - DateTime string like "2026-01-20T05:00:00"
 * @param timezone - IANA timezone like "America/Los_Angeles"
 * @returns Date object in UTC
 */
function parseDateInTimezone(localDatetime: string, timezone: string): Date {
  // Get the UTC offset for this datetime in the given timezone
  const date = new Date(localDatetime);

  // Use Intl to get the offset
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");

  let offsetMinutes = 0;
  if (offsetPart?.value) {
    // Parse "GMT-08:00" or "GMT+05:30" format
    const match = offsetPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const minutes = parseInt(match[3], 10);
      offsetMinutes = sign * (hours * 60 + minutes);
    }
  }

  // Adjust the date by subtracting the offset to get UTC
  const utcTime = date.getTime() - offsetMinutes * 60 * 1000;
  return new Date(utcTime);
}

/**
 * Schedule a flight day email for a trip.
 *
 * Creates or updates an EmailSchedule record with the calculated send time.
 *
 * @returns The created/updated EmailSchedule record
 */
export async function scheduleFlightDayEmail(
  options: ScheduleEmailOptions
): Promise<{ id: string; scheduledFor: Date; isNightBefore: boolean }> {
  const { tripId, userId, emailType, departureDatetime, originTz, firstInterventionTime } =
    options;

  const { sendAt, isNightBefore } = calculateEmailSendTime(
    departureDatetime,
    originTz,
    firstInterventionTime
  );

  // Upsert the email schedule (unique on tripId + userId + emailType)
  const emailSchedule = await prisma.emailSchedule.upsert({
    where: {
      tripId_userId_emailType: {
        tripId,
        userId,
        emailType,
      },
    },
    update: {
      scheduledFor: sendAt,
      sentAt: null, // Reset if rescheduling
      failedAt: null,
      errorMessage: null,
    },
    create: {
      tripId,
      userId,
      emailType,
      scheduledFor: sendAt,
    },
  });

  console.log(
    `[EmailScheduler] Scheduled ${emailType} email for trip ${tripId} at ${sendAt.toISOString()}${isNightBefore ? " (night before)" : ""}`
  );

  return {
    id: emailSchedule.id,
    scheduledFor: emailSchedule.scheduledFor,
    isNightBefore,
  };
}

/**
 * Cancel a scheduled email for a trip.
 *
 * @returns true if an email was cancelled, false if none existed
 */
export async function cancelScheduledEmail(
  tripId: string,
  userId: string,
  emailType: EmailType
): Promise<boolean> {
  try {
    await prisma.emailSchedule.delete({
      where: {
        tripId_userId_emailType: {
          tripId,
          userId,
          emailType,
        },
      },
    });
    console.log(
      `[EmailScheduler] Cancelled ${emailType} email for trip ${tripId}`
    );
    return true;
  } catch {
    // Record doesn't exist - that's fine
    return false;
  }
}

/**
 * Get pending emails that are due to be sent.
 *
 * @param limit - Maximum number of emails to fetch
 * @returns Array of pending EmailSchedule records with trip and user data
 */
export async function getPendingEmails(limit = 50) {
  const now = new Date();

  return prisma.emailSchedule.findMany({
    where: {
      scheduledFor: {
        lte: now,
      },
      sentAt: null,
      failedAt: null,
    },
    include: {
      trip: true,
      user: true,
    },
    orderBy: {
      scheduledFor: "asc",
    },
    take: limit,
  });
}

/**
 * Mark an email as sent.
 */
export async function markEmailSent(emailScheduleId: string): Promise<void> {
  await prisma.emailSchedule.update({
    where: { id: emailScheduleId },
    data: { sentAt: new Date() },
  });
}

/**
 * Mark an email as failed.
 */
export async function markEmailFailed(
  emailScheduleId: string,
  errorMessage: string
): Promise<void> {
  await prisma.emailSchedule.update({
    where: { id: emailScheduleId },
    data: {
      failedAt: new Date(),
      errorMessage,
    },
  });
}

/**
 * Check if a user has email notifications enabled.
 */
export async function userHasEmailNotifications(
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailNotifications: true },
  });
  return user?.emailNotifications ?? false;
}
