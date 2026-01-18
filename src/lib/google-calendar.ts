import { google, calendar_v3 } from "googleapis";
import type {
  DaySchedule,
  Intervention,
  InterventionType,
} from "@/types/schedule";
import { getDisplayTime } from "@/types/schedule";

/** Default event duration in minutes when not specified */
const DEFAULT_EVENT_DURATION_MIN = 15;

/**
 * Format a Date as RFC3339 datetime string (without timezone offset).
 * Used for Google Calendar API.
 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** Reminder time in minutes by intervention type */
const REMINDER_MINUTES: Partial<Record<InterventionType, number>> = {
  // Schedule anchors - 30 min to prepare
  wake_target: 30,
  sleep_target: 30,
  exercise: 30,
  // Caffeine cutoff - last chance reminder
  caffeine_cutoff: 5,
};

const DEFAULT_REMINDER_MINUTES = 15;

/**
 * Get reminder time in minutes based on intervention type.
 * Different interventions warrant different lead times.
 */
export function getReminderMinutes(type: InterventionType): number {
  return REMINDER_MINUTES[type] ?? DEFAULT_REMINDER_MINUTES;
}

/**
 * Check if an intervention type is actionable (should create calendar event).
 * Advisory-only types like caffeine_ok don't need their own events.
 */
export function isActionableIntervention(type: InterventionType): boolean {
  // caffeine_ok is just informational - no action required
  return type !== "caffeine_ok";
}

/** Emoji lookup for intervention types */
const INTERVENTION_EMOJI: Record<InterventionType, string> = {
  wake_target: "⏰",
  sleep_target: "😴",
  melatonin: "💊",
  light_seek: "🌅",
  light_avoid: "🕶️",
  caffeine_ok: "☕",
  caffeine_cutoff: "🚫",
  exercise: "🏃",
  nap_window: "💤",
};

const DEFAULT_EMOJI = "📋";

/**
 * Get emoji for intervention type
 */
function getEmoji(type: InterventionType): string {
  return INTERVENTION_EMOJI[type] ?? DEFAULT_EMOJI;
}

/** Short label lookup for grouped event titles */
const SHORT_LABELS: Partial<Record<InterventionType, string>> = {
  light_seek: "Light",
  light_avoid: "Avoid light",
  caffeine_ok: "Caffeine",
  caffeine_cutoff: "No caffeine",
  melatonin: "Melatonin",
  exercise: "Exercise",
  nap_window: "Nap",
};

/**
 * Get short label for grouped event titles
 */
function getShortLabel(type: InterventionType): string {
  return SHORT_LABELS[type] ?? "";
}

/**
 * Determine the anchor type for a group of interventions.
 * Wake/sleep targets take priority, then melatonin, then others.
 */
function getAnchorIntervention(interventions: Intervention[]): Intervention {
  // Priority: wake_target > sleep_target > melatonin > first item
  const priority: InterventionType[] = [
    "wake_target",
    "sleep_target",
    "melatonin",
  ];

  for (const type of priority) {
    const found = interventions.find((i) => i.type === type);
    if (found) return found;
  }

  return interventions[0];
}

/**
 * Build a calendar event title from grouped interventions.
 * Examples:
 * - "⏰ Wake up: Light + Caffeine"
 * - "😴 Bedtime: Melatonin"
 * - "💊 Take melatonin"
 */
export function buildEventTitle(interventions: Intervention[]): string {
  if (interventions.length === 0) return "";

  const anchor = getAnchorIntervention(interventions);
  const emoji = getEmoji(anchor.type);

  // Single intervention - use full title
  if (interventions.length === 1) {
    return `${emoji} ${anchor.title}`;
  }

  // Multiple interventions - anchor title + short labels
  const others = interventions.filter((i) => i !== anchor);
  const otherLabels = others
    .map((i) => getShortLabel(i.type))
    .filter((label) => label !== "")
    .join(" + ");

  if (otherLabels) {
    // Shorten anchor title for grouped display
    let anchorLabel: string;
    if (anchor.type === "wake_target") {
      anchorLabel = "Wake up";
    } else if (anchor.type === "sleep_target") {
      anchorLabel = "Bedtime";
    } else {
      anchorLabel = anchor.title;
    }
    return `${emoji} ${anchorLabel}: ${otherLabels}`;
  }

  return `${emoji} ${anchor.title}`;
}

/**
 * Build event description from grouped interventions
 */
export function buildEventDescription(interventions: Intervention[]): string {
  return interventions.map((i) => `• ${i.description}`).join("\n");
}

/**
 * Group interventions by their time for smart calendar event creation.
 * Returns a map of time -> interventions at that time.
 */
export function groupInterventionsByTime(
  interventions: Intervention[]
): Map<string, Intervention[]> {
  const groups = new Map<string, Intervention[]>();

  for (const intervention of interventions) {
    // Skip non-actionable interventions
    if (!isActionableIntervention(intervention.type)) {
      continue;
    }

    const time = getDisplayTime(intervention);
    if (!groups.has(time)) {
      groups.set(time, []);
    }
    groups.get(time)!.push(intervention);
  }

  return groups;
}

/**
 * Convert an intervention group to a Google Calendar event
 */
export function buildCalendarEvent(
  interventions: Intervention[],
  date: string, // YYYY-MM-DD
  timezone: string
): calendar_v3.Schema$Event {
  if (interventions.length === 0) {
    throw new Error("Cannot build event from empty interventions");
  }

  const time = getDisplayTime(interventions[0]); // All interventions in group have same time
  const anchor = getAnchorIntervention(interventions);

  // Calculate event duration (use anchor's duration or default)
  const durationMin = anchor.duration_min ?? DEFAULT_EVENT_DURATION_MIN;

  // Create start/end DateTimes
  const startDate = new Date(`${date}T${time}:00`);
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

  // Use anchor's reminder time
  const reminderMinutes = getReminderMinutes(anchor.type);

  return {
    summary: buildEventTitle(interventions),
    description: buildEventDescription(interventions),
    start: {
      dateTime: formatDateTime(startDate),
      timeZone: timezone,
    },
    end: {
      dateTime: formatDateTime(endDate),
      timeZone: timezone,
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: reminderMinutes }],
    },
  };
}

/**
 * Create an authenticated Google Calendar API client
 */
export function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  event: calendar_v3.Schema$Event
): Promise<string> {
  const calendar = getCalendarClient(accessToken);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });

  if (!response.data.id) {
    throw new Error("Failed to create calendar event");
  }

  return response.data.id;
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch (error: unknown) {
    // Ignore 404 errors (event already deleted)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 404
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Delete multiple calendar events
 */
export async function deleteCalendarEvents(
  accessToken: string,
  eventIds: string[]
): Promise<void> {
  await Promise.all(eventIds.map((id) => deleteCalendarEvent(accessToken, id)));
}

/**
 * Create calendar events for all actionable interventions in a schedule.
 * Groups interventions by time and creates one event per group.
 * Returns array of created event IDs.
 */
export async function createEventsForSchedule(
  accessToken: string,
  interventionDays: DaySchedule[],
  destTz: string
): Promise<string[]> {
  const createdEventIds: string[] = [];

  for (const day of interventionDays) {
    const groups = groupInterventionsByTime(day.items);
    // Use destTz - each intervention carries its own timezone context
    // but for calendar events we use destination timezone for simplicity
    const timezone = destTz;

    for (const [, interventions] of groups) {
      try {
        const event = buildCalendarEvent(interventions, day.date, timezone);
        const eventId = await createCalendarEvent(accessToken, event);
        createdEventIds.push(eventId);
      } catch (error) {
        console.error("Error creating calendar event:", error);
        // Continue with other events even if one fails
      }
    }
  }

  return createdEventIds;
}

/**
 * Update a calendar event's time
 */
export async function updateCalendarEventTime(
  accessToken: string,
  eventId: string,
  newTime: string, // HH:MM
  date: string, // YYYY-MM-DD
  timezone: string,
  durationMin: number = DEFAULT_EVENT_DURATION_MIN
): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  const startDate = new Date(`${date}T${newTime}:00`);
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      start: {
        dateTime: formatDateTime(startDate),
        timeZone: timezone,
      },
      end: {
        dateTime: formatDateTime(endDate),
        timeZone: timezone,
      },
    },
  });
}
